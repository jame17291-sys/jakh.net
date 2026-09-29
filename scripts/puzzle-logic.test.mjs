import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSudoku, solveSudoku, sudokuCandidates, isSudokuValid, isSudokuComplete,
  createDomino, dominoCells, dominoBoard, placeDomino, checkDominoRegions, isDominoComplete,
  createMosaic, mosaicShared, matchMosaic, findMosaicMatch, isMosaicComplete, MOSAIC_LAYERS,
} from '../puzzle-logic.js';

test('every seeded Sudoku difficulty has exactly one valid solution and deterministic clues', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    for (const seed of ['2026-09-29', 'arabic:2026-09-30', 'archive:104']) {
      const puzzle = createSudoku(seed, difficulty), solutions = solveSudoku(puzzle.givens);
      assert.equal(solutions.length, 1, `${seed}, ${difficulty}`);
      assert.deepEqual(solutions[0], puzzle.solution);
      assert.ok(isSudokuComplete(puzzle.solution));
      assert.ok(!isSudokuComplete(puzzle.givens));
      assert.deepEqual(createSudoku(seed, difficulty), puzzle);
      assert.equal(puzzle.clues, puzzle.givens.filter(Boolean).length);
      assert.ok(puzzle.clues >= ({ easy: 43, medium: 34, hard: 28 })[difficulty]);
      assert.ok(puzzle.clues < 50);
    }
  }
  assert.notDeepEqual(createSudoku('one').givens, createSudoku('two').givens);
});

test('Sudoku rejects row, column, box conflicts and invalid values', () => {
  const solved = createSudoku('constraints').solution;
  for (const [first, second] of [[0, 1], [0, 9], [0, 10]]) {
    const invalid = Array(81).fill(0); invalid[first] = 5; invalid[second] = 5;
    assert.equal(isSudokuValid(invalid), false);
    assert.deepEqual(solveSudoku(invalid), []);
  }
  assert.equal(isSudokuComplete([]), false);
  assert.equal(isSudokuValid(Array(81).fill(10)), false);
  const partial = [...solved]; partial[40] = 0;
  assert.deepEqual(sudokuCandidates(partial, 40), [solved[40]]);
  assert.deepEqual(sudokuCandidates(partial, 0), []);
  assert.equal(isSudokuComplete(partial), false);
  assert.deepEqual(solveSudoku(partial), [solved]);
});

test('Sudoku solver detects ambiguity rather than silently accepting multiple solutions', () => {
  const board = Array(81).fill(0), solutions = solveSudoku(board, 2);
  assert.equal(solutions.length, 2);
  solutions.forEach(solution => assert.ok(isSudokuComplete(solution)));
  assert.notDeepEqual(solutions[0], solutions[1]);
  assert.deepEqual(board, Array(81).fill(0), 'solving must not mutate input');
});

test('every domino seed ships a legal arrangement that satisfies all region rules', () => {
  for (let seed = 0; seed < 40; seed++) {
    const puzzle = createDomino(seed);
    assert.deepEqual(createDomino(seed), puzzle);
    assert.equal(puzzle.pieces.length, 8);
    assert.equal(new Set(puzzle.pieces.map(p => p.id)).size, 8);
    assert.equal(dominoBoard(puzzle, puzzle.solution).length, 16);
    assert.ok(isDominoComplete(puzzle, puzzle.solution), `seed ${seed}`);
    assert.ok(checkDominoRegions(puzzle, puzzle.solution).every(region => region.valid && region.complete));
    assert.equal(isDominoComplete(puzzle, puzzle.solution.slice(1)), false);
  }
});

test('domino placement enforces edges, orientation, collisions, and one copy per piece', () => {
  const puzzle = createDomino('placement'), first = { piece: 0, cell: 0, direction: 'h', flipped: false };
  assert.deepEqual(dominoCells(puzzle, first), [0, 1]);
  assert.equal(dominoCells(puzzle, { ...first, cell: 3 }), null, 'cannot wrap at right edge');
  assert.equal(dominoCells(puzzle, { ...first, cell: 12, direction: 'v' }), null, 'cannot exceed bottom edge');
  assert.equal(dominoCells(puzzle, { ...first, direction: 'diagonal' }), null);
  assert.equal(dominoCells(puzzle, { ...first, cell: -1 }), null);
  assert.equal(dominoBoard(puzzle, [null]), null, 'malformed saved progress must be rejected');
  const placements = placeDomino(puzzle, [], first);
  assert.equal(placeDomino(puzzle, placements, { piece: 1, cell: 1, direction: 'h' }), null);
  assert.equal(placeDomino(puzzle, placements, { piece: 100, cell: 4, direction: 'h' }), null);
  assert.equal(dominoBoard(puzzle, [first, { ...first, cell: 4 }]), null);
  const moved = placeDomino(puzzle, placements, { ...first, cell: 4, direction: 'v', flipped: true });
  assert.equal(moved.length, 1, 'moving a piece does not duplicate it');
  const board = dominoBoard(puzzle, moved);
  assert.equal(board[0], null);
  assert.equal(board[4].value, puzzle.pieces[0].values[1]);
  assert.equal(board[8].value, puzzle.pieces[0].values[0]);
  assert.deepEqual(placements, [first], 'pure placement does not mutate input');
});

