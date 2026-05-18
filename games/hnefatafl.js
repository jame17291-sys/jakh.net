(function () {
  'use strict';
  // Hnefatafl 7x7: King (AK at center) + 4 defenders (A) vs 16 attackers (B).
  // King escapes to any corner. Capture by orthogonal sandwich (custodian).
  // King needs 4 surrounding pieces to capture; others need 2.

  const R=7, C=7, N=49;
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function opp(p) { return p === 'A' ? 'B' : 'A'; }
  function rc(i) { return [Math.floor(i/C), i%C]; }
  function idx(r,c) { return r*C+c; }
  function inside(r,c) { return r>=0&&r<R&&c>=0&&c<C; }
  const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];
  const CORNERS = new Set([0, C-1, (R-1)*C, N-1]);
  const CENTER = idx(3,3);

  function owner(p) { return p ? p[0] : null; }
  function isKing(p) { return p === 'AK'; }

  function initialState() {
    const board = new Array(N).fill(null);
    // King at center
    board[CENTER] = 'AK';
    // Defenders: adjacent to king (4 orthogonal)
    [[2,3],[4,3],[3,2],[3,4]].forEach(([r,c]) => { board[idx(r,c)] = 'A'; });
    // Attackers: edges (16 total)
    [[0,1],[0,2],[0,3],[0,4],[0,5],
     [1,0],[2,0],[3,0],[4,0],[5,0],
     [6,1],[6,2],[6,3],[6,4],[6,5],
     [1,6]].forEach(([r,c]) => { board[idx(r,c)] = 'B'; });
    return { board, turn:'A', winner:null, moves:0 };
  }

  function isHostile(board, i, forPlayer) {
    // Corners and center are hostile to all pieces when empty (act as anvil for capture)
    if (CORNERS.has(i) && !board[i]) return true;
    if (i === CENTER && !board[i]) return true;
    return owner(board[i]) === opp(forPlayer);
  }

  function getCaptured(board, movedTo, mover) {
    const [r,c] = rc(movedTo);
    const captured = [];
    for (const [dr,dc] of ORTH) {
      const nr=r+dr, nc=c+dc;
      if (!inside(nr,nc)) continue;
      const midI = idx(nr,nc);
      const midP = board[midI];
      if (!midP || owner(midP) !== opp(mover)) continue;
      const far = idx(nr+dr, nc+dc);
      if (!inside(nr+dr,nc+dc)) continue;
      if (isKing(midP)) {
        // King requires all 4 orthogonal cells to be hostile
        const surrounded = ORTH.every(([dr2,dc2]) => {
          const ar=nr+dr2, ac=nc+dc2;
          return !inside(ar,ac) || isHostile(board, idx(ar,ac), 'A');
        });
        if (surrounded) captured.push(midI);
      } else {
        if (isHostile(board, far, opp(mover))) captured.push(midI);
      }
    }
    return captured;
  }

  function legalMoves(state, player) {
    if (state.winner) return [];
    const pl = player || state.turn;
    const moves = [];
    state.board.forEach((piece, from) => {
      if (owner(piece) !== pl) return;
      const [r,c] = rc(from);
      for (const [dr,dc] of ORTH) {
        for (let step=1; step<Math.max(R,C); step++) {
          const nr=r+dr*step, nc=c+dc*step;
          if (!inside(nr,nc)) break;
          const to = idx(nr,nc);
          if (state.board[to]) break; // blocked
          // Non-king pieces may not enter corners or center
          if (!isKing(piece) && (CORNERS.has(to) || to===CENTER)) continue;
          moves.push({type:'move', from, to});
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
    const caps = getCaptured(next.board, legal.to, next.turn);
    caps.forEach(i => { next.board[i] = null; });
    next.moves++;
    const term = isTerminal(next);
    next.winner = term.winner || null;
    if (!next.winner) next.turn = opp(next.turn);
    return next;
  }

  function isTerminal(state) {
    if (state.winner) return { done:true, winner:state.winner };
    // King reached corner?
    const kingPos = state.board.findIndex(p => isKing(p));
    if (kingPos === -1) return { done:true, winner:'B' };
    if (CORNERS.has(kingPos)) return { done:true, winner:'A' };
    if (!state.board.some(p=>p==='B')) return { done:true, winner:'A' };
    if (!legalMoves(state,state.turn).length) return { done:true, winner:opp(state.turn) };
    if (state.moves >= 300) return { done:true, winner:'draw' };
    return { done:false };
  }

  function score(state) {
    const kingPos = state.board.findIndex(p=>isKing(p));
    if (kingPos===-1) return 0;
    if (CORNERS.has(kingPos)) return 1200;
    const [kr,kc] = rc(kingPos);
    const distToCorner = Math.min(kr+kc, kr+(C-1-kc), (R-1-kr)+kc, (R-1-kr)+(C-1-kc));
    const defenders = state.board.filter(p=>owner(p)==='A').length;
    const attackers = state.board.filter(p=>p==='B').length;
    return Math.max(0, (defenders*10 - attackers*6) + (8-distToCorner)*15 + 200);
  }

  function aiMove(state) {
    const moves = legalMoves(state,'B');
    if (!moves.length) return null;
    // Try to capture king
    const kingPos = state.board.findIndex(p=>isKing(p));
    if (kingPos!==-1) {
      for (const m of moves) {
        const b2=clone(state.board); b2[m.to]=b2[m.from]; b2[m.from]=null;
        const caps=getCaptured(b2,m.to,'B');
        if (caps.includes(kingPos)) return m;
      }
    }
    return moves[Math.floor(Math.random()*moves.length)];
  }

  window.JakhGameEngines = window.JakhGameEngines || {};
  window.JakhGameEngines.hnefatafl = {
    id:'hnefatafl', boardShape:'grid', rows:R, cols:C,
    initialState, legalMoves, applyMove, isTerminal, score, aiMove,
    serialize:clone, deserialize:clone,
    cellContent(state,cell) {
      const p=state.board[cell];
      if (!p) return CORNERS.has(cell)?'◇':cell===CENTER?'✦':'';
      if (isKing(p)) return '♔';
      return owner(p)==='A'?'△':'●';
    },
    cellClass(state,cell) {
      const p=state.board[cell];
      if (!p) return CORNERS.has(cell)?'is-corner':cell===CENTER?'is-center':'';
      return 'is-'+owner(p).toLowerCase()+' is-piece'+(isKing(p)?' is-king':'');
    },
    cellLabel(state,cell) {
      const p=state.board[cell]; const [r,c]=rc(cell);
      return `${String.fromCharCode(65+c)}${R-r}${p?' '+(isKing(p)?'King':owner(p)==='A'?'Defender':'Attacker'):''}`;
    },
    rules: 'The king (♔) starts at center with 4 defenders. 16 attackers surround them. Defenders slide orthogonally any distance. The king escapes by reaching any corner (◇). Capture pieces by sandwiching them between two of your own. The king requires all 4 sides surrounded.',
  };
})();
