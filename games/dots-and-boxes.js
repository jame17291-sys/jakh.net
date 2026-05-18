(function () {
  'use strict';
  // Dots and Boxes: 4x4 grid of boxes = 5x5 dots.
  // Edges: horizontal (between vertically adjacent dots) + vertical (between horizontally adjacent dots).
  // H edges: (rows-1)*cols = 4*5 = 20. V edges: rows*(cols-1) = 5*4 = 20. Total: 40 edges.
  // Display as a flat list of 40 clickable edges.
  // When a player claims the 4th edge of a box, they score and play again.

  const ROWS=4, COLS=4; // boxes
  const DR=ROWS+1, DC=COLS+1; // dot rows/cols = 5x5
  const H_EDGES = ROWS * DC; // 20 horizontal edges (top/bottom of each box row)
  const V_EDGES = DR * COLS; // 20 vertical edges
  const TOTAL = H_EDGES + V_EDGES; // 40

  // Edge index encoding:
  // H edges 0..19: edge hIdx(r,c) = r*DC + c (r=0..ROWS, c=0..COLS-1... wait)
  // Actually: H edge at dot-row r, between dot-col c and c+1: idx = r*COLS + c (r=0..ROWS, c=0..COLS-1)
  // But let me use a flat array of 40 edges.
  // H edge i: r=floor(i/COLS), c=i%COLS (i=0..H_EDGES-1)
  // V edge i: r=floor((i-H_EDGES)/COLS), c=(i-H_EDGES)%COLS (but there are COLS vertical per row for COLS+1... wait)
  // Let me simplify: use separate hEdges[ROWS+1][COLS] and vEdges[ROWS][COLS+1] 
  // Flatten to display: 40 total cells, first H_EDGES are horizontal, rest are vertical.

  // h(r,c): horizontal edge at dot-row r, between col c and c+1. r=0..ROWS, c=0..COLS-1
  function hIdx(r,c) { return r*COLS + c; }
  // v(r,c): vertical edge at dot-row r, between row r and r+1, at col c. r=0..ROWS-1, c=0..COLS
  function vIdx(r,c) { return H_EDGES + r*(COLS+1) + c; }

  // Box at (r,c) has 4 edges: top=h(r,c), bottom=h(r+1,c), left=v(r,c), right=v(r,c+1)
  function boxEdges(r,c) {
    return [hIdx(r,c), hIdx(r+1,c), vIdx(r,c), vIdx(r,c+1)];
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function opp(p) { return p==='A'?'B':'A'; }

  function initialState() {
    return {
      edges: new Array(TOTAL).fill(null),
      boxes: new Array(ROWS*COLS).fill(null),
      scores: {A:0,B:0},
      turn:'A', winner:null, moves:0,
    };
  }

  function legalMoves(state, player) {
    if (state.winner) return [];
    return state.edges.map((v,i)=>v===null?{type:'claim',cell:i,to:i}:null).filter(Boolean);
  }

  function applyMove(state, move) {
    if (state.edges[move.cell] !== null) return clone(state);
    const next = clone(state);
    next.edges[move.cell] = next.turn;
    next.moves++;
    let scored = false;
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
      const bi = r*COLS+c;
      if (next.boxes[bi]) continue;
      if (boxEdges(r,c).every(e=>next.edges[e]!==null)) {
        next.boxes[bi] = next.turn;
        next.scores[next.turn]++;
        scored = true;
      }
    }
    const term = isTerminal(next);
    next.winner = term.winner || null;
    if (!next.winner && !scored) next.turn = opp(next.turn);
    return next;
  }

  function isTerminal(state) {
    if (state.winner) return { done:true, winner:state.winner };
    if (state.boxes.every(Boolean)) {
      const {A,B} = state.scores;
      return { done:true, winner: A===B?'draw':A>B?'A':'B' };
    }
    return { done:false };
  }

  function score(state) { return Math.max(0, state.scores.A*30 + 200 - state.moves); }

  function aiMove(state) {
    const moves = legalMoves(state,'B');
    if (!moves.length) return null;
    // Prefer completing a box
    for (const m of moves) {
      for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
        if (state.boxes[r*COLS+c]) continue;
        const edges = boxEdges(r,c);
        const taken = edges.filter(e=>state.edges[e]!==null).length;
        if (taken===3 && edges.includes(m.cell)) return m;
      }
    }
    // Avoid giving opponent a box (don't make 3rd edge of a box)
    const safe = moves.filter(m => {
      for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
        if(state.boxes[r*COLS+c]) continue;
        const edges=boxEdges(r,c);
        if(edges.includes(m.cell)&&edges.filter(e=>state.edges[e]).length===2) return false;
      }
      return true;
    });
    const pool = safe.length ? safe : moves;
    return pool[Math.floor(Math.random()*pool.length)];
  }

  window.JakhGameEngines = window.JakhGameEngines || {};
  window.JakhGameEngines['dots-and-boxes'] = {
    id:'dots-and-boxes', boardShape:'grid', rows:5, cols:8,
    initialState, legalMoves, applyMove, isTerminal, score, aiMove,
    serialize:clone, deserialize:clone,
    cellContent(state,cell) {
      if (cell >= TOTAL) return '';
      if (cell < H_EDGES) {
        const r=Math.floor(cell/COLS), c=cell%COLS;
        return state.edges[cell] ? '━━' : `h${r},${c}`;
      } else {
        const vi=cell-H_EDGES, r=Math.floor(vi/(COLS+1)), c=vi%(COLS+1);
        return state.edges[cell] ? '┃' : `v${r},${c}`;
      }
    },
    cellClass(state,cell) {
      if (cell>=TOTAL) return 'is-void';
      const v=state.edges[cell];
      if (v) return 'is-'+v.toLowerCase();
      return cell < H_EDGES ? 'is-hedge' : 'is-vedge';
    },
    cellLabel(state,cell) {
      if (cell>=TOTAL) return '';
      return `Edge ${cell+1}${state.edges[cell]?' (taken)':' (available)'}`;
    },
    rules: 'Claim edges of the 4×4 grid. Completing the 4th side of a box scores it for you and earns another turn. Win by owning more boxes when all edges are taken. Timing chain reactions is the key skill.',
  };
})();
