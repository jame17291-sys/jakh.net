(function () {
  'use strict';
  // Alquerque: 5x5 board, all positions connected. 12 pieces each.
  // Mandatory jump captures (multi-jump allowed). Pieces move along diagonals and orthogonals.
  // Win: capture all opponent pieces or leave them with no moves.

  const R=5, C=5, N=25;
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function opp(p) { return p==='A'?'B':'A'; }
  function rc(i) { return [Math.floor(i/C), i%C]; }
  function idx(r,c) { return r*C+c; }
  function inside(r,c) { return r>=0&&r<R&&c>=0&&c<C; }

  // All 8 directions, but diagonal only on even-sum squares (like actual alquerque board)
  // Actually full alquerque allows all 8 dirs from any position but pieces can only go forward or sideways (not backward) unless they're making a capture
  const ALL8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

  function canMoveDir(r, c, dr, dc) {
    // Diagonal moves only allowed from squares where (r+c) is even
    if (dr !== 0 && dc !== 0) return (r+c)%2===0;
    return true;
  }

  function getJumps(board, from, player, captured=new Set()) {
    const [r,c] = rc(from);
    const jumps = [];
    for (const [dr,dc] of ALL8) {
      if (!canMoveDir(r,c,dr,dc)) continue;
      const mr=r+dr, mc=c+dc;
      const lr=r+dr*2, lc=c+dc*2;
      if (!inside(mr,mc)||!inside(lr,lc)) continue;
      const mid=idx(mr,mc), land=idx(lr,lc);
      if (board[mid]!==opp(player)) continue;
      if (board[land]!==null) continue;
      if (captured.has(mid)) continue;
      jumps.push({mid,to:land});
    }
    return jumps;
  }

  function legalMoves(state, player) {
    if (state.winner) return [];
    const pl = player || state.turn;
    // Mandatory capture
    const jumps = [];
    state.board.forEach((v,from)=>{
      if(v!==pl) return;
      getJumps(state.board,from,pl).forEach(j=>{
        jumps.push({type:'jump',from,mid:j.mid,to:j.to});
      });
    });
    if (jumps.length) return jumps;
    // Regular moves (can only move forward or sideways — not backward for pawns)
    const fwd = pl==='A'?1:-1;
    const moves = [];
    state.board.forEach((v,from)=>{
      if(v!==pl) return;
      const [r,c]=rc(from);
      for(const [dr,dc] of ALL8) {
        if(!canMoveDir(r,c,dr,dc)) continue;
        if(dr===-fwd && dc===0) continue; // no pure backward
        const nr=r+dr, nc=c+dc;
        if(!inside(nr,nc)) continue;
        if(!state.board[idx(nr,nc)]) moves.push({type:'move',from,to:idx(nr,nc)});
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
    if (legal.mid!=null) next.board[legal.mid] = null;
    next.moves++;
    const term = isTerminal(next);
    next.winner = term.winner || null;
    if (!next.winner) next.turn = opp(next.turn);
    return next;
  }

  function countP(board,p) { return board.filter(v=>v===p).length; }

  function isTerminal(state) {
    if (state.winner) return { done:true, winner:state.winner };
    if (!countP(state.board,'A')) return { done:true, winner:'B' };
    if (!countP(state.board,'B')) return { done:true, winner:'A' };
    if (!legalMoves(state,state.turn).length) return { done:true, winner:opp(state.turn) };
    if (state.moves>=300) { const a=countP(state.board,'A'),b=countP(state.board,'B'); return {done:true,winner:a===b?'draw':a>b?'A':'B'}; }
    return { done:false };
  }

  function score(state) {
    return Math.max(0,(countP(state.board,'A')-countP(state.board,'B'))*20+400-state.moves);
  }

  function aiMove(state) {
    const moves = legalMoves(state,'B');
    if (!moves.length) return null;
    const jumps=moves.filter(m=>m.type==='jump');
    if (jumps.length) return jumps[0];
    return moves[Math.floor(Math.random()*moves.length)];
  }

  function initialState() {
    const board=new Array(N).fill(null);
    for(let i=0;i<12;i++) board[i]='B';
    for(let i=13;i<25;i++) board[i]='A';
    return { board, turn:'A', winner:null, moves:0 };
  }

  window.JakhGameEngines = window.JakhGameEngines || {};
  window.JakhGameEngines.alquerque = {
    id:'alquerque', boardShape:'grid', rows:R, cols:C,
    initialState, legalMoves, applyMove, isTerminal, score, aiMove,
    serialize:clone, deserialize:clone,
    cellContent(state,cell) { return state.board[cell]==='A'?'●':state.board[cell]==='B'?'○':''; },
    cellClass(state,cell) { const v=state.board[cell]; return v?'is-'+v.toLowerCase()+' is-piece':''; },
    cellLabel(state,cell) {
      const v=state.board[cell]; const [r,c]=rc(cell);
      return `Row ${r+1} col ${c+1}${v?': '+(v==='A'?'black':'white'):''}`;
    },
    rules: 'Move pieces along lines and diagonals. Captures are mandatory — jump over opponent pieces to remove them. Multiple jumps in a single turn are allowed. Diagonal moves are only available on positions where the row plus column is even. Win by capturing all opponent pieces.',
  };
})();
