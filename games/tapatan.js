(function () {
  'use strict';
  // Tapatan: 3x3 board. Phase 1: each player places 3 pieces.
  // Phase 2: slide one piece per turn along lines (all 8 directions on connected points).
  // Win: 3 in a row in any direction.
  // The center point connects to all 8 others; corner/edge points connect diagonally too.

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function opp(p) { return p === 'A' ? 'B' : 'A'; }
  function rc(i) { return [Math.floor(i / 3), i % 3]; }
  function idx(r, c) { return r * 3 + c; }

  // Adjacency: all 8 directions from each cell
  const ADJ = Array.from({length: 9}, (_, i) => {
    const [r, c] = rc(i);
    const nbrs = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r+dr, nc = c+dc;
      if (nr >= 0 && nr < 3 && nc >= 0 && nc < 3) nbrs.push(idx(nr, nc));
    }
    return nbrs;
  });

  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  function hasWon(board, player) {
    return LINES.some(line => line.every(i => board[i] === player));
  }

  function initialState() {
    return { board: new Array(9).fill(null), turn: 'A', winner: null, moves: 0, placed: {A:0,B:0}, phase: 'place' };
  }

  function legalMoves(state, player) {
    if (state.winner) return [];
    const pl = player || state.turn;
    if (state.phase === 'place') {
      return state.board.map((v,i) => v === null ? {type:'place', cell:i, to:i} : null).filter(Boolean);
    }
    const moves = [];
    state.board.forEach((v, from) => {
      if (v !== pl) return;
      ADJ[from].forEach(to => { if (!state.board[to]) moves.push({type:'move', from, to}); });
    });
    return moves;
  }

  function applyMove(state, move) {
    const legal = legalMoves(state, state.turn).find(m =>
      m.type === move.type && (m.cell === move.cell || (m.from === move.from && m.to === move.to))
    );
    if (!legal) return clone(state);
    const next = clone(state);
    if (legal.type === 'place') {
      next.board[legal.cell] = next.turn;
      next.placed[next.turn]++;
      if (next.placed.A >= 3 && next.placed.B >= 3) next.phase = 'move';
    } else {
      next.board[legal.to] = next.board[legal.from];
      next.board[legal.from] = null;
    }
    next.moves++;
    if (hasWon(next.board, next.turn)) { next.winner = next.turn; return next; }
    const term = isTerminal(next);
    next.winner = term.winner || null;
    if (!next.winner) next.turn = opp(next.turn);
    return next;
  }

  function isTerminal(state) {
    if (state.winner) return { done: true, winner: state.winner };
    if (hasWon(state.board, 'A')) return { done: true, winner: 'A' };
    if (hasWon(state.board, 'B')) return { done: true, winner: 'B' };
    if (state.phase === 'move' && !legalMoves(state, state.turn).length) return { done: true, winner: opp(state.turn) };
    if (state.moves >= 80) return { done: true, winner: 'draw' };
    return { done: false };
  }

  function score(state) {
    if (hasWon(state.board, 'A')) return 1000;
    if (hasWon(state.board, 'B')) return 0;
    return 300 + Math.random() * 10;
  }

  function aiMove(state) {
    const moves = legalMoves(state, 'B');
    if (!moves.length) return null;
    for (const m of moves) {
      const b2 = state.board.slice();
      if (m.type === 'place') b2[m.cell] = 'B';
      else { b2[m.to] = 'B'; b2[m.from] = null; }
      if (hasWon(b2, 'B')) return m;
    }
    for (const m of moves) {
      const b2 = state.board.slice();
      if (m.type === 'place') b2[m.cell] = 'A';
      else { b2[m.to] = 'A'; b2[m.from] = null; }
      if (hasWon(b2, 'A')) return m;
    }
    const center = moves.find(m => (m.cell ?? m.to) === 4);
    if (center) return center;
    return moves[Math.floor(Math.random() * moves.length)];
  }

  window.JakhGameEngines = window.JakhGameEngines || {};
  window.JakhGameEngines.tapatan = {
    id: 'tapatan',
    boardShape: 'grid', rows: 3, cols: 3,
    initialState, legalMoves, applyMove, isTerminal, score, aiMove,
    serialize: clone, deserialize: clone,
    cellContent(state, cell) {
      return state.board[cell] === 'A' ? '●' : state.board[cell] === 'B' ? '○' : '';
    },
    cellClass(state, cell) {
      const v = state.board[cell];
      return v ? 'is-' + v.toLowerCase() + ' is-piece' : '';
    },
    cellLabel(state, cell) {
      const v = state.board[cell];
      const [r,c] = rc(cell);
      return `Row ${r+1} col ${c+1}${v ? ': '+(v==='A'?'black':'white') : ''}`;
    },
    rules: 'Phase 1 — Each player places 3 pieces. Phase 2 — Slide one piece per turn to any adjacent connected point (including diagonals). First to form a straight line of 3 wins.',
  };
})();
