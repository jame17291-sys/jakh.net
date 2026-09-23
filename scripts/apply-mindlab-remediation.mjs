import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'docs/content-review/mindlab-remediation-2026-09-23.json'),'utf8'));
const apply = process.argv.includes('--apply');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const replacements = new Map(manifest.changes.map(c=>[c.id,c]));
const writes = [];
let pending = 0, current = 0;
for (const topic of manifest.scope) {
  const filename = path.join(root,'data',`${topic.slug}.json`);
  const text = fs.readFileSync(filename,'utf8');
  const cards = JSON.parse(text);
  if (JSON.stringify(cards.map(c=>c.id)) !== JSON.stringify(topic.ids)) throw new Error(`IDs/order changed: ${topic.slug}`);
  let changed = false;
  for (const card of cards) {
    const fix = replacements.get(card.id);
    if (!fix) continue;
    const signature = hash(card);
    if (signature === fix.afterHash) { current++; continue; }
    if (signature !== fix.beforeHash && signature !== fix.supersedesHash) throw new Error(`Refusing to overwrite concurrent edits: ${card.id}`);
    pending++;
    for (const [field,value] of Object.entries(fix.patch)) {
      if (value === null) delete card[field]; else card[field] = structuredClone(value);
    }
    if (hash(card) !== fix.afterHash) throw new Error(`Invalid patch digest: ${card.id}`);
    changed = true;
  }
  if (changed) writes.push([filename,`${JSON.stringify(cards,null,2)}\n`]);
}
const catalogPath = path.join(root,'data/catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath,'utf8'));
let descriptionsPending = false;
for (const [slug,fields] of Object.entries(manifest.categoryChanges)) {
  const category = catalog.categories.find(c=>c.slug===slug);
  if (!category) throw new Error(`Missing category ${slug}`);
  for (const [key,value] of Object.entries(fields)) {
    if (JSON.stringify(category[key]) !== JSON.stringify(value)) descriptionsPending = true;
    category[key] = value;
  }
}
if (descriptionsPending) writes.push([catalogPath,`${JSON.stringify(catalog,null,2)}\n`]);
// Validate every digest before writing any file. The operation is idempotent;
// rerunning cannot silently overwrite a subsequent author's changes.
if (apply) {
  for (const [filename,contents] of writes) fs.writeFileSync(filename,contents);
  console.log(`Applied ${pending} card changes; ${current} already current. Run catalog, index and audit-ledger generators next.`);
} else {
  console.log(`${current}/${manifest.counts.changedQuestions} repaired cards current; ${pending} pending.`);
  if (pending || descriptionsPending) process.exitCode = 1;
}
