(function () {
  'use strict';

  const R = 8, C = 8;
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const CORNERS = new Set([0, 7, 56, 63]);
  const EDGES = new Set([1,6,8,15,48,55,57,62]);

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function opp(p) { return p === 'A' ? 'B' : 'A'; }
  function idx(r, c) { return r * C + c; }
  function rc(i) { return [Math.floor(i / C), i % C]; }
  function inside(r, c) { return r >= 0 && r < R && c >= 0 && c < C; }

  function getFlips(board, i, player) {
    const [r, c] = rc(i);
    const result = [];
    for (const [dr, dc] of DIRS) {
      const line = [];
      let nr = r + dr, nc = c + dc;
      while (inside(nr, nc) && board[idx(nr, nc)] === opp(player)) {
        line.push(idx(nr, nc));
        nr += dr; nc += dc;
      }
      if (line.length && inside(nr, nc) && board[idx(nr, nc)] === player) {
        result.push(...line);
      }
    }
    return result;
  }

  function computeLegal(board, player) {
    const moves = [];
    for (let i = 0; i < R * C; i++) {
      if (board[i]) continue;
      if (getFlips(board, i, player).length) moves.push({ type: 'drop', cell: i });
    }
    return moves;
  }

  function initialState() {
    const board = new Array(R * C).fill(null);
    board[idx(3,3)] = 'A'; board[idx(3,4)] = 'B';
    board[idx(4,3)] = 'B'; board[idx(4,4)] = 'A';
    return { board, turn: 'A', winner: null, moves: 0 };
  }

  function legalMoves(state, player) {
    if (state.winner) return [];
    return computeLegal(state.board, player || state.turn);
  }

  function applyMove(state, move) {
    const next = clone(state);
    const flips = getFlips(next.board, move.cell, next.turn);
    if (!flips.length || next.board[move.cell]) return next;
    next.board[move.cell] = next.turn;
    flips.forEach(i => { next.board[i] = next.turn; });
    next.moves++;
    const term = isTerminal(next);
    if (term.done) { next.winner = term.winner; return next; }
    const nextTurn = opp(next.turn);
    if (computeLegal(next.board, nextTurn).length) {
      next.turn = nextTurn;
    }
    // else current player plays again (opponent skipped)
    return next;
  }

  function isTerminal(state) {
    if (state.winner) return { done: true, winner: state.winner };
    const full = state.board.every(Boolean);
    const noMoves = !computeLegal(state.board, 'A').length && !computeLegal(state.board, 'B').length;
    if (full || noMoves) {
      const a = state.board.filter(v => v === 'A').length;
      const b = state.board.filter(v => v === 'B').length;
      return { done: true, winner: a === b ? 'draw' : a > b ? 'A' : 'B' };
    }
    return { done: false };
  }

  function score(state) {
    const a = state.board.filter(v => v === 'A').length;
    const b = state.board.filter(v => v === 'B').length;
    let corner = 0;
    CORNERS.forEach(i => { corner += state.board[i] === 'A' ? 15 : state.board[i] === 'B' ? -15 : 0; });
    return Math.max(0, (a - b) * 8 + corner * 6 + 500 - state.moves * 2);
  }

  function aiMove(state) {
    const moves = legalMoves(state, 'B');
    if (!moves.length) return null;
    const corner = moves.find(m => CORNERS.has(m.cell));
    if (corner) return corner;
    const safe = moves.filter(m => !EDGES.has(m.cell));
    const pool = safe.length ? safe : moves;
    return pool.sort((a, b) => getFlips(state.board, b.cell, 'B').length - getFlips(state.board, a.cell, 'B').length)[0];
  }

  window.JakhGameEngines = window.JakhGameEngines || {};
  window.JakhGameEngines.reversi = {
    id: 'reversi',
    boardShape: 'grid',
    rows: R, cols: C,
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
      return `Row ${r+1} col ${c+1}${p ? ', ' + (p === 'A' ? 'black disc' : 'white disc') : ''}`;
    },
    rules: 'Place a disc to sandwich and flip opponent discs in any direction. Corners are unflippable — control them first. Win by holding more discs when no moves remain.',
  };
})();
