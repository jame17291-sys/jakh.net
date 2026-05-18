(function () {
  'use strict';
  // Fanorona: 5x9 board. Approach capture (moving toward opponent row captures it),
  // or withdrawal capture (moving away from opponent captures it).
  // During a turn, can chain multiple captures but cannot revisit a direction.

  const R=5, C=9, N=45;
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function opp(p) { return p==='A'?'B':'A'; }
  function rc(i) { return [Math.floor(i/C), i%C]; }
  function idx(r,c) { return r*C+c; }
  function inside(r,c) { return r>=0&&r<R&&c>=0&&c<C; }
  const ALL8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  function canDiag(r,c) { return (r+c)%2===0; }

  function getCaptureMoves(board, from, player, usedDirs=new Set()) {
    const [r,c]=rc(from);
    const moves=[];
    for(const [dr,dc] of ALL8) {
      if(dr!==0&&dc!==0&&!canDiag(r,c)) continue;
      const dirKey=`${dr},${dc}`;
      if(usedDirs.has(dirKey)) continue;
      const nr=r+dr,nc=c+dc;
      if(!inside(nr,nc)) continue;
      const to=idx(nr,nc);
      if(board[to]!==null) continue;
      // Approach: piece at nr+dr,nc+dc is opponent
      const ar=r+dr*2,ac=c+dc*2;
      if(inside(ar,ac)&&board[idx(ar,ac)]===opp(player)){
        moves.push({type:'approach',from,to,dir:[dr,dc],captured:[idx(ar,ac)]});
      }
      // Withdrawal: piece behind from (r-dr,c-dc) is opponent
      const wr=r-dr,wc=c-dc;
      if(inside(wr,wc)&&board[idx(wr,wc)]===opp(player)){
        moves.push({type:'withdrawal',from,to,dir:[dr,dc],captured:[idx(wr,wc)]});
      }
    }
    return moves;
  }

  function legalMoves(state, player) {
    if(state.winner) return [];
    const pl=player||state.turn;
    // Mandatory capture if available
    const captures=[];
    state.board.forEach((v,from)=>{
      if(v!==pl) return;
      getCaptureMoves(state.board,from,pl).forEach(m=>captures.push(m));
    });
    if(captures.length) return captures;
    // Regular moves
    const moves=[];
    state.board.forEach((v,from)=>{
      if(v!==pl) return;
      const [r,c]=rc(from);
      for(const [dr,dc] of ALL8){
        if(dr!==0&&dc!==0&&!canDiag(r,c)) continue;
        const nr=r+dr,nc=c+dc;
        if(!inside(nr,nc)) continue;
        const to=idx(nr,nc);
        if(!state.board[to]) moves.push({type:'move',from,to});
      }
    });
    return moves;
  }

  function applyMove(state, move) {
    const legal=legalMoves(state,state.turn).find(m=>m.from===move.from&&m.to===move.to&&m.type===move.type);
    if(!legal) return clone(state);
    const next=clone(state);
    next.board[legal.to]=next.board[legal.from];
    next.board[legal.from]=null;
    if(legal.captured) legal.captured.forEach(i=>{next.board[i]=null;});
    next.moves++;
    const term=isTerminal(next);
    next.winner=term.winner||null;
    if(!next.winner) next.turn=opp(next.turn);
    return next;
  }

  function countP(board,p){return board.filter(v=>v===p).length;}

  function isTerminal(state){
    if(state.winner) return {done:true,winner:state.winner};
    if(!countP(state.board,'A')) return {done:true,winner:'B'};
    if(!countP(state.board,'B')) return {done:true,winner:'A'};
    if(!legalMoves(state,state.turn).length) return {done:true,winner:opp(state.turn)};
    if(state.moves>=400){const a=countP(state.board,'A'),b=countP(state.board,'B');return{done:true,winner:a===b?'draw':a>b?'A':'B'};}
    return {done:false};
  }

  function score(state){return Math.max(0,(countP(state.board,'A')-countP(state.board,'B'))*15+400-state.moves);}

  function aiMove(state){
    const moves=legalMoves(state,'B');
    if(!moves.length) return null;
    const caps=moves.filter(m=>m.captured&&m.captured.length);
    if(caps.length) return caps[0];
    return moves[Math.floor(Math.random()*moves.length)];
  }

  function initialState(){
    const board=new Array(N).fill(null);
    for(let i=0;i<22;i++) board[i]='B';
    board[22]=null; // center empty
    for(let i=23;i<45;i++) board[i]='A';
    return {board,turn:'A',winner:null,moves:0};
  }

  window.JakhGameEngines=window.JakhGameEngines||{};
  window.JakhGameEngines.fanorona={
    id:'fanorona',boardShape:'grid',rows:R,cols:C,
    initialState,legalMoves,applyMove,isTerminal,score,aiMove,
    serialize:clone,deserialize:clone,
    cellContent(state,cell){return state.board[cell]==='A'?'●':state.board[cell]==='B'?'○':'';},
    cellClass(state,cell){const v=state.board[cell];return v?'is-'+v.toLowerCase()+' is-piece':'';},
    cellLabel(state,cell){
      const v=state.board[cell];const [r,c]=rc(cell);
      return `Row ${r+1} col ${c+1}${v?': '+(v==='A'?'black':'white'):''}`;
    },
    rules:'Move along lines (orthogonal; diagonal only on even-sum squares). Captures are mandatory: move toward an opponent piece (approach) or away from one behind you (withdrawal) to capture it and any adjacent pieces in that line. Win by capturing all opponent pieces.',
  };
})();
