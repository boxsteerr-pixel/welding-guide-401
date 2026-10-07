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
assert.equal(manual.machine.manualVersion, "0.2.0");
assert.equal(manual.faults.length, 4);
assert.equal(manual.faults[0].id, "double-cut-scrap-belt-speed");
const guide = manual.faults[0].guide;
assert.deepEqual(guide.filter(block => block.step).map(block => block.step), ["1", "2", "3"]);
for (const block of guide.filter(block => block.image)) {
  await stat(path.join(root, block.image));
  assert.ok(sw.includes(`"${block.image}"`));
}
assert.deepEqual(manual.maintenance, []);
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
assert.match(sw, /const CACHE_NAME = "welding-guide-401-v12"/);
for (const entry of manual.faults.slice(2)) {
  const steps = entry.guide.filter(block => block.step);
  assert.deepEqual(steps.map(block => block.step), ["1", "2", "3", "4", "5", "6"]);
  for (const step of steps) { await stat(path.join(root, step.image)); assert.ok(sw.includes(`"${step.image}"`)); }
}
assert.match(sw, /const CACHE_PREFIX = "welding-guide-401-"/);
assert.match(sw, /\.\/data\/manual\.json/);
assert.match(app, /fetch\("\.\/data\/manual\.json"/);
assert.match(html, /data-section="faults"/);
assert.match(html, /id="image-modal"/);

const combined = `${html}\n${app}\n${dataText}\n${manifestText}\n${sw}`;
assert.doesNotMatch(combined, /boxsteerr-pixel\.github\.io\/welding-guide\//, "不得引用101线上资源");
assert.doesNotMatch(combined, /(?:src|href)=["']\/welding-guide\//, "不得硬编码101路径");
console.log("welding-guide-401 validation: PASS");
