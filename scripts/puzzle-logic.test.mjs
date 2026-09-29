import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSudoku, solveSudoku, sudokuCandidates, isSudokuValid, isSudokuComplete,
  createDomino, dominoCells, dominoBoard, placeDomino, checkDominoRegions, isDominoComplete,
  createMosaic, mosaicShared, matchMosaic, findMosaicMatch, isMosaicComplete, MOSAIC_LAYERS,
  restoreSudokuState, restoreMosaicState, gridNeighbor, sudokuDigit, mount,
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

test('malformed Sudoku data cannot become a solved board or overwrite givens', () => {
  const puzzle = createSudoku('restore'), values = Array(81).fill(0), notes = Array.from({length: 81}, () => [1, 1, 0, -1, 10, '2', null, 3]);
  const saved = {version: 1, values, notes, hints: Infinity, pencil: 'false'};
  const restored = restoreSudokuState(saved, puzzle);
  assert.deepEqual(restored.values, puzzle.givens);
  assert.deepEqual(restored.notes[0], [1, 3]);
  assert.equal(restored.hints, 0); assert.equal(restored.pencil, false);
  restored.values[0] = 9; restored.notes[0].push(4);
  assert.equal(values[0], 0); assert.deepEqual(notes[0], [1, 1, 0, -1, 10, '2', null, 3]);
  for (const values of [Array(81), Array(81).fill(null), Array(81).fill('1'), Array(80).fill(0)]) {
    assert.equal(isSudokuComplete(values), false);
    assert.deepEqual(restoreSudokuState({version: 1, values}, puzzle).values, puzzle.givens);
  }
  assert.deepEqual(sudokuCandidates(puzzle.givens, NaN), []);
  assert.deepEqual(sudokuCandidates(puzzle.givens, 0.5), []);
  assert.deepEqual(solveSudoku(Array(81)), []);
  assert.deepEqual(solveSudoku(puzzle.givens, Infinity), []);
});

test('malformed mosaic progress rejects orphan layers and non-finite counters', () => {
  const initial = createMosaic('restore'), pair = findMosaicMatch(initial), result = matchMosaic(initial, ...pair);
  const restored = restoreMosaicState({version: 1, tiles: result.tiles, combo: 1e309, best: 'Infinity', score: Infinity, matches: -1, hints: NaN}, initial);
  assert.deepEqual(restored.tiles, result.tiles);
  for (const name of ['combo', 'best', 'score', 'matches', 'hints']) assert.equal(restored[name], 0);
  restored.tiles[0].color = null; assert.deepEqual(initial, createMosaic('restore'));
  const orphan = structuredClone(initial); orphan[0].color = null;
  const wrong = structuredClone(initial); wrong[0].shape = (wrong[0].shape + 1) % 5;
  for (const tiles of [orphan, wrong, Array(20), Array(20).fill(null), initial.slice(1)]) assert.deepEqual(restoreMosaicState({version: 1, tiles}, initial).tiles, initial);
  assert.equal(isMosaicComplete(Array(20)), false);
  assert.equal(isMosaicComplete([null]), false);
  assert.deepEqual(mosaicShared({id: 0}, {id: 1}), []);
  assert.equal(matchMosaic([null], 0, 1), null);
  assert.equal(findMosaicMatch([null]), null);
});

test('domino rejects malformed rotation values and malformed replacement state', () => {
  const puzzle = createDomino('invalid');
  for (const flipped of ['false', 1, null, [], {}]) assert.equal(dominoBoard(puzzle, [{piece: 0, cell: 0, direction: 'h', flipped}]), null);
  assert.equal(placeDomino(puzzle, [], null), null);
  assert.equal(placeDomino(puzzle, [null], {piece: 0, cell: 0, direction: 'h'}), null);
});

