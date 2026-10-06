import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sourcePath = new URL('../../data/party-games.json', import.meta.url);
const outputPath = new URL('../src/know-me-catalog.json', import.meta.url);
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
assert.equal(source.version, 1, 'Unsupported party catalog version');
assert.ok(Array.isArray(source.knowMe?.questions), 'Know Me catalog is missing');
const ids = new Set();
for (const item of source.knowMe.questions) {
  assert.match(item.id, /^km-[a-z0-9-]{2,64}$/u);
  assert.ok(!ids.has(item.id), `Duplicate question ${item.id}`);
  ids.add(item.id);
  for (const lang of ['en', 'ar']) {
    assert.ok(typeof item.text?.[lang] === 'string' && item.text[lang].trim() && item.text[lang].length <= 500, `Invalid ${lang} question ${item.id}`);
    assert.equal(item.options?.length, 4, `Question ${item.id} needs four choices`);
    const choices = item.options.map(choice => choice[lang]);
    assert.ok(choices.every(choice => typeof choice === 'string' && choice.trim() && choice.length <= 160), `Invalid ${lang} choices ${item.id}`);
    assert.equal(new Set(choices.map(choice => choice.normalize('NFKC').trim().toLocaleLowerCase('en-US'))).size, 4, `Duplicate ${lang} choices ${item.id}`);
  }
  assert.ok(!('answer' in item) && !('correctIndex' in item), 'Party questions must not have a universal answer');
}
assert.ok(ids.size >= 10, 'At least ten Know Me questions are required');
const projected = `${JSON.stringify({ version: source.version, questions: source.knowMe.questions })}\n`;
if (process.argv.includes('--check')) {
  assert.ok(await readFile(outputPath, 'utf8') === projected, 'Know Me Worker catalog is stale; run node worker/scripts/generate-know-me-catalog.mjs');
  console.log(`Know Me Worker catalog is current (${ids.size} questions).`);
} else {
  await writeFile(outputPath, projected);
  console.log(`Generated ${fileURLToPath(outputPath)} (${ids.size} questions).`);
}
