import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, "catalog.json"), "utf8"));
const index = {};

for (const category of catalog.categories || []) {
  const source = JSON.parse(
    fs.readFileSync(path.join(dataDir, `${category.slug}.json`), "utf8"),
  );
  const cards = Array.isArray(source) ? source : source.cards;
  if (!Array.isArray(cards)) throw new Error(`Invalid card data for ${category.slug}`);

  for (const card of cards) {
    if (!card?.id || !card?.difficulty) {
      throw new Error(`Invalid card in ${category.slug}`);
    }
    if (index[card.id]) throw new Error(`Duplicate card id: ${card.id}`);
    index[card.id] = [category.slug, card.difficulty];
  }
}

const serialized = `${JSON.stringify(index)}\n`;
const targets = [
  path.join(dataDir, "card-index.json"),
  path.join(root, "worker", "src", "card-index.json"),
];
for (const target of targets) fs.writeFileSync(target, serialized);
console.log(`Generated card indexes with ${Object.keys(index).length} cards.`);
