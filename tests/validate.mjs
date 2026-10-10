import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const files = ["index.html", "css/style.css", "js/app.js", "data/manual.json", "manifest.json", "service-worker.js", "assets/icons/icon.svg", "assets/icons/icon-192.png", "assets/icons/icon-512.png"];
await Promise.all(files.map((file) => stat(path.join(root, file))));
const [html, app, dataText, manifestText, sw] = await Promise.all([read("index.html"), read("js/app.js"), read("data/manual.json"), read("manifest.json"), read("service-worker.js")]);
const manual = JSON.parse(dataText);
const manifest = JSON.parse(manifestText);

assert.equal(manual.machine.machineId, "401");
assert.equal(manual.machine.machineName, "401激光焊机");
assert.equal(manual.machine.manualVersion, "0.3.4");
assert.equal(manual.faults.length, 5);
assert.equal(manual.faults[0].id, "double-cut-scrap-belt-speed");
const guide = manual.faults[0].guide;
assert.deepEqual(guide.filter(block => block.step).map(block => block.step), ["1", "2", "3"]);
for (const block of guide.filter(block => block.image)) {
  await stat(path.join(root, block.image));
  assert.ok(sw.includes(`"${block.image}"`));
}
assert.deepEqual(manual.maintenance.map(item => item.id), ["gas-nozzle-cleaning", "scissors-cleaning", "secondary-scrap-cleaning", "clamp-air-cleaning", "car-rail-cleaning", "guide-wheel-cleaning", "segment-focus-check", "focus-position-adjustment"]);
assert.ok(manual.maintenance.slice(2, 6).every(item => item.guide.every(block => !block.image && !block.images)), "原有四项维护不应带图片");
const focus = manual.maintenance[6];
assert.equal(focus.approvalStatus, "pending-site-confirmation");
assert.deepEqual(focus.guide.map(block => block.step), ["01", "02", "03"]);
assert.equal(focus.guide[0].image, "./assets/images/focus-check-overview.png");
assert.equal(focus.guide[1].image, "./assets/images/focus-check-adjustment.png");
assert.equal(focus.guide[2].image, focus.guide[1].image);
assert.equal(focus.guide[2].title, "退出段焊模式");
assert.doesNotMatch(JSON.stringify(focus.guide), /进行焦点位置检查（待现场确认）/);
assert.doesNotMatch(html.match(/<section id="maintenance-detail"[\s\S]*?<\/section>/)[0], /本地草稿 · 待现场确认/);
assert.doesNotMatch(JSON.stringify(focus), /\d+\s*(?:mm|μm|W|kW|m\/min|秒)/);
assert.match(JSON.stringify(focus), /模式切换不等于允许激光发射/);
assert.match(JSON.stringify(focus), /退出段焊模式不代表设备已自动满足/);
assert.match(html, /id="maintenance-detail"/);
assert.match(app, /function detailFromHash/);
const adjustment = manual.maintenance[7];
assert.equal(adjustment.approvalStatus, "pending-site-confirmation");
assert.deepEqual(adjustment.guide.map(block => block.step), ["01", "02", "03"]);
assert.match(adjustment.guide[0].paragraphs.join(""), /剪刀调整/);
assert.doesNotMatch(adjustment.guide[0].paragraphs.join(""), /设备调整/);
assert.doesNotMatch(JSON.stringify(adjustment), /进入夹钳台补偿画面|待补充入口截图及现场确认/);
assert.doesNotMatch(html.match(/<section id="focus-adjustment-detail"[\s\S]*?<\/section>/)[0], /本地草稿 · 待现场确认/);
assert.match(JSON.stringify(adjustment), /仅为截图示例，不代表标准值或目标值/);
assert.match(JSON.stringify(adjustment), /不得未经确认直接同时修改两侧参数/);
assert.equal(adjustment.guide[2].images.length, 1);
assert.equal(adjustment.guide[2].title, "接受补偿值");
assert.equal(adjustment.guide[2].images[0].image, "./assets/images/focus-adjustment-accept.png");
assert.ok(!adjustment.guide[2].paragraphs);
assert.doesNotMatch(JSON.stringify(adjustment.guide[2]), /具体确认、复查及退出流程待现场确认/);
for (const image of adjustment.guide.flatMap(block => block.images || [])) {
  await stat(path.join(root, image.image)); assert.ok(sw.includes(`"${image.image}"`));
}
for (const item of manual.maintenance) {
  for (const block of item.guide.filter(block => block.image)) {
    await stat(path.join(root, block.image));
    assert.ok(sw.includes(`"${block.image}"`));
  }
}
assert.deepEqual(manual.safety, []);
const filter = manual.faults[1];
assert.equal(filter.id, "circulation-pump-filter-alarm");
assert.deepEqual(filter.guide.filter(block => block.step).map(block => block.step), ["1", "2", "3", "4"]);
assert.doesNotMatch(JSON.stringify(filter), /顺时针|逆时针/);
assert.match(JSON.stringify(filter), /可不停泵操作/);
const filterImages = [...new Set(filter.guide.map(block => block.image).filter(Boolean))];
assert.equal(filterImages.length, 2);
for (const image of filterImages) { await stat(path.join(root, image)); assert.ok(sw.includes(`"${image}"`)); }
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.deepEqual(manual.notices, []);
assert.match(sw, /const CACHE_NAME = "welding-guide-401-v22"/);
assert.match(html, /id="currentTime"/);
assert.match(html, /system-time\.js\?v=1/);
assert.match(sw, /system-time\.js\?v=1/);
for (const entry of manual.faults.slice(2, 4)) {
  const steps = entry.guide.filter(block => block.step);
  assert.deepEqual(steps.map(block => block.step), ["1", "2", "3", "4", "5", "6"]);
  for (const step of steps) { await stat(path.join(root, step.image)); assert.ok(sw.includes(`"${step.image}"`)); }
}
assert.match(sw, /const CACHE_PREFIX = "welding-guide-401-"/);
const cooling = manual.faults[4];
assert.equal(cooling.id, "cooling-water-switch");
assert.deepEqual(cooling.guide.filter(block => block.step).map(block => block.step), ["01", "02", "03", "04", "05"]);
assert.match(JSON.stringify(cooling), /12个阀门全部逆时针旋转90°/);
assert.doesNotMatch(JSON.stringify(cooling), /顺时针|停顿片刻|无流量|压力值/);
for (const block of cooling.guide.filter(block => block.image)) {
  await stat(path.join(root, block.image));
  assert.ok(sw.includes(`"${block.image}"`));
}
assert.match(JSON.stringify(cooling), /切换阀站在焊机入口传动侧/);
assert.equal(cooling.guide.find(block => block.step === "01").images.length, 1);
assert.equal(cooling.guide.find(block => block.step === "02").image, "./assets/images/cooling-water-stop-selectors.png");
for (const picture of cooling.guide.flatMap(block => block.images || [])) {
  await stat(path.join(root, picture.image));
  assert.ok(sw.includes(`"${picture.image}"`));
}
assert.match(sw, /\.\/data\/manual\.json/);
assert.match(app, /fetch\("\.\/data\/manual\.json"/);
assert.match(html, /data-section="faults"/);
assert.match(html, /id="image-modal"/);

const combined = `${html}\n${app}\n${dataText}\n${manifestText}\n${sw}`;
assert.doesNotMatch(combined, /boxsteerr-pixel\.github\.io\/welding-guide\//, "不得引用101线上资源");
assert.doesNotMatch(combined, /(?:src|href)=["']\/welding-guide\//, "不得硬编码101路径");
console.log("welding-guide-401 validation: PASS");
