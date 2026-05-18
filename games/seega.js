(function () {
  'use strict';
  // Seega: 5x5 board (center=12 is special — left empty during placement).
  // Phase 1: alternate placing 2 pieces per turn (not on center).
  // Phase 2: orthogonal moves. Custodian capture: move so opponent sandwiched on both sides.
  // Win: capture all opponent pieces OR opponent can't move.

  const R=5, C=5, N=25, CENTER=12;
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function opp(p) { return p === 'A' ? 'B' : 'A'; }
  function rc(i) { return [Math.floor(i/C), i%C]; }
  function idx(r,c) { return r*C+c; }
  function inside(r,c) { return r>=0&&r<R&&c>=0&&c<C; }
  const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];

  function initialState() {
    return { board: new Array(N).fill(null), turn:'A', winner:null, moves:0, phase:'place', placedThis:0 };
  }

  function legalMoves(state, player) {
    if (state.winner) return [];
    const pl = player || state.turn;
    if (state.phase === 'place') {
      return state.board.map((v,i) => (v===null && i!==CENTER) ? {type:'place', cell:i, to:i} : null).filter(Boolean);
    }
    const moves = [];
    state.board.forEach((v, from) => {
      if (v !== pl) return;
      const [r,c] = rc(from);
      for (const [dr,dc] of ORTH) {
        const nr=r+dr, nc=c+dc;
        if (!inside(nr,nc)) continue;
        const to = idx(nr,nc);
        if (!state.board[to]) moves.push({type:'move', from, to});
      }
    });
    return moves;
  }

  function getCustodianCaptures(board, to, player) {
    const captured = [];
    const [r,c] = rc(to);
    for (const [dr,dc] of ORTH) {
      // Check if moving to `to` sandwiches an opponent piece
      const nr1=r+dr, nc1=c+dc;
      const nr2=r-dr, nc2=c-dc;
      if (!inside(nr1,nc1) || !inside(nr2,nc2)) continue;
      const mid = idx(nr1,nc1);
      const far = idx(nr2,nc2); // the anchor (already our piece or center)
      if (board[mid] === opp(player) && (board[far] === player || far === CENTER)) {
        captured.push(mid);
      }
    }
    return captured;
  }

  function applyMove(state, move) {
    const next = clone(state);
    if (move.type === 'place') {
      if (next.board[move.cell] !== null || move.cell === CENTER) return next;
      next.board[move.cell] = next.turn;
      next.placedThis = (next.placedThis || 0) + 1;
      next.moves++;
      if (next.placedThis >= 2) {
        next.placedThis = 0;
        next.turn = opp(next.turn);
        // Check if placement phase over: 12 pieces each placed (center stays empty)
        const a = next.board.filter(v=>v==='A').length;
        const b = next.board.filter(v=>v==='B').length;
        if (a >= 12 && b >= 12) next.phase = 'move';
      }
      return next;
    }
    // Move
    if (!next.board[move.from] || next.board[move.to]) return next;
    next.board[move.to] = next.board[move.from];
    next.board[move.from] = null;
    const caps = getCustodianCaptures(next.board, move.to, next.turn);
    caps.forEach(i => { next.board[i] = null; });
    next.moves++;
    const term = isTerminal(next);
    next.winner = term.winner || null;
    if (!next.winner) next.turn = opp(next.turn);
    return next;
  }

  function countPieces(board, pl) { return board.filter(v=>v===pl).length; }

  function isTerminal(state) {
    if (state.winner) return { done:true, winner:state.winner };
    if (state.phase === 'move') {
      if (countPieces(state.board,'A') === 0) return { done:true, winner:'B' };
      if (countPieces(state.board,'B') === 0) return { done:true, winner:'A' };
      if (!legalMoves(state, state.turn).length) return { done:true, winner:opp(state.turn) };
    }
    if (state.moves >= 300) {
      const a=countPieces(state.board,'A'), b=countPieces(state.board,'B');
      return { done:true, winner: a===b?'draw':a>b?'A':'B' };
    }
    return { done:false };
  }

  function score(state) {
    const a=countPieces(state.board,'A'), b=countPieces(state.board,'B');
    return Math.max(0, (a-b)*20 + 400 - state.moves);
  }

  function aiMove(state) {
    const moves = legalMoves(state, 'B');
    if (!moves.length) return null;
    if (state.phase === 'place') return moves[Math.floor(Math.random()*moves.length)];
    // Prefer moves that capture
    const capturing = moves.filter(m => {
      const b2 = state.board.slice();
      b2[m.to] = b2[m.from]; b2[m.from] = null;
      return getCustodianCaptures(b2, m.to, 'B').length > 0;
    });
    if (capturing.length) return capturing[0];
    return moves[Math.floor(Math.random()*moves.length)];
  }

  window.JakhGameEngines = window.JakhGameEngines || {};
  window.JakhGameEngines.seega = {
    id:'seega', boardShape:'grid', rows:R, cols:C,
    initialState, legalMoves, applyMove, isTerminal, score, aiMove,
    serialize:clone, deserialize:clone,
    cellContent(state, cell) {
      if (cell===CENTER && !state.board[cell]) return '✦';
      return state.board[cell]==='A'?'●':state.board[cell]==='B'?'○':'';
    },
    cellClass(state, cell) {
      const v=state.board[cell];
      if (cell===CENTER) return v?'is-'+v.toLowerCase()+' is-piece':'is-center';
      return v?'is-'+v.toLowerCase()+' is-piece':'';
    },
    cellLabel(state, cell) {
      const v=state.board[cell];
      const [r,c]=rc(cell);
      return `Row ${r+1} col ${c+1}${v?': '+(v==='A'?'black':'white'):''}`;
    },
    rules: 'Phase 1 — Place 2 pieces each per turn, avoiding the center. Phase 2 — Move one piece orthogonally per turn. Capture by moving so an opponent piece is sandwiched between your piece and another friendly piece (or the center). Win by capturing all opponent pieces.',
  };
})();
