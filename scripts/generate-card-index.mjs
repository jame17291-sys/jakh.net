import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cardMoveHistory, readTopicMergeLedger } from "./topic-merge-ledger.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, "catalog.json"), "utf8"));
const index = {};

for (const category of catalog.categories || []) {
  const source = JSON.parse(
    fs.readFileSync(path.join(dataDir, `${category.slug}.json`), "utf8"),
  );
  if (!Array.isArray(source)) throw new Error(`Invalid card data for ${category.slug}`);
  const cards = source;

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
// Cards keep their ids when a topic is merged or a card moves topic; the API
// recognises progress and edits saved under a card's former topic.
const moves = cardMoveHistory(readTopicMergeLedger());
for (const [cardId, formerCategories] of Object.entries(moves.formerCategories)) {
  if (!index[cardId]) throw new Error(`Moved card is missing from the card index: ${cardId}`);
  if (formerCategories.includes(index[cardId][0])) throw new Error(`Moved card still lists its current topic as former: ${cardId}`);
  if (moves.currentCategories[cardId] !== index[cardId][0]) throw new Error(`Moved card is not in its recorded topic: ${cardId}`);
}
for (const [retired, successor] of Object.entries(moves.retiredCategories)) {
  if (catalog.categories.some((category) => category.slug === retired)) throw new Error(`Retired topic is still in the catalog: ${retired}`);
  if (!catalog.categories.some((category) => category.slug === successor)) throw new Error(`Retired topic successor is missing: ${successor}`);
}
fs.writeFileSync(path.join(root, "worker", "src", "card-moves.json"), `${JSON.stringify(moves, null, 2)}\n`);
console.log(`Generated card indexes with ${Object.keys(index).length} cards and ${Object.keys(moves.formerCategories).length} recorded card moves.`);