test('grid navigation stays within physical rows and supports RTL and Arabic digits', () => {
  for (const [columns, count] of [[9, 81], [4, 16], [5, 20]]) {
    assert.equal(gridNeighbor(0, 'ArrowUp', columns, count), 0);
    assert.equal(gridNeighbor(0, 'ArrowLeft', columns, count), 0);
    assert.equal(gridNeighbor(columns - 1, 'ArrowRight', columns, count), columns - 1);
    assert.equal(gridNeighbor(count - 1, 'ArrowDown', columns, count), count - 1);
    assert.equal(gridNeighbor(0, 'ArrowLeft', columns, count, true), 1);
    assert.equal(gridNeighbor(0, 'ArrowRight', columns, count, true), 0);
    assert.equal(gridNeighbor(columns, 'ArrowUp', columns, count), 0);
  }
  for (const digits of ['0123456789', '٠١٢٣٤٥٦٧٨٩', '۰۱۲۳۴۵۶۷۸۹']) [...digits].forEach((digit, i) => assert.equal(sudokuDigit(digit), i));
  for (const key of ['A', '', '12', 'Enter', undefined]) assert.equal(sudokuDigit(key), null);
});

// Event-level mount harness: exercises the real game handlers and saved state.
// Layout, native touch targeting, and assistive-technology behavior remain browser QA.
function logicHarness(game, {seed='interaction', lang='en', saved={}}={}) {
  const previousDocument=globalThis.document;
  class Node {
    constructor(tag='div') { this.tagName=tag.toUpperCase(); this.children=[]; this.attrs={}; this.dataset={}; this.className=''; this.textContent=''; this.markup=''; this.root=this; this.listeners=new Map(); this.classList={add:name=>{this.className+=` ${name}`;},remove:name=>{this.className=this.className.split(' ').filter(v=>v!==name).join(' ');}}; }
    setAttribute(key,value) { this.attrs[key]=String(value); if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value); }
    getAttribute(key) { return this.attrs[key]??null; }
    set innerHTML(value) { this.markup=value; this.help=null; }
    get innerHTML() { return this.markup; }
    replaceChildren(...children) { this.children=children; children.forEach(child=>{child.root=this.root;}); }
    contains(node) { return !!node&&node.root===this.root; }
    focus() { if(!this.disabled)globalThis.document.activeElement=this; }
    closest(selector) { return selector.startsWith('[data-')&&this.getAttribute(selector.slice(1,-1))!==null?this:null; }
    querySelector(selector) {
      if(selector==='.pl-status')return this.children.find(n=>n.className.split(' ').includes('pl-status'))||null;
      if(selector==='.pl-instructions') {
        if(!this.markup.includes('class="pl-instructions"'))return null;
        return this.help ||= {open:false};
      }
      const focus=/^\[data-focus="([^"]+)"\]$/.exec(selector)?.[1];
      for(const match of this.markup.matchAll(/<(button|select)\b([^>]*)>/g)) {
        const node=new Node(match[1]);node.root=this.root;
        for(const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g))node.setAttribute(attr[1],attr[2]);
        node.disabled=/\sdisabled(?:\s|$)/.test(match[2]);
        if((focus&&node.getAttribute('data-focus')===focus)||(selector==='[data-focus]:not(:disabled)'&&node.getAttribute('data-focus')&&!node.disabled))return node;
      }
      for(const child of this.children){const node=child.querySelector(selector);if(node)return node;}
      return null;
    }
    addEventListener(name,handler,{signal}={}) { const list=this.listeners.get(name)||[];list.push(handler);this.listeners.set(name,list);signal?.addEventListener('abort',()=>this.listeners.set(name,(this.listeners.get(name)||[]).filter(fn=>fn!==handler)),{once:true}); }
    emit(type,target,extras={}) { const event={target,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extras};for(const handler of this.listeners.get(type)||[])handler(event);return event; }
  }
  globalThis.document={activeElement:null,createElement:tag=>new Node(tag)};
  const root=new Node(), snapshots=[];
  const cleanup=mount(root,{game,lang,seed,t:(en,ar)=>lang==='ar'?ar:en,load:()=>structuredClone(saved),save:value=>snapshots.push(structuredClone(value))});
  function target(focus){const node=root.querySelector(`[data-focus="${focus}"]`);assert.ok(node,`missing focus target ${focus}`);return node;}
  return {
    root,snapshots,
    get state(){return snapshots.at(-1);},get markup(){return root.children[0].innerHTML;},get status(){return root.children[1];},
    click(focus){const node=target(focus);assert.equal(node.disabled,false,`cannot click disabled ${focus}`);node.focus();return root.emit('click',node);},
    key(focus,key,extras={}){const node=target(focus);node.focus();return root.emit('keydown',node,{key,...extras});},
    difficulty(value){const node=target('difficulty');node.value=value;node.focus();return root.emit('change',node);},
    stop(){cleanup();},close(){cleanup();globalThis.document=previousDocument;},
  };
}

