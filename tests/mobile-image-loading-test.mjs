import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_BASE || 'http://127.0.0.1:4195/welding-guide-401/';
const browser = await chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/assets/images/')) requests.push(request.url()); });
  await page.goto(base + '#section=faults');
  await page.waitForSelector('#fault-list details');
  assert.equal(requests.length, 0, 'closed entries and hidden detail pages must not download all images');
  const entry = page.locator('#fault-list details').first();
  await entry.locator('summary').click();
  const image = entry.locator('img').first();
  await image.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => { const img = document.querySelector('#fault-list img'); return img.complete && img.naturalWidth > 0; });
  assert.ok((await image.getAttribute('src')).includes('/optimized/'));
  assert.ok(requests.length < 30);
  const position = await page.evaluate(() => scrollY);
  await image.click();
  await page.waitForFunction(() => !document.querySelector('#image-modal').hidden && document.querySelector('#modal-image').naturalWidth > 0);
  await page.locator('.image-modal__close').click();
  await page.waitForFunction(() => document.querySelector('#image-modal').hidden);
  await page.waitForTimeout(150);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - position) <= 2, 'close preserves scroll fix');
  await page.screenshot({path: fileURLToPath(new URL('./mobile-image-loading.png', import.meta.url))});
  for (const viewport of [{width: 390, height: 844}, {width: 768, height: 1024}, {width: 1280, height: 900}]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow: ' + viewport.width);
  }
  await page.setViewportSize({width: 390, height: 844});
  for (const [id, section] of [['segment-focus-check', 'maintenance-detail'], ['focus-position-adjustment', 'focus-adjustment-detail']]) {
    await page.goto(base + '#section=maintenance&item=' + id);
    const detail = page.locator('#' + section);
    await page.waitForSelector('#' + section + '.active img');
    const detailImage = detail.locator('img').first();
    await detailImage.scrollIntoViewIfNeeded();
    await page.waitForFunction(selector => { const img = document.querySelector(selector); return img.complete && img.naturalWidth > 0; }, '#' + section + ' img');
    assert.ok((await detailImage.getAttribute('src')).includes('/optimized/'));
    await detail.locator('[data-go="maintenance"]').click();
    await page.waitForSelector('#maintenance.active');
  }
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once: true}));
    navigator.serviceWorker.controller.postMessage({type: 'CACHE_MEDIA'});
  });
  await page.waitForFunction(() => document.querySelector('#offline-progress').textContent === '离线图片已就绪', {timeout: 45000});
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#maintenance-list details');
  const count = await page.evaluate(async () => {
    const m = await (await fetch('./data/manual.json')).json();
    const files = [...new Set([...m.faults, ...m.maintenance].flatMap(item => item.guide || []).flatMap(block => [block.image, ...(block.images || []).map(picture => picture.image)]).filter(Boolean).map(image => image.replace(/assets\/images\/([^/]+)\.png$/, 'assets/images/optimized/$1.webp')))];
    for (const file of files) { const response = await fetch(file); if (!response.ok || !(await response.arrayBuffer()).byteLength) throw Error(file); }
    return files.length;
  });
  assert.equal(count, 30);
  await context.close();
  const retryContext = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'block'});
  const retryPage = await retryContext.newPage();
  let fail = true;
  await retryPage.route('**/optimized/scrap-belt-location.webp', route => fail ? route.abort() : route.continue());
  await retryPage.goto(base + '#section=faults');
  await retryPage.locator('#fault-list details').first().locator('summary').click();
  await retryPage.locator('#fault-list img').first().scrollIntoViewIfNeeded();
  const retry = retryPage.locator('#fault-list .image-retry').first();
  await retry.waitFor({state: 'visible'});
  fail = false; await retry.click();
  await retryPage.waitForFunction(() => document.querySelector('#fault-list img').naturalWidth > 0);
  assert.ok(await retry.isHidden());
  assert.deepEqual(errors, []);
  await retryContext.close();
  console.log('PASS: mobile/tablet/desktop layout; on-demand images; modal and preserved scroll; both independent maintenance routes/back buttons; failed-image retry; all 30 images after actual Chrome offline reload.');
} finally { await browser.close(); }
