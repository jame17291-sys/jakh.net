import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ASSET_BUDGETS = Object.freeze({
  'app.js': Object.freeze({ raw: 262_000, gzip: 68_000, brotli: 55_000 }),
  'styles.css': Object.freeze({ raw: 110_000, gzip: 22_000, brotli: 18_000 }),
  'search-leaderboard.js': Object.freeze({ raw: 34_000, gzip: 9_000, brotli: 7_500 }),
  'search-leaderboard.css': Object.freeze({ raw: 8_000, gzip: 2_200, brotli: 1_800 }),
  'battle-mode.js': Object.freeze({ raw: 30_000, gzip: 8_000, brotli: 7_000 }),
  'battle-mode.css': Object.freeze({ raw: 12_000, gzip: 3_000, brotli: 2_500 }),
  'speech-quality.js': Object.freeze({ raw: 5_000, gzip: 1_800, brotli: 1_500 }),
  'data/search-index.en.json': Object.freeze({ raw: 600_000, gzip: 210_000, brotli: 175_000 }),
  'data/search-index.ar.json': Object.freeze({ raw: 825_000, gzip: 230_000, brotli: 190_000 }),
});

export const INITIAL_ROUTE_BUDGET = Object.freeze({
  assets: Object.freeze(['app.js', 'styles.css']),
  raw: 370_000,
  gzip: 90_000,
  brotli: 72_000,
});

export function measureBuffer(buffer) {
  return {
    raw: buffer.byteLength,
    gzip: gzipSync(buffer, { level: 9 }).byteLength,
    brotli: brotliCompressSync(buffer, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
      },
    }).byteLength,
  };
}

export function budgetFailures(label, measured, budget) {
  return ['raw', 'gzip', 'brotli']
    .filter((kind) => measured[kind] > budget[kind])
    .map((kind) => (
      label + ' ' + kind + ' is ' + measured[kind].toLocaleString('en-US')
      + ' bytes; budget is ' + budget[kind].toLocaleString('en-US') + ' bytes'
    ));
}

export function auditPerformanceBudgets(root = defaultRoot) {
  const entries = {};
  const failures = [];

  for (const [relativePath, budget] of Object.entries(ASSET_BUDGETS)) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      failures.push(relativePath + ' is missing');
      continue;
    }
    const measured = measureBuffer(fs.readFileSync(absolutePath));
    entries[relativePath] = { measured, budget };
    failures.push(...budgetFailures(relativePath, measured, budget));
  }

  const initialMeasured = INITIAL_ROUTE_BUDGET.assets.reduce(
    (total, relativePath) => {
      const measured = entries[relativePath]?.measured;
      if (!measured) return total;
      return {
        raw: total.raw + measured.raw,
        gzip: total.gzip + measured.gzip,
        brotli: total.brotli + measured.brotli,
      };
    },
    { raw: 0, gzip: 0, brotli: 0 },
  );
  entries['initial app.js + styles.css'] = {
    measured: initialMeasured,
    budget: INITIAL_ROUTE_BUDGET,
  };
  failures.push(...budgetFailures(
    'initial app.js + styles.css',
    initialMeasured,
    INITIAL_ROUTE_BUDGET,
  ));

  return { entries, failures };
}

function printReport(report) {
  for (const [label, { measured, budget }] of Object.entries(report.entries)) {
    console.log(
      label + ': raw ' + measured.raw.toLocaleString('en-US') + '/' + budget.raw.toLocaleString('en-US')
      + ', gzip ' + measured.gzip.toLocaleString('en-US') + '/' + budget.gzip.toLocaleString('en-US')
      + ', brotli ' + measured.brotli.toLocaleString('en-US') + '/' + budget.brotli.toLocaleString('en-US'),
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = auditPerformanceBudgets();
  printReport(report);
  if (report.failures.length) {
    console.error('Performance budget validation failed with ' + report.failures.length + ' issue(s):');
    for (const failure of report.failures) console.error('- ' + failure);
    process.exitCode = 1;
  } else {
    console.log('Performance budgets passed.');
  }
}