test('Sudoku mount supports notes, hints, undo, difficulty and a stable live status', () => {
  const seed='interaction',puzzle=createSudoku(seed),cell=puzzle.givens.findIndex(n=>!n),h=logicHarness('sudoku',{seed});
  try {
    const live=h.status;
    h.click(`s${cell}`);h.click('notes');h.key(`s${cell}`,'٣');
    assert.equal(h.state.values[cell],0);assert.deepEqual(h.state.notes[cell],[3]);
    h.click('undo');assert.deepEqual(h.state.notes[cell],[]);
    h.click('notes');h.key(`s${cell}`,'٣');assert.equal(h.state.values[cell],3);
    h.click('erase');assert.equal(h.state.values[cell],0);
    h.click('hint');assert.equal(h.state.values[cell],puzzle.solution[cell]);assert.equal(h.state.hints,1);
    h.click('undo');assert.equal(h.state.values[cell],0);assert.equal(h.state.hints,0);
    assert.equal(h.status,live,'status region remains mounted while its text changes');
    assert.equal(live.getAttribute('role'),'status');
    h.difficulty('hard');assert.equal(h.state.difficulty,'hard');assert.deepEqual(h.state.values,createSudoku(seed,'hard').givens);
    assert.deepEqual(h.state.notes,Array.from({length:81},()=>[]));assert.equal(h.state.hints,0);
    assert.match(h.markup,/data-action="undo"[^>]*disabled/);
    const before=h.snapshots.length;h.stop();h.key('s0','1');assert.equal(h.snapshots.length,before,'cleanup removes delegated game handlers');
  } finally {h.close();}
});

test('Sudoku checks expose incorrect cells accessibly and completion can be undone', () => {
  const seed='completion',puzzle=createSudoku(seed),h=logicHarness('sudoku',{seed}),editable=puzzle.givens.map((n,i)=>n?-1:i).filter(i=>i>=0);
  try {
    const first=editable[0];h.click(`s${first}`);h.key(`s${first}`,String(puzzle.solution[first]%9+1));h.click('check');
    assert.equal(h.root.querySelector(`[data-focus="s${first}"]`).getAttribute('aria-invalid'),'true');
    h.click('erase');assert.equal(h.root.querySelector(`[data-focus="s${first}"]`).getAttribute('aria-invalid'),'false');
    for(const i of editable)h.key(`s${i}`,String(puzzle.solution[i]));
    assert.ok(isSudokuComplete(h.state.values));assert.match(h.status.className,/pl-won/);
    h.click('undo');assert.equal(isSudokuComplete(h.state.values),false);assert.doesNotMatch(h.status.className,/pl-won/);
  } finally {h.close();}
});

test('all logic mounts recover from malformed persisted schemas without crashing', () => {
  const corrupt=[null,1,true,'invalid',[],{version:1,values:Array(81).fill('1'),notes:null,placements:[null],tiles:Array(20).fill(null),score:'Infinity'}];
  for(const game of ['sudoku','domino','mosaic'])for(const saved of corrupt){
    const h=logicHarness(game,{saved});
    try{assert.match(h.markup,game==='sudoku'?/pl-sudoku/:game==='domino'?/pl-domino-board/:/pl-mosaic-board/);assert.doesNotMatch(h.status.className,/pl-won/);}finally{h.close();}
  }
});

