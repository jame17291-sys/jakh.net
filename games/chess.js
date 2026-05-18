(function () {
  'use strict';

  const rows = 8;
  const cols = 8;
  const values = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 12000 };
  const symbols = {
    AK: '♔', AQ: '♕', AR: '♖', AB: '♗', AN: '♘', AP: '♙',
    BK: '♚', BQ: '♛', BR: '♜', BB: '♝', BN: '♞', BP: '♟',
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function rc(index) {
    return [Math.floor(index / cols), index % cols];
  }

  function idx(row, col) {
    return row * cols + col;
  }

  function inside(row, col) {
    return row >= 0 && row < rows && col >= 0 && col < cols;
  }

  function opponent(player) {
    return player === 'A' ? 'B' : 'A';
  }

  function pieceOwner(piece) {
    return piece ? piece[0] : '';
  }

  function pieceType(piece) {
    return piece ? piece[1] : '';
  }

  function initialState() {
    const board = new Array(64).fill(null);
    const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    for (let col = 0; col < cols; col += 1) {
      board[idx(0, col)] = 'B' + backRank[col];
      board[idx(1, col)] = 'BP';
      board[idx(6, col)] = 'AP';
      board[idx(7, col)] = 'A' + backRank[col];
    }
    return { board, turn: 'A', winner: null, moves: 0 };
  }

  function legalMoves(state, player) {
    if (state.winner) return [];
    return generateMoves(state, player || state.turn);
  }

  function generateMoves(state, player) {
    const moves = [];
    state.board.forEach((piece, from) => {
      if (pieceOwner(piece) !== player) return;
      const type = pieceType(piece);
      if (type === 'P') addPawnMoves(state, player, from, moves);
      if (type === 'N') addJumpMoves(state, player, from, moves, [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]);
      if (type === 'B') addSlideMoves(state, player, from, moves, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
      if (type === 'R') addSlideMoves(state, player, from, moves, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
      if (type === 'Q') addSlideMoves(state, player, from, moves, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
      if (type === 'K') addJumpMoves(state, player, from, moves, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
    });
    return moves;
  }

  function addPawnMoves(state, player, from, moves) {
    const [row, col] = rc(from);
    const dir = player === 'A' ? -1 : 1;
    const startRow = player === 'A' ? 6 : 1;
    const oneRow = row + dir;
    if (inside(oneRow, col) && !state.board[idx(oneRow, col)]) {
      moves.push({ type: 'move', from, to: idx(oneRow, col), promotion: oneRow === 0 || oneRow === 7 });
      const twoRow = row + dir * 2;
      if (row === startRow && inside(twoRow, col) && !state.board[idx(twoRow, col)]) {
        moves.push({ type: 'move', from, to: idx(twoRow, col) });
      }
    }
    [-1, 1].forEach((dc) => {
      const targetRow = row + dir;
      const targetCol = col + dc;
      if (!inside(targetRow, targetCol)) return;
      const to = idx(targetRow, targetCol);
      const target = state.board[to];
      if (target && pieceOwner(target) !== player) {
        moves.push({ type: 'move', from, to, capture: true, promotion: targetRow === 0 || targetRow === 7 });
      }
    });
  }

  function addJumpMoves(state, player, from, moves, offsets) {
    const [row, col] = rc(from);
    offsets.forEach(([dr, dc]) => {
      const targetRow = row + dr;
      const targetCol = col + dc;
      if (!inside(targetRow, targetCol)) return;
      const to = idx(targetRow, targetCol);
      addTarget(state, player, from, to, moves);
    });
  }

  function addSlideMoves(state, player, from, moves, directions) {
    const [row, col] = rc(from);
    directions.forEach(([dr, dc]) => {
      for (let step = 1; step < 8; step += 1) {
        const targetRow = row + dr * step;
        const targetCol = col + dc * step;
        if (!inside(targetRow, targetCol)) break;
        const to = idx(targetRow, targetCol);
        if (!addTarget(state, player, from, to, moves)) break;
      }
    });
  }

  function addTarget(state, player, from, to, moves) {
    const target = state.board[to];
    if (!target) {
      moves.push({ type: 'move', from, to });
      return true;
    }
    if (pieceOwner(target) !== player) {
      moves.push({ type: 'move', from, to, capture: true });
    }
    return false;
  }

  function applyMove(state, move) {
    const legal = legalMoves(state, state.turn).find((item) => item.from === move.from && item.to === move.to);
    if (!legal) return clone(state);
    const next = clone(state);
    const moving = next.board[legal.from];
    const target = next.board[legal.to];
    next.board[legal.to] = legal.promotion ? next.turn + 'Q' : moving;
    next.board[legal.from] = null;
    next.moves += 1;
    if (target && pieceType(target) === 'K') {
      next.winner = next.turn;
    } else {
      const terminal = isTerminal(next);
      next.winner = terminal.winner || null;
    }
    if (!next.winner) next.turn = opponent(next.turn);
    return next;
  }

  function isTerminal(state) {
    const hasA = state.board.includes('AK');
    const hasB = state.board.includes('BK');
    if (!hasA) return { done: true, winner: 'B' };
    if (!hasB) return { done: true, winner: 'A' };
    if (state.winner) return { done: true, winner: state.winner };
    if (state.moves >= 240) return { done: true, winner: 'draw' };
    const moves = generateMoves(state, state.turn);
    if (!moves.length) return { done: true, winner: 'draw' };
    return { done: false };
  }

  function score(state) {
    const terminal = isTerminal(state);
    let total = terminal.winner === 'A' ? 3000 : terminal.winner === 'B' ? -3000 : 0;
    state.board.forEach((piece) => {
      if (!piece) return;
      const value = values[pieceType(piece)] || 0;
      total += pieceOwner(piece) === 'A' ? value : -value;
    });
    return Math.max(0, total + 1400 - state.moves * 3);
  }

  function aiMove(state, difficulty) {
    const moves = legalMoves(state, 'B');
    if (!moves.length) return null;
    const scored = moves.map((move) => {
      const target = state.board[move.to];
      const captureValue = target ? values[pieceType(target)] || 0 : 0;
      const centerBonus = [27, 28, 35, 36].includes(move.to) ? 18 : 0;
      const promotionBonus = move.promotion ? 500 : 0;
      return { move, score: captureValue + centerBonus + promotionBonus + Math.random() * (difficulty === 'hard' ? 4 : 30) };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].move;
  }

  window.JakhGameEngines.chess = {
    id: 'chess',
    boardShape: 'grid',
    rows,
    cols,
    initialState,
    legalMoves,
    applyMove,
    isTerminal,
    score,
    aiMove,
    serialize: clone,
    deserialize: clone,
    cellContent(state, cell) {
      return symbols[state.board[cell]] || '';
    },
    cellClass(state, cell) {
      const piece = state.board[cell];
      if (!piece) return '';
      return 'is-' + pieceOwner(piece).toLowerCase() + ' is-piece is-' + pieceType(piece).toLowerCase();
    },
    cellLabel(state, cell) {
      const piece = state.board[cell];
      const [row, col] = rc(cell);
      const square = String.fromCharCode(97 + col) + (8 - row);
      return piece ? square + ' ' + (pieceOwner(piece) === 'A' ? 'white ' : 'black ') + pieceName(pieceType(piece)) : square;
    },
    rules: 'Standard chess pieces, captures, pawn double moves, and promotion are supported in this fast training edition. Capture the king or leave the opponent without playable moves.',
  };

  function pieceName(type) {
    return ({ K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' })[type] || 'piece';
  }
})();
