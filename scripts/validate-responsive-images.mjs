import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imageDirectory = path.join(root, "assets", "backgrounds_new");
const failures = [];
const correctedWebpSlugs = [
  "fictional-worlds",
  "linguistics",
  "mythology-legends",
  "superheroes",
  "survival",
  "tech-retro",
  "true-crime",
];

function fail(scope, message) {
  failures.push(`${scope}: ${message}`);
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    return null;
  }
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const isStartOfFrame = (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    );
    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  return null;
}

function isWebp(buffer) {
  return buffer.length >= 12
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP";
}

const sourceNames = fs.readdirSync(imageDirectory)
  .filter((name) => name.endsWith(".jpg") && !name.endsWith("-320.jpg"))
  .sort();

if (!sourceNames.length) fail("assets/backgrounds_new", "no 640px JPEG sources found");

for (const sourceName of sourceNames) {
  const sourcePath = path.join(imageDirectory, sourceName);
  const derivativeName = sourceName.replace(/\.jpg$/u, "-320.jpg");
  const derivativePath = path.join(imageDirectory, derivativeName);
  const source = fs.readFileSync(sourcePath);
  const sourceDimensions = jpegDimensions(source);
  if (!sourceDimensions) {
    fail(sourceName, "source is not a readable JPEG");
  } else if (sourceDimensions.width !== 640 || sourceDimensions.height !== 640) {
    fail(sourceName, `expected a 640x640 source, found ${sourceDimensions.width}x${sourceDimensions.height}`);
  }
  if (!fs.existsSync(derivativePath)) {
    fail(sourceName, `missing responsive derivative ${derivativeName}`);
    continue;
  }
  const derivative = fs.readFileSync(derivativePath);
  const derivativeDimensions = jpegDimensions(derivative);
  if (!derivativeDimensions) {
    fail(derivativeName, "derivative is not a readable JPEG");
  } else if (derivativeDimensions.width !== 320 || derivativeDimensions.height !== 320) {
    fail(derivativeName, `expected 320x320, found ${derivativeDimensions.width}x${derivativeDimensions.height}`);
  }
  if (derivative.length >= source.length) {
    fail(derivativeName, `expected fewer bytes than ${sourceName} (${derivative.length} >= ${source.length})`);
  }
}

const mindLabPath = path.join(root, "mind-lab.html");
if (!fs.existsSync(mindLabPath)) {
  fail("mind-lab.html", "generated Mind Lab page is missing");
} else {
  const mindLab = fs.readFileSync(mindLabPath, "utf8");
  for (const sourceName of sourceNames) {
    const derivativeName = sourceName.replace(/\.jpg$/u, "-320.jpg");
    const slug = sourceName.replace(/\.jpg$/u, "");
    const expected = `src="/assets/backgrounds_new/${sourceName}" srcset="/assets/backgrounds_new/${derivativeName} 320w, /assets/backgrounds_new/${sourceName} 640w"`;
    if (!mindLab.includes(expected)) {
      fail(`mind-lab.html#${slug}`, "missing the 320w/640w responsive image pair");
    }
  }
  const responsiveImages = mindLab.match(/<img\b[^>]*\bclass="category-card-image"[^>]*\bsrcset="[^"]* 320w, [^"]* 640w"[^>]*\bsizes="[^"]+"[^>]*>/gu) || [];
  if (responsiveImages.length !== sourceNames.length) {
    fail("mind-lab.html", `expected ${sourceNames.length} responsive category images, found ${responsiveImages.length}`);
  }
}

const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const generatedFiles = [
  "mind-lab.html",
  ...(catalog.categories || []).flatMap(({ slug }) => [
    `${slug}.html`,
    `ar/topics/${slug}/index.html`,
  ]),
];

for (const slug of correctedWebpSlugs) {
  const oldPath = path.join(root, "assets", "backgrounds", `${slug}.png`);
  const webpPath = path.join(root, "assets", "backgrounds", `${slug}.webp`);
  if (fs.existsSync(oldPath)) fail(`assets/backgrounds/${slug}.png`, "obsolete mislabeled file still exists");
  if (!fs.existsSync(webpPath)) {
    fail(`assets/backgrounds/${slug}.webp`, "correctly named WebP is missing");
  } else if (!isWebp(fs.readFileSync(webpPath))) {
    fail(`assets/backgrounds/${slug}.webp`, "file does not contain WebP bytes");
  }
  const staleReference = `assets/backgrounds/${slug}.png`;
  for (const relative of generatedFiles) {
    const target = path.join(root, relative);
    if (fs.existsSync(target) && fs.readFileSync(target, "utf8").includes(staleReference)) {
      fail(relative, `still references ${staleReference}`);
    }
  }
}

if (failures.length) {
  console.error(`Responsive image validation failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`- ${issue}`);
  process.exit(1);
}

const sourceBytes = sourceNames.reduce(
  (sum, name) => sum + fs.statSync(path.join(imageDirectory, name)).size,
  0,
);
const derivativeBytes = sourceNames.reduce(
  (sum, name) => sum + fs.statSync(path.join(imageDirectory, name.replace(/\.jpg$/u, "-320.jpg"))).size,
  0,
);
const reduction = Math.round((1 - derivativeBytes / sourceBytes) * 100);
console.log(
  `Responsive images valid: ${sourceNames.length} JPEG pairs, ${correctedWebpSlugs.length} corrected WebP names, ${reduction}% fewer thumbnail bytes.`,
);
