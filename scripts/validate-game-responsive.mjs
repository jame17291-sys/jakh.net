import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightModule = process.env.JAKH_PLAYWRIGHT_MODULE || 'playwright';
let chromium;
try {
  ({ chromium } = require(playwrightModule));
} catch (error) {
  console.error('Playwright is required. Install it locally or set JAKH_PLAYWRIGHT_MODULE to its package directory.');
  throw error;
}

const baseUrl = (process.argv[2] || 'http://127.0.0.1:8791').replace(/\/$/, '');
const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 568, height: 320 },
  { width: 1280, height: 900 }
];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function pageMetrics(page, name, viewport) {
  const metrics = await page.evaluate(({ name, viewport }) => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
        display: style.display,
        visibility: style.visibility,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth
      };
    };

    const result = {
      name,
      viewport,
      htmlScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth
    };

    if (name === 'hanabi') {
      result.core = ['.hb-tokens', '.hb-stacks', '.hb-hands', '.hb-actions', '.hb-log'].map(rect);
      result.stacks = [...document.querySelectorAll('.hb-stack')].map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      });
    }

    if (name === 'backgammon') {
      result.outer = rect('.bg-outer');
      result.board = rect('.bg-board');
      result.rows = [...document.querySelectorAll('.bg-half')].map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      });
      result.pointCount = document.querySelectorAll('.bg-point').length;
    }

    if (name === 'chess') {
      result.board = rect('#chessBoard');
      result.square = rect('.chess-square');
      result.squareCount = document.querySelectorAll('.chess-square').length;
      result.touch = rect('#chessTouchControls');
      result.touchTargets = ['#chessTouchFrom', '#chessTouchTo', '#chessTouchMove'].map(rect);
    }

    if (name === 'reversi') {
      result.board = rect('.rv-board-wrap');
      result.cell = rect('.rv-cell');
      result.cells = [...document.querySelectorAll('.rv-cell')].map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      });
      result.cellCount = document.querySelectorAll('.rv-cell').length;
      result.precise = rect('#rvPreciseMoves');
      result.preciseTargets = [...document.querySelectorAll('.rv-precise-move')].map((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      });
    }
    return result;
  }, { name, viewport });

  check(metrics.htmlScrollWidth <= viewport.width + 1,
    `${name} ${viewport.width}x${viewport.height}: document is ${metrics.htmlScrollWidth}px wide`);
  check(metrics.bodyScrollWidth <= viewport.width + 1,
    `${name} ${viewport.width}x${viewport.height}: body is ${metrics.bodyScrollWidth}px wide`);

  if (name === 'hanabi') {
    check(metrics.core.every(Boolean), `${name}: a core state region is missing`);
    check(metrics.core.every((item) => item.left >= -1 && item.right <= viewport.width + 1),
      `${name} ${viewport.width}x${viewport.height}: a core state region is clipped`);
    check(metrics.stacks.length === 5, `${name}: expected five firework stacks`);
    check(metrics.stacks.every((item) => item.left >= -1 && item.right <= viewport.width + 1 && item.width > 0),
      `${name} ${viewport.width}x${viewport.height}: a firework stack is clipped`);
  }

  if (name === 'backgammon') {
    check(metrics.pointCount === 24, `${name}: expected 24 points`);
    check(metrics.outer.left >= -1 && metrics.outer.right <= viewport.width + 1,
      `${name} ${viewport.width}x${viewport.height}: board shell is clipped`);
    check(metrics.board.scrollWidth <= metrics.board.clientWidth + 1,
      `${name} ${viewport.width}x${viewport.height}: board requires horizontal scrolling`);
    check(metrics.rows.every((row) => row.left >= metrics.outer.left - 1 && row.right <= metrics.outer.right + 1),
      `${name} ${viewport.width}x${viewport.height}: a board row exceeds its shell`);
  }

  if (name === 'chess') {
    check(metrics.squareCount === 64, `${name}: expected 64 squares`);
    check(metrics.board.left >= -1 && metrics.board.right <= viewport.width + 1,
      `${name} ${viewport.width}x${viewport.height}: board is clipped`);
    if (viewport.width >= 352) {
      check(metrics.square.width >= 44 && metrics.square.height >= 44,
        `${name} ${viewport.width}x${viewport.height}: square is ${metrics.square.width}x${metrics.square.height}`);
    } else {
      check(metrics.touch.display !== 'none', `${name}: precise controls are hidden below 352px`);
      check(metrics.touchTargets.every((target) => target && target.height >= 44),
        `${name}: a precise control is shorter than 44px`);
    }
  }

  if (name === 'reversi') {
    check(metrics.cellCount === 64, `${name}: expected 64 cells`);
    check(metrics.board.left >= -1 && metrics.board.right <= viewport.width + 1,
      `${name} ${viewport.width}x${viewport.height}: board is clipped`);
    check(metrics.cells.every((cell) => cell.left >= metrics.board.left - 1
      && cell.right <= metrics.board.right + 1
      && cell.top >= metrics.board.top - 1
      && cell.bottom <= metrics.board.bottom + 1),
    `${name} ${viewport.width}x${viewport.height}: a cell is clipped by the board`);
    if (viewport.width >= 352) {
      check(metrics.cell.width >= 44 && metrics.cell.height >= 44,
        `${name} ${viewport.width}x${viewport.height}: cell is ${metrics.cell.width}x${metrics.cell.height}`);
    } else {
      check(metrics.precise.display !== 'none', `${name}: precise controls are hidden below 352px`);
      check(metrics.preciseTargets.length > 0, `${name}: no precise legal-move controls were rendered`);
      check(metrics.preciseTargets.every((target) => target.height >= 44),
        `${name}: a precise legal-move control is shorter than 44px`);
    }
  }

  return metrics;
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.JAKH_BROWSER_EXECUTABLE
    ? { executablePath: process.env.JAKH_BROWSER_EXECUTABLE }
    : {})
});
const report = [];
try {
  for (const viewport of viewports) {
    for (const name of ['hanabi', 'backgammon', 'chess', 'reversi']) {
      const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
      const runtimeErrors = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      await page.goto(`${baseUrl}/${name}.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(150);
      check(runtimeErrors.length === 0,
        `${name} ${viewport.width}x${viewport.height}: ${runtimeErrors.join('; ')}`);
      report.push(await pageMetrics(page, name, viewport));

      if (viewport.width === 320 && name === 'chess') {
        await page.selectOption('#chessTouchFrom', { index: 1 });
        const destinationValue = await page.locator('#chessTouchTo option').nth(1).getAttribute('value');
        check(Boolean(destinationValue), 'chess: precise controls did not expose a destination');
        await page.selectOption('#chessTouchTo', destinationValue);
        await page.click('#chessTouchMove');
        await page.waitForTimeout(100);
        const [toRow, toCol] = destinationValue.split(',');
        const destinationLabel = await page.locator(`.chess-square[data-row="${toRow}"][data-col="${toCol}"]`).getAttribute('aria-label');
        check(destinationLabel.includes('white pawn'), 'chess: precise controls did not execute the selected move');
      }

      if (viewport.width === 320 && name === 'reversi') {
        await page.locator('.rv-precise-move').first().click();
        await page.waitForTimeout(100);
        check(await page.locator('.rv-disc').count() > 4,
          'reversi: precise legal-move control did not execute a move');
      }

      if (viewport.width === 568 && name === 'chess') {
        const focused = page.locator('.chess-square[tabindex="0"]');
        await focused.focus();
        const before = Number(await focused.getAttribute('data-col'));
        await page.keyboard.press('ArrowRight');
        const after = Number(await page.locator('.chess-square:focus').getAttribute('data-col'));
        check(after === Math.min(7, before + 1), 'chess: arrow-key board navigation regressed');
      }
      await page.close();
    }
  }

  for (const name of ['hanabi', 'backgammon', 'chess', 'reversi']) {
    const viewport = { width: 320, height: 568 };
    const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
    await page.goto(`${baseUrl}/${name}.html?lang=ar`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(150);
    check(await page.getAttribute('html', 'dir') === 'rtl', `${name}: Arabic direction was not applied`);
    report.push(await pageMetrics(page, name, viewport));
    await page.close();
  }
} finally {
  await browser.close();
}

const compact = report.map((entry) => {
  const geometry = entry.square || entry.cell || entry.board || entry.stacks?.[0];
  return `${entry.name} ${entry.viewport.width}x${entry.viewport.height}: ${geometry.width.toFixed(1)}x${(geometry.height || 0).toFixed(1)}`;
});
console.log(`Responsive game validation passed (${report.length} page/viewport checks).`);
console.log(compact.join('\n'));
