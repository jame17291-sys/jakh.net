(function () {
  'use strict';
  // Fox and Geese: 5x5+ cross-shaped board simplified to 5x5.
  // Fox (A, 1 piece at center top) vs 13 Geese (B).
  // Fox can move AND capture by jumping over geese (like checkers, all 8 dirs).
  // Geese can only move forward (toward fox starting side) or sideways — not backward.
  // Geese win by trapping fox (no moves). Fox wins by breaking through to back row.

  const R=5, C=5, N=25;
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function rc(i) { return [Math.floor(i/C), i%C]; }
  function idx(r,c) { return r*C+c; }
  function inside(r,c) { return r>=0&&r<R&&c>=0&&c<C; }
  const ALL8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  // Geese move forward (row increases toward row 4) or sideways — not backward (row decreasing)
  const GOOSE_DIRS = [[1,0],[0,1],[0,-1],[1,1],[1,-1]];

  function initialState() {
    const board = new Array(N).fill(null);
    board[idx(0,2)] = 'A'; // Fox at top-center
    // Geese fill bottom 3 rows
    for (let r=2;r<5;r++) for (let c=0;c<5;c++) board[idx(r,c)]='B';
    return { board, turn:'A', winner:null, moves:0 };
  }

  function legalMoves(state, player) {
    if (state.winner) return [];
    const pl = player || state.turn;
    const moves = [];
    state.board.forEach((piece,from) => {
      if (piece !== pl) return;
      const [r,c] = rc(from);
      if (pl === 'A') {
        // Fox: move to adjacent empty OR jump over a goose
        for (const [dr,dc] of ALL8) {
          const nr=r+dr, nc=c+dc;
          if (!inside(nr,nc)) continue;
          const to=idx(nr,nc);
          if (!state.board[to]) { moves.push({type:'move',from,to}); continue; }
          if (state.board[to]==='B') {
            // Jump
            const lr=r+dr*2, lc=c+dc*2;
            if (inside(lr,lc) && !state.board[idx(lr,lc)]) {
              moves.push({type:'jump',from,to:idx(lr,lc),cap:to});
            }
          }
        }
      } else {
        // Geese: move only in allowed directions
        for (const [dr,dc] of GOOSE_DIRS) {
          const nr=r+dr, nc=c+dc;
          if (!inside(nr,nc)) continue;
          const to=idx(nr,nc);
          if (!state.board[to]) moves.push({type:'move',from,to});
        }
      }
    });
    return moves;
  }

  function applyMove(state, move) {
    const legal = legalMoves(state,state.turn).find(m=>m.from===move.from&&m.to===move.to);
    if (!legal) return clone(state);
    const next = clone(state);
    next.board[legal.to] = next.board[legal.from];
    next.board[legal.from] = null;
    if (legal.cap != null) next.board[legal.cap] = null;
    next.moves++;
    const term = isTerminal(next);
    next.winner = term.winner || null;
    if (!next.winner) next.turn = next.turn === 'A' ? 'B' : 'A';
    return next;
  }

  function isTerminal(state) {
    if (state.winner) return { done:true, winner:state.winner };
    const foxPos = state.board.indexOf('A');
    if (foxPos === -1) return { done:true, winner:'B' };
    // Fox escapes to row 4 (bottom)
    if (Math.floor(foxPos/C) === R-1) return { done:true, winner:'A' };
    // Geese reduced below 3 — fox wins
    if (state.board.filter(v=>v==='B').length < 3) return { done:true, winner:'A' };
    // Fox trapped
    if (!legalMoves({...state,turn:'A'},'A').length) return { done:true, winner:'B' };
    if (state.moves >= 200) return { done:true, winner:'draw' };
    return { done:false };
  }

  function score(state) {
    const foxPos = state.board.indexOf('A');
    if (foxPos===-1) return 0;
    const geese = state.board.filter(v=>v==='B').length;
    return Math.max(0, Math.floor(foxPos/C)*80 + (13-geese)*30 + 200 - state.moves);
  }

  function aiMove(state) {
    const moves = legalMoves(state,'B');
    if (!moves.length) return null;
    // Try to trap the fox
    const foxPos = state.board.indexOf('A');
    if (foxPos!==-1) {
      const [fr,fc] = rc(foxPos);
      const toward = moves.filter(m=>{
        const [tr,tc]=rc(m.to);
        return Math.abs(tr-fr)+Math.abs(tc-fc) < Math.abs(rc(m.from)[0]-fr)+Math.abs(rc(m.from)[1]-fc);
      });
      if (toward.length) return toward[Math.floor(Math.random()*toward.length)];
    }
    return moves[Math.floor(Math.random()*moves.length)];
  }

  window.JakhGameEngines = window.JakhGameEngines || {};
  window.JakhGameEngines['fox-and-geese'] = {
    id:'fox-and-geese', boardShape:'grid', rows:R, cols:C,
    initialState, legalMoves, applyMove, isTerminal, score, aiMove,
    serialize:clone, deserialize:clone,
    cellContent(state,cell) {
      return state.board[cell]==='A'?'🦊':state.board[cell]==='B'?'🪿':'';
    },
    cellClass(state,cell) {
      const v=state.board[cell];
      return v?'is-'+v.toLowerCase()+' is-piece':'';
    },
    cellLabel(state,cell) {
      const v=state.board[cell]; const [r,c]=rc(cell);
      return `Row ${r+1} col ${c+1}${v?': '+(v==='A'?'Fox':'Goose'):''}`;
    },
    rules: 'The fox (🦊) moves in all 8 directions and can jump over geese to capture them. Geese (🪿) can only advance forward or sideways — never retreat. Geese win by surrounding the fox with no moves. Fox wins by breaking through to the far row or reducing geese below 3.',
  };
})();
