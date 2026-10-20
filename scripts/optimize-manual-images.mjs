import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = new URL('../', import.meta.url);
const manual = JSON.parse(await fs.readFile(new URL('data/manual.json', root), 'utf8'));
const blocks = [...manual.faults, ...manual.maintenance, ...manual.safety].flatMap(item => item.guide || item.steps || []);
const files = [...new Set(blocks.flatMap(block => [block.image, ...(block.images || []).map(image => image.image)]).filter(Boolean))];
await fs.mkdir(new URL('assets/images/optimized/', root), {recursive: true});
let original = 0, optimized = 0, converted = 0;
for (const file of files) {
  const source = await fs.readFile(new URL(file, root)); original += source.length;
  if (!file.endsWith('.png')) { optimized += source.length; continue; }
  const output = new URL('assets/images/optimized/' + file.split('/').pop().replace(/\.png$/, '.webp'), root);
  // Keep full resolution and all original equipment/annotation content. PNG originals remain untouched.
  const result = await sharp(source).webp({quality: 92, effort: 6}).toBuffer();
  const before = await sharp(source).metadata(), after = await sharp(result).metadata();
  if (before.width !== after.width || before.height !== after.height) throw Error('Dimensions changed: ' + file);
  await fs.writeFile(output, result); optimized += result.length; converted++;
  console.log(`${file}: ${source.length} -> ${result.length} bytes; ${before.width}x${before.height}`);
}
console.log(JSON.stringify({images: files.length, converted, originalMB: original / 1048576, optimizedMB: optimized / 1048576, reductionPercent: (1 - optimized / original) * 100}));
