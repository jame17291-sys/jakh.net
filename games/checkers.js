(function () {
  'use strict';

  const R = 8, C = 8;
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function opp(p) { return p === 'A' ? 'B' : 'A'; }
  function idx(r, c) { return r * C + c; }
  function rc(i) { return [Math.floor(i / C), i % C]; }
  function inside(r, c) { return r >= 0 && r < R && c >= 0 && c < C; }
  function owner(piece) { return piece ? piece[0] : null; }
  function isKing(piece) { return piece && piece.length === 2 && piece[1] === 'K'; }
  function moveDirs(player, king) {
    const fwd = player === 'A' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
    return king ? [[-1,-1],[-1,1],[1,-1],[1,1]] : fwd;
  }

  function findJumps(board, from, player, captured = new Set()) {
    const piece = board[from];
    const king = isKing(piece);
    const [r, c] = rc(from);
    const result = [];
    for (const [dr, dc] of moveDirs(player, king)) {
      const mr = r + dr, mc = c + dc;
      const lr = r + dr*2, lc = c + dc*2;
      if (!inside(mr, mc) || !inside(lr, lc)) continue;
      const mid = idx(mr, mc);
      const land = idx(lr, lc);
      if (owner(board[mid]) !== opp(player)) continue;
      if (board[land] !== null) continue;
      if (captured.has(mid)) continue;
      result.push({ type: 'jump', from, to: land, cap: mid, captured: [...captured, mid] });
    }
    return result;
  }

  function allJumpChains(board, from, player, captured = new Set(), path = []) {
    const piece = board[from];
    const jumps = findJumps(board, from, player, captured);
    if (!jumps.length) {
      return path.length ? [path] : [];
    }
    const chains = [];
    for (const j of jumps) {
      // simulate jump
      const b2 = board.slice();
      const promoted = !isKing(piece) && ((player === 'A' && Math.floor(j.to / C) === 0) || (player === 'B' && Math.floor(j.to / C) === R-1));
      b2[j.to] = promoted ? player + 'K' : piece;
      b2[j.cap] = null;
      b2[j.from] = null;
      const caps2 = new Set([...captured, j.cap]);
      const sub = allJumpChains(b2, j.to, player, caps2, [...path, j]);
      if (sub.length) chains.push(...sub);
      else chains.push([...path, j]);
    }
    return chains;
  }

  function legalMoves(state, player) {
    if (state.winner) return [];
    const pl = player || state.turn;
    // Mandatory jump
    const chains = [];
    state.board.forEach((piece, from) => {
      if (owner(piece) !== pl) return;
      chains.push(...allJumpChains(state.board, from, pl));
    });
    if (chains.length) {
      // return as single move objects: from = chain[0].from, to = last.to, caps = all caps
      return chains.map(chain => ({
        type: 'jump',
        from: chain[0].from,
        to: chain[chain.length-1].to,
        caps: chain.map(j => j.cap),
      }));
    }
    // Simple diagonal moves
    const moves = [];
    state.board.forEach((piece, from) => {
      if (owner(piece) !== pl) return;
      const king = isKing(piece);
      const [r, c] = rc(from);
      for (const [dr, dc] of moveDirs(pl, king)) {
        const nr = r + dr, nc = c + dc;
        if (!inside(nr, nc)) continue;
        const to = idx(nr, nc);
        if (state.board[to] === null) moves.push({ type: 'move', from, to });
      }
    });
    return moves;
  }

  function applyMove(state, move) {
    const legal = legalMoves(state, state.turn).find(m => m.from === move.from && m.to === move.to);
    if (!legal) return clone(state);
    const next = clone(state);
    const piece = next.board[legal.from];
    // Remove captured pieces
    if (legal.caps) legal.caps.forEach(i => { next.board[i] = null; });
    // Move piece
    const backRank = next.turn === 'A' ? 0 : R-1;
    const promoted = !isKing(piece) && Math.floor(legal.to / C) === backRank;
    next.board[legal.to] = promoted ? next.turn + 'K' : piece;
    next.board[legal.from] = null;
    next.moves++;
    const term = isTerminal(next);
    next.winner = term.winner || null;
    if (!next.winner) next.turn = opp(next.turn);
    return next;
  }

  function countPieces(board, player) {
    return board.filter(p => owner(p) === player).length;
  }

  function isTerminal(state) {
    if (state.winner) return { done: true, winner: state.winner };
    const a = countPieces(state.board, 'A');
    const b = countPieces(state.board, 'B');
    if (a === 0) return { done: true, winner: 'B' };
    if (b === 0) return { done: true, winner: 'A' };
    if (!legalMoves(state, state.turn).length) return { done: true, winner: opp(state.turn) };
    if (state.moves >= 200) return { done: true, winner: a === b ? 'draw' : a > b ? 'A' : 'B' };
    return { done: false };
  }

  function score(state) {
    const a = countPieces(state.board, 'A');
    const b = countPieces(state.board, 'B');
    const aK = state.board.filter(p => p === 'AK').length;
    const bK = state.board.filter(p => p === 'BK').length;
    return Math.max(0, (a - b) * 12 + (aK - bK) * 6 + 600 - state.moves * 2);
  }

  function aiMove(state) {
    const moves = legalMoves(state, 'B');
    if (!moves.length) return null;
    // prefer jump, then king move, then furthest advance
    const jumps = moves.filter(m => m.type === 'jump');
    if (jumps.length) return jumps.sort((a,b) => (b.caps||[]).length - (a.caps||[]).length)[0];
    const kingMoves = moves.filter(m => state.board[m.from] === 'BK');
    if (kingMoves.length && Math.random() < 0.7) return kingMoves[Math.floor(Math.random() * kingMoves.length)];
    return moves[Math.floor(Math.random() * moves.length)];
  }

  function initialState() {
    const board = new Array(R * C).fill(null);
    for (let r = 0; r < 3; r++) for (let c = 0; c < C; c++) if ((r + c) % 2) board[idx(r,c)] = 'B';
    for (let r = 5; r < R; r++) for (let c = 0; c < C; c++) if ((r + c) % 2) board[idx(r,c)] = 'A';
    return { board, turn: 'A', winner: null, moves: 0 };
  }

  window.JakhGameEngines = window.JakhGameEngines || {};
  window.JakhGameEngines.checkers = {
    id: 'checkers',
    boardShape: 'grid',
    rows: R, cols: C,
    initialState, legalMoves, applyMove, isTerminal, score, aiMove,
    serialize: clone, deserialize: clone,
    cellContent(state, cell) {
      const p = state.board[cell];
      if (!p) return '';
      if (p === 'AK') return '♚';
      if (p === 'BK') return '♔';
      return p[0] === 'A' ? '●' : '○';
    },
    cellClass(state, cell) {
      const p = state.board[cell];
      if (!p) return (Math.floor(cell/C) + cell%C) % 2 ? 'is-dark-sq' : '';
      return 'is-' + p[0].toLowerCase() + ' is-piece' + (isKing(p) ? ' is-king' : '');
    },
    cellLabel(state, cell) {
      const p = state.board[cell];
      const [r, c] = rc(cell);
      return `${String.fromCharCode(97+c)}${R-r}${p ? ' ' + (p[0]==='A'?'black':'white') + (isKing(p)?' king':' piece') : ''}`;
    },
    rules: 'Move diagonally on dark squares. Captures are mandatory — jump over opponent pieces to remove them. Chain multiple jumps in one turn. Reach the back rank to become a king, which can move and capture in all diagonal directions.',
  };
})();
