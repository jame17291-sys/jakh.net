(function () {
  'use strict';
  // Konane: 6x6 alternating board. Players jump over opponent pieces to capture.
  // Opening: remove one piece each to create gaps. Then jump in straight lines only.
  // Win: opponent cannot make a jump.

  const R=6, C=6, N=36;
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function opp(p) { return p==='A'?'B':'A'; }
  function rc(i) { return [Math.floor(i/C), i%C]; }
  function idx(r,c) { return r*C+c; }
  function inside(r,c) { return r>=0&&r<R&&c>=0&&c<C; }
  const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];

  function initialState() {
    const board = Array.from({length:N}, (_,i) => (Math.floor(i/C)+i%C)%2===0 ? 'A' : 'B');
    return { board, turn:'A', winner:null, moves:0, phase:'remove', removed:{A:false,B:false} };
  }

  function getJumps(board, from, player, visited=new Set()) {
    const [r,c] = rc(from);
    const jumps = [];
    for (const [dr,dc] of ORTH) {
      const mr=r+dr, mc=c+dc;
      const lr=r+dr*2, lc=c+dc*2;
      if (!inside(mr,mc)||!inside(lr,lc)) continue;
      const mid=idx(mr,mc), land=idx(lr,lc);
      if (board[mid]!==opp(player)) continue;
      if (board[land]!==null) continue;
      if (visited.has(mid)) continue;
      jumps.push({type:'jump',from,mid,to:land});
    }
    return jumps;
  }

  function legalMoves(state, player) {
    if (state.winner) return [];
    const pl = player || state.turn;
    if (state.phase === 'remove') {
      // Each player removes one of their pieces (A removes from corners/center, B responds)
      if (!state.removed.A) {
        // A removes piece from center area: 14, 15, 20, 21 or corners 0,5,30,35
        return [14,15,20,21,0,5,30,35]
          .filter(i=>state.board[i]===pl)
          .map(i=>({type:'remove',cell:i,to:i}));
      } else {
        // B removes an adjacent piece to the gap A created
        const gap = state.board.findIndex((v,i,arr)=>v===null);
        if (gap===-1) return [];
        const [r,c]=rc(gap);
        return ORTH.map(([dr,dc])=>{
          const nr=r+dr,nc=c+dc;
          if(!inside(nr,nc)) return null;
          const i=idx(nr,nc);
          if(state.board[i]!==pl) return null;
          return {type:'remove',cell:i,to:i};
        }).filter(Boolean);
      }
    }
    // Jump moves (can chain)
    const moves = [];
    const done = new Set();
    state.board.forEach((v,from)=>{
      if(v!==pl) return;
      getJumps(state.board,from,pl).forEach(j=>{
        const key=`${j.from}-${j.to}`;
        if(!done.has(key)){ done.add(key); moves.push(j); }
      });
    });
    return moves;
  }

  function applyMove(state, move) {
    const next = clone(state);
    if (move.type === 'remove') {
      next.board[move.cell] = null;
      if (!next.removed.A) {
        next.removed.A = true;
        // now B removes
      } else {
        next.removed.B = true;
        next.phase = 'play';
        next.turn = 'A';
      }
      next.moves++;
      return next;
    }
    // Jump
    next.board[move.to] = next.board[move.from];
    next.board[move.from] = null;
    next.board[move.mid] = null;
    next.moves++;
    const term = isTerminal(next);
    next.winner = term.winner || null;
    if (!next.winner) next.turn = opp(next.turn);
    return next;
  }

  function isTerminal(state) {
    if (state.winner) return { done:true, winner:state.winner };
    if (state.phase !== 'play') return { done:false };
    if (!legalMoves(state, state.turn).length) return { done:true, winner:opp(state.turn) };
    return { done:false };
  }

  function score(state) {
    const a=state.board.filter(v=>v==='A').length, b=state.board.filter(v=>v==='B').length;
    return Math.max(0, (a-b)*10 + 200 - state.moves);
  }

  function aiMove(state) {
    const moves = legalMoves(state,'B');
    if (!moves.length) return null;
    if (state.phase==='remove') return moves[0];
    return moves[Math.floor(Math.random()*moves.length)];
  }

  window.JakhGameEngines = window.JakhGameEngines || {};
  window.JakhGameEngines.konane = {
    id:'konane', boardShape:'grid', rows:R, cols:C,
    initialState, legalMoves, applyMove, isTerminal, score, aiMove,
    serialize:clone, deserialize:clone,
    cellContent(state,cell) {
      return state.board[cell]==='A'?'●':state.board[cell]==='B'?'○':'';
    },
    cellClass(state,cell) {
      const v=state.board[cell];
      return v?'is-'+v.toLowerCase()+' is-piece':'';
    },
    cellLabel(state,cell) {
      const v=state.board[cell]; const [r,c]=rc(cell);
      return `${String.fromCharCode(65+c)}${R-r}${v?': '+(v==='A'?'black':'white'):''}`;
    },
    rules: 'Opening: each player removes one piece to create a gap. Then take turns jumping over adjacent opponent pieces in straight lines — captured pieces are removed. A single turn can chain multiple jumps if available. Win by leaving your opponent with no legal jumps.',
  };
})();
