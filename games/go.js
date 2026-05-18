(function () {
  'use strict';

  const SIZE = 9;
  const N = SIZE * SIZE;
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function opp(p) { return p === 'A' ? 'B' : 'A'; }
  function idx(r, c) { return r * SIZE + c; }
  function rc(i) { return [Math.floor(i / SIZE), i % SIZE]; }
  function inside(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
  const DIRS4 = [[1,0],[-1,0],[0,1],[0,-1]];

  function neighbors(i) {
    const [r, c] = rc(i);
    return DIRS4.map(([dr,dc]) => [r+dr, c+dc]).filter(([r,c]) => inside(r,c)).map(([r,c]) => idx(r,c));
  }

  function getGroup(board, start) {
    const color = board[start];
    const group = new Set();
    const stack = [start];
    while (stack.length) {
      const i = stack.pop();
      if (group.has(i)) continue;
      group.add(i);
      for (const n of neighbors(i)) {
        if (board[n] === color && !group.has(n)) stack.push(n);
      }
    }
    return group;
  }

  function getLiberties(board, group) {
    const libs = new Set();
    for (const i of group) {
      for (const n of neighbors(i)) {
        if (board[n] === null) libs.add(n);
      }
    }
    return libs;
  }

  function removeCaptures(board, player) {
    // Remove opponent groups with no liberties
    const visited = new Set();
    for (let i = 0; i < N; i++) {
      if (board[i] !== opp(player) || visited.has(i)) continue;
      const group = getGroup(board, i);
      group.forEach(v => visited.add(v));
      if (!getLiberties(board, group).size) {
        group.forEach(v => { board[v] = null; });
      }
    }
  }

  function isLegal(state, cell, player) {
    if (state.board[cell] !== null) return false;
    const b2 = state.board.slice();
    b2[cell] = player;
    removeCaptures(b2, player);
    // Check self-capture (suicide) — not allowed unless it captures opponent
    const selfGroup = getGroup(b2, cell);
    if (!getLiberties(b2, selfGroup).size) return false;
    // Ko: don't allow returning to previous board state
    if (state.prevBoard && b2.join(',') === state.prevBoard) return false;
    return true;
  }

  function legalMoves(state, player) {
    if (state.winner) return [];
    const pl = player || state.turn;
    const moves = [];
    for (let i = 0; i < N; i++) {
      if (isLegal(state, i, pl)) moves.push({ type: 'drop', cell: i });
    }
    moves.push({ type: 'pass', cell: -1 });
    return moves;
  }

  function initialState() {
    return { board: new Array(N).fill(null), turn: 'A', winner: null, moves: 0, prevBoard: null, passes: 0 };
  }

  function applyMove(state, move) {
    const next = clone(state);
    if (move.cell === -1 || move.type === 'pass') {
      next.passes = (next.passes || 0) + 1;
      next.moves++;
      if (next.passes >= 2) {
        // Both passed: score by stone count (simplified)
        const a = next.board.filter(v => v === 'A').length;
        const b = next.board.filter(v => v === 'B').length;
        // B gets 6.5 komi equivalent — treat as 6 for integers
        next.winner = (a > b + 6) ? 'A' : (b + 6 >= a) ? 'B' : 'draw';
      } else {
        next.turn = opp(next.turn);
      }
      return next;
    }
    if (!isLegal(state, move.cell, state.turn)) return next;
    next.prevBoard = next.board.join(',');
    next.board[move.cell] = next.turn;
    removeCaptures(next.board, next.turn);
    next.passes = 0;
    next.moves++;
    const term = isTerminal(next);
    next.winner = term.winner || null;
    if (!next.winner) next.turn = opp(next.turn);
    return next;
  }

  function isTerminal(state) {
    if (state.winner) return { done: true, winner: state.winner };
    if ((state.passes || 0) >= 2) {
      const a = state.board.filter(v => v === 'A').length;
      const b = state.board.filter(v => v === 'B').length;
      return { done: true, winner: a > b + 6 ? 'A' : 'B' };
    }
    if (state.moves >= 200) {
      const a = state.board.filter(v => v === 'A').length;
      const b = state.board.filter(v => v === 'B').length;
      return { done: true, winner: a > b + 6 ? 'A' : b + 6 >= a ? 'B' : 'draw' };
    }
    return { done: false };
  }

  function score(state) {
    const a = state.board.filter(v => v === 'A').length;
    const b = state.board.filter(v => v === 'B').length;
    return Math.max(0, (a - b) * 10 + 300);
  }

  function aiMove(state) {
    const moves = legalMoves(state, 'B').filter(m => m.cell !== -1);
    if (!moves.length) return { type: 'pass', cell: -1 };
    // Prefer moves that capture opponent groups
    for (const m of moves) {
      const b2 = state.board.slice();
      b2[m.cell] = 'B';
      const before = state.board.filter(v => v === 'A').length;
      removeCaptures(b2, 'B');
      const after = b2.filter(v => v === 'A').length;
      if (after < before) return m;
    }
    // Prefer center and third-line moves
    const center = idx(4, 4);
    const starPoints = [idx(2,2),idx(2,6),idx(6,2),idx(6,6),idx(4,4),idx(2,4),idx(4,2),idx(6,4),idx(4,6)];
    for (const sp of starPoints) {
      if (moves.find(m => m.cell === sp)) return { type: 'drop', cell: sp };
    }
    return moves[Math.floor(Math.random() * Math.min(moves.length, 8))];
  }

  window.JakhGameEngines = window.JakhGameEngines || {};
  window.JakhGameEngines.go = {
    id: 'go',
    boardShape: 'grid',
    rows: SIZE, cols: SIZE,
    initialState, legalMoves, applyMove, isTerminal, score, aiMove,
    serialize: clone, deserialize: clone,
    cellContent(state, cell) {
      return state.board[cell] === 'A' ? '●' : state.board[cell] === 'B' ? '○' : '';
    },
    cellClass(state, cell) {
      return state.board[cell] ? 'is-' + state.board[cell].toLowerCase() + ' is-piece' : '';
    },
    cellLabel(state, cell) {
      const [r, c] = rc(cell);
      const p = state.board[cell];
      return `${String.fromCharCode(65+c)}${SIZE-r}${p ? ' ' + (p==='A'?'black':'white') + ' stone' : ''}`;
    },
    rules: 'Place stones on empty intersections. Surround opponent groups to capture them — a group with no liberties (empty adjacent points) is removed. Both players passing ends the game; the player with more stones plus territory wins. Black plays first; White gets 6-point compensation (komi).',
  };
})();