test('domino region checks catch incorrect sums, non-equal values, and repeated distinct values', () => {
  const puzzle = {
    width: 2, height: 2,
    pieces: [{ id: 0, values: [1, 2] }, { id: 1, values: [1, 4] }],
    regions: [{ id: 0, cells: [0, 1, 2, 3], type: 'sum', target: 12 }],
  };
  const placements = [{ piece: 0, cell: 0, direction: 'h' }, { piece: 1, cell: 2, direction: 'h' }];
  assert.equal(checkDominoRegions(puzzle, placements)[0].valid, false);
  assert.equal(isDominoComplete(puzzle, placements), false);
  for (const type of ['same', 'different']) {
    puzzle.regions[0].type = type;
    assert.equal(checkDominoRegions(puzzle, placements)[0].valid, false);
    assert.equal(isDominoComplete(puzzle, placements), false);
  }
  puzzle.regions[0] = { id: 0, cells: [0, 1, 2, 3], type: 'sum', target: 8 };
  assert.ok(isDominoComplete(puzzle, placements), 'a rule-valid arrangement wins without comparing to a hidden answer');
});

test('mosaic removes only shared nonempty layers, never the same tile twice', () => {
  const tiles = [{ id: 0, color: 1, shape: 2, motif: 3 }, { id: 1, color: 4, shape: 2, motif: 3 }, { id: 2, color: 0, shape: 0, motif: 0 }];
  assert.deepEqual(mosaicShared(tiles[0], tiles[1]), ['shape', 'motif']);
  assert.deepEqual(mosaicShared(tiles[0], tiles[0]), []);
  assert.equal(matchMosaic(tiles, 0, 2), null);
  assert.equal(matchMosaic(tiles, 0, 0), null);
  assert.equal(matchMosaic(tiles, 0, 999), null);
  const result = matchMosaic(tiles, 0, 1);
  assert.deepEqual(result.tiles[0], { id: 0, color: 1, shape: null, motif: null });
  assert.deepEqual(result.tiles[1], { id: 1, color: 4, shape: null, motif: null });
  assert.deepEqual(result.tiles[2], tiles[2]);
  assert.deepEqual(mosaicShared(result.tiles[0], result.tiles[1]), [], 'absent layers cannot match');
  assert.equal(tiles[0].shape, 2, 'matching must not mutate its input');
  assert.equal(isMosaicComplete(result.tiles), false);
});

test('mosaic deals remain clearable through arbitrary valid choices', () => {
  for (let seed = 0; seed < 80; seed++) {
    let tiles = createMosaic(seed), turns = 0;
    assert.deepEqual(tiles, createMosaic(seed));
    while (!isMosaicComplete(tiles)) {
      const available = [];
      for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) if (mosaicShared(tiles[i], tiles[j]).length) available.push([i, j]);
      assert.ok(available.length, `seed ${seed} stranded at move ${turns}`);
      const pair = available[(seed * 7 + turns * 13) % available.length];
      tiles = matchMosaic(tiles, ...pair).tiles;
      for (const layer of MOSAIC_LAYERS) for (let value = 0; value < 5; value++) assert.equal(tiles.filter(tile => tile[layer] === value).length % 2, 0);
      assert.ok(++turns <= 30, 'each move clears at least two of 60 layers');
    }
    assert.equal(findMosaicMatch(tiles), null);
  }
});

test('mosaic hint prioritizes the current tile and handles empty boards', () => {
  const tiles = createMosaic('hint'), pair = findMosaicMatch(tiles, 12);
  assert.equal(pair[0], 12);
  assert.ok(mosaicShared(tiles[pair[0]], tiles[pair[1]]).length);
  assert.equal(findMosaicMatch([]), null);
  assert.equal(isMosaicComplete([]), false);
  assert.ok(isMosaicComplete([{ id: 0, color: null, shape: null, motif: null }]));
});
