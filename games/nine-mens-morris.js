(function () {
  'use strict';

  // 7x7 display grid (49 cells). 24 active positions mapped to specific grid indices.
  // Active positions: outer ring, middle ring, inner ring.
  const ACTIVE = new Set([0,3,6,8,10,12,16,17,18,21,22,23,25,26,27,30,31,32,36,38,40,42,45,48]);

  const MILLS = [
    [0,3,6],[6,27,48],[48,45,42],[42,21,0],       // outer ring
    [8,10,12],[12,26,40],[40,38,36],[36,22,8],     // middle ring
    [16,17,18],[18,25,32],[32,31,30],[30,23,16],   // inner ring
    [3,10,17],[27,26,25],[45,38,31],[21,22,23],    // spokes
  ];

  const ADJ = {
    0:[3,21], 3:[0,6,10], 6:[3,27], 8:[10,22], 10:[8,12,3,17],
    12:[10,26], 16:[17,23], 17:[16,18,10], 18:[17,25], 21:[0,42,22],
    22:[8,36,21,23], 23:[16,30,22], 25:[18,32,26], 26:[12,40,27,25],
    27:[6,48,26], 30:[23,31], 31:[30,32,38], 32:[31,25], 36:[22,38],
    38:[36,40,31,45], 40:[38,26], 42:[21,45], 45:[42,48,38], 48:[45,27],
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function opp(p) { return p === 'A' ? 'B' : 'A'; }

  function inMill(board, pos, player) {
    return MILLS.some(m => m.includes(pos) && m.every(i => board[i] === player));
  }

  function countPlayer(board, player) { return board.filter(v => v === player).length; }

  function legalMoves(state, player) {
    if (state.winner) return [];
    const pl = player || state.turn;

    if (state.removing) {
      const oppList = [];
      for (const i of ACTIVE) { if (state.board[i] === opp(pl)) oppList.push(i); }
      const notMill = oppList.filter(i => !inMill(state.board, i, opp(pl)));
      const targets = notMill.length ? notMill : oppList;
      return targets.map(i => ({ type: 'remove', cell: i, to: i }));
    }

    if (state.phase === 'place') {
      const moves = [];
      for (const i of ACTIVE) { if (!state.board[i]) moves.push({ type: 'place', cell: i, to: i }); }
      return moves;
    }

    const myCount = countPlayer(state.board, pl);
    const flying = myCount === 3;
    const moves = [];
    for (const from of ACTIVE) {
      if (state.board[from] !== pl) continue;
      if (flying) {
        for (const to of ACTIVE) { if (!state.board[to]) moves.push({ type: 'move', from, to }); }
      } else {
        for (const to of (ADJ[from] || [])) { if (!state.board[to]) moves.push({ type: 'move', from, to }); }
      }
    }
    return moves;
  }

  function applyMove(state, move) {
    const next = clone(state);
    if (move.type === 'remove') {
      next.board[move.cell] = null;
      next.removing = false;
      const term = isTerminal(next);
      next.winner = term.winner || null;
      if (!next.winner) next.turn = opp(next.turn);
      return next;
    }
    let landPos;
    if (move.type === 'place') {
      next.board[move.cell] = next.turn;
      next.placed[next.turn]++;
      landPos = move.cell;
      if (next.placed.A >= 9 && next.placed.B >= 9) next.phase = 'move';
    } else {
      next.board[move.to] = next.board[move.from];
      next.board[move.from] = null;
      landPos = move.to;
    }
    next.moves++;
    if (inMill(next.board, landPos, next.turn)) {
      const hasOpp = [...ACTIVE].some(i => next.board[i] === opp(next.turn));
      if (hasOpp) { next.removing = true; return next; }
    }
    const term = isTerminal(next);
    next.winner = term.winner || null;
    if (!next.winner) next.turn = opp(next.turn);
    return next;
  }

  function isTerminal(state) {
    if (state.winner) return { done: true, winner: state.winner };
    if (state.removing) return { done: false };
    if (state.phase === 'move') {
      if (countPlayer(state.board, 'A') < 3) return { done: true, winner: 'B' };
      if (countPlayer(state.board, 'B') < 3) return { done: true, winner: 'A' };
      if (!legalMoves(state, state.turn).length) return { done: true, winner: opp(state.turn) };
    }
    return { done: false };
  }

  function score(state) {
    const a = countPlayer(state.board, 'A');
    const b = countPlayer(state.board, 'B');
    return Math.max(0, (a - b) * 20 + 300 - state.moves);
  }

  function aiMove(state) {
    const moves = legalMoves(state, 'B');
    if (!moves.length) return null;
    if (state.removing) return moves[Math.floor(Math.random() * moves.length)];
    for (const m of moves) {
      const b2 = clone(state.board);
      if (m.type === 'place') b2[m.cell] = 'B';
      else if (m.type === 'move') { b2[m.to] = 'B'; b2[m.from] = null; }
      const pos = m.type === 'move' ? m.to : m.cell;
      if (inMill(b2, pos, 'B')) return m;
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }

  function initialState() {
    return {
      board: new Array(49).fill(null),
      turn: 'A', winner: null, moves: 0,
      phase: 'place', removing: false,
      placed: { A: 0, B: 0 },
    };
  }

  window.JakhGameEngines = window.JakhGameEngines || {};
  window.JakhGameEngines['nine-mens-morris'] = {
    id: 'nine-mens-morris',
    boardShape: 'grid',
    rows: 7, cols: 7,
    initialState, legalMoves, applyMove, isTerminal, score, aiMove,
    serialize: clone, deserialize: clone,
    cellContent(state, cell) {
      if (!ACTIVE.has(cell)) return '';
      return state.board[cell] === 'A' ? '●' : state.board[cell] === 'B' ? '○' : '·';
    },
    cellClass(state, cell) {
      if (!ACTIVE.has(cell)) return 'is-void';
      const v = state.board[cell];
      return v ? 'is-' + v.toLowerCase() + ' is-piece' : 'is-node';
    },
    cellLabel(state, cell) {
      if (!ACTIVE.has(cell)) return '';
      const v = state.board[cell];
      return `Position ${cell}${v ? ': ' + (v==='A'?'black':'white') : ': empty'}`;
    },
    rules: 'Place 9 pieces each (Phase 1). Then slide one piece per turn to an adjacent point (Phase 2). Form a mill — 3 in a line — to remove any opponent piece not in a mill. With only 3 pieces left you may fly to any empty point. Win by reducing opponent to 2 pieces or trapping them.',
  };
})();
