import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = 'http://127.0.0.1:4195/welding-guide-401/';
const listeners = {}, stores = new Map(), attempts = new Map(), progress = [];
let offline = false, failImage = '', active = 0, peak = 0;
const key = request => typeof request === 'string' ? request : request.url;
async function readResource(request) {
  const url = key(request);
  if (offline) throw Error('Simulated offline');
  attempts.set(url, (attempts.get(url) || 0) + 1);
  if (url === failImage) throw Error('Simulated flaky image');
  active++; peak = Math.max(peak, active);
  try {
    const relative = decodeURIComponent(new URL(url).pathname.slice(new URL(base).pathname.length)) || 'index.html';
    return new Response(await fs.readFile(path.join(root, relative)));
  } finally { active--; }
}
const caches = {
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async addAll(urls) { for (const url of urls) store.set(url, await readResource(url)); },
      async put(request, response) { store.set(key(request), response.clone()); },
      async match(request) { const response = store.get(key(request)); return response && response.clone(); }
    };
  },
  async match(request) { for (const store of stores.values()) { const r = store.get(key(request)); if (r) return r.clone(); } },
  async keys() { return [...stores.keys()]; },
  async delete(name) { return stores.delete(name); }
};
stores.set('welding-guide-401-v23', new Map());
stores.set('welding-guide-home-v41', new Map());
const self = { location: {href: base + 'service-worker.js', origin: new URL(base).origin}, clients: { async claim() {} }, addEventListener: (type, handler) => listeners[type] = handler };
vm.runInNewContext(await fs.readFile(path.join(root, 'service-worker.js'), 'utf8'), {
  self, caches, URL, AbortController, fetch: readResource,
  setTimeout: (fn, ms) => setTimeout(fn, ms >= 10000 ? ms : 0), clearTimeout
});
let task;
listeners.install({waitUntil(promise) { task = promise; }}); await task;
assert.ok(![...attempts.keys()].some(url => url.endsWith('.webp')), 'install must not download manual images');
listeners.activate({waitUntil(promise) { task = promise; }}); await task;
assert.ok(stores.has('welding-guide-401-v23'), 'old cache retained until media complete');
const manual = JSON.parse(await fs.readFile(path.join(root, 'data/manual.json'), 'utf8'));
const images = [...new Set([...manual.faults, ...manual.maintenance].flatMap(item => item.guide || item.steps || []).flatMap(block => [block.image, ...(block.images || []).map(picture => picture.image)]).filter(Boolean).map(image => image.replace(/^\.\//, '').replace(/assets\/images\/([^/]+)\.png$/, 'assets/images/optimized/$1.webp')))];
async function background() {
  listeners.message({data: {type: 'CACHE_MEDIA'}, source: {postMessage(message) { progress.push(message); }}, waitUntil(promise) { task = promise; }});
  await task;
}
failImage = base + images[0];
await background();
assert.equal(attempts.get(failImage), 2, 'failed download retried once, not infinitely');
assert.equal(progress.at(-1).completed, images.length - 1);
assert.ok(stores.has('welding-guide-401-v23'), 'partial cache does not delete old resources');
const successfulImage = base + images[1], successfulAttempts = attempts.get(successfulImage);
failImage = ''; await background();
assert.equal(attempts.get(successfulImage), successfulAttempts, 'resume skips completed images');
assert.equal(progress.at(-1).completed, images.length);
assert.equal(peak, 1, 'background images download sequentially');
assert.ok(!stores.has('welding-guide-401-v23'));
assert.ok(stores.has('welding-guide-home-v41'), 'other sites caches untouched');
offline = true;
for (const file of ['index.html', 'data/manual.json', ...images]) {
  let response;
  listeners.fetch({request: {url: base + file, method: 'GET', mode: 'cors', destination: /\.(webp|jpg)$/.test(file) ? 'image' : file.endsWith('.html') ? 'document' : ''}, respondWith(promise) { response = promise; }});
  const result = await response;
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), await fs.readFile(path.join(root, file)));
}
console.log('PASS: core-only install, sequential media caching, bounded retry, resumable failures, old-cache protection, isolated cleanup, all 30 optimized/existing images available offline (SW simulation).');