test('logic shortcuts do not intercept browser shortcuts and keyboard focus stays bounded', () => {
  for(const game of ['sudoku','domino','mosaic']) {
    const h=logicHarness(game),focus=game==='sudoku'?'s0':game==='domino'?'d0':'m0';
    try {
      for(const modifier of ['ctrlKey','metaKey','altKey']) for(const key of ['1','n','r','f','ArrowLeft']) assert.equal(h.key(focus,key,{[modifier]:true}).defaultPrevented,false);
      assert.equal(h.snapshots.length,0);
      h.key(focus,'ArrowUp');assert.equal(globalThis.document.activeElement.getAttribute('data-focus'),focus);
      h.key(focus,'ArrowRight');assert.equal(globalThis.document.activeElement.getAttribute('data-focus'),game==='sudoku'?'s1':game==='domino'?'d1':'m1');
    } finally {h.close();}
  }
  const h=logicHarness('mosaic',{lang:'ar'});
  try {h.key('m0','ArrowLeft');assert.equal(globalThis.document.activeElement.getAttribute('data-focus'),'m1');assert.match(h.markup,/class="pl-mosaic-board" role="group" dir="rtl"/);} finally {h.close();}
});

test('domino mount handles invalid placement, complete solve, removal and undo', () => {
  const seed='interaction',puzzle=createDomino(seed),h=logicHarness('domino',{seed});let orientation='h';
  try {
    h.click('d3');assert.equal(h.snapshots.length,0);assert.match(h.status.textContent,/two empty adjacent/);
    for(const placement of puzzle.solution) {
      h.click(`piece${placement.piece}`);
      if(orientation!==placement.direction){h.click('rotate');orientation=placement.direction;}
      if(placement.flipped)h.click('flip');
      h.click(`d${placement.cell}`);
    }
    assert.ok(isDominoComplete(puzzle,h.state.placements));assert.match(h.status.className,/pl-won/);
    h.click(`d${puzzle.solution[0].cell}`);assert.equal(h.state.placements.length,7);assert.doesNotMatch(h.status.className,/pl-won/);
    h.click('undo');assert.ok(isDominoComplete(puzzle,h.state.placements));
  } finally {h.close();}
});

test('mosaic mount supports matching, undo, completion, saved resume and fresh reset', () => {
  const seed='interaction',h=logicHarness('mosaic',{seed});let tiles=createMosaic(seed),selected=null;
  try {
    let pair=findMosaicMatch(tiles);h.click(`m${pair[0]}`);h.click(`m${pair[1]}`);
    assert.ok(h.state.score>0);h.click('undo');assert.deepEqual(h.state.tiles,tiles);assert.equal(h.state.score,0);
    selected=pair[0];
    while(!isMosaicComplete(tiles)) {
      pair=findMosaicMatch(tiles,selected);
      if(selected===null)h.click(`m${pair[0]}`);
      h.click(`m${pair[1]}`);tiles=h.state.tiles;selected=MOSAIC_LAYERS.every(layer=>tiles[pair[1]][layer]===null)?null:pair[1];
    }
    assert.match(h.status.className,/pl-won/);assert.ok(Number.isFinite(h.state.score));
    const saved=h.state;h.close();
    const resumed=logicHarness('mosaic',{seed,saved});try{assert.match(resumed.status.className,/pl-won/);}finally{resumed.close();}
    const reset=logicHarness('mosaic',{seed});try{assert.doesNotMatch(reset.status.className,/pl-won/);assert.doesNotMatch(reset.markup,/pl-cleared/);}finally{reset.close();}
  } finally {h.close();}
});

test('mosaic misses reset only the chain and undo restores the preceding move state', () => {
  const seed='miss',initial=createMosaic(seed),h=logicHarness('mosaic',{seed}),pair=findMosaicMatch(initial);
  try {
    h.click(`m${pair[0]}`);h.click(`m${pair[1]}`);
    const before=structuredClone(h.state),selected=pair[1];
    assert.ok(MOSAIC_LAYERS.some(layer=>before.tiles[selected][layer]!==null));
    const mismatch=before.tiles.find(tile=>tile.id!==selected&&MOSAIC_LAYERS.some(layer=>tile[layer]!==null)&&!mosaicShared(before.tiles[selected],tile).length);
    assert.ok(mismatch,'fixture needs a nonmatching tile');
    h.click(`m${mismatch.id}`);assert.equal(h.state.combo,0);assert.equal(h.state.score,before.score);assert.deepEqual(h.state.tiles,before.tiles);
    h.click('undo');assert.deepEqual(h.state,before);
    h.click('hint');assert.equal(h.state.combo,0);assert.equal(h.state.hints,1);assert.equal((h.markup.match(/ pl-hint/g)||[]).length,2);
  } finally {h.close();}
});
