(function () {
  'use strict';

  const engines = window.JakhGameEngines = window.JakhGameEngines || {};

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function rc(index, cols) {
    return [Math.floor(index / cols), index % cols];
  }

  function idx(row, col, cols) {
    return row * cols + col;
  }

  function inside(row, col, rows, cols) {
    return row >= 0 && row < rows && col >= 0 && col < cols;
  }

  function opponent(player) {
    return player === 'A' ? 'B' : 'A';
  }

  function countPieces(board, player) {
    return board.filter(cell => cell === player || cell === player + 'K').length;
  }

  function hasLine(board, rows, cols, player, length) {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let i = 0; i < board.length; i += 1) {
      if (board[i] !== player) continue;
      const [r, c] = rc(i, cols);
      for (const [dr, dc] of dirs) {
        let n = 1;
        for (let step = 1; step < length; step += 1) {
          const nr = r + dr * step;
          const nc = c + dc * step;
          if (!inside(nr, nc, rows, cols) || board[idx(nr, nc, cols)] !== player) break;
          n += 1;
        }
        if (n >= length) return true;
      }
    }
    return false;
  }

  function connected(board, rows, cols, player, axis) {
    const starts = [];
    const seen = new Set();
    for (let i = 0; i < board.length; i += 1) {
      const [r, c] = rc(i, cols);
      if (board[i] === player && ((axis === 'rows' && r === 0) || (axis === 'cols' && c === 0))) starts.push(i);
    }
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
    const stack = starts;
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      const [r, c] = rc(cur, cols);
      if ((axis === 'rows' && r === rows - 1) || (axis === 'cols' && c === cols - 1)) return true;
      dirs.forEach(([dr, dc]) => {
        const nr = r + dr;
        const nc = c + dc;
        const next = idx(nr, nc, cols);
        if (inside(nr, nc, rows, cols) && board[next] === player && !seen.has(next)) stack.push(next);
      });
    }
    return false;
  }

  function registerGrid(def) {
    const rows = def.rows || def.size || 8;
    const cols = def.cols || def.size || 8;
    const length = def.winLength || 0;
    const directions = def.directions || [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const maxStep = def.maxStep || 1;

    function initialState() {
      const board = new Array(rows * cols).fill(null);
      (def.start || []).forEach(([cell, value]) => { board[cell] = value; });
      return { board, turn: 'A', winner: null, moves: 0, selected: null };
    }

    function legalMoves(state, player) {
      if (isTerminal(state).done) return [];
      if (def.mode === 'drop') {
        const moves = [];
        for (let i = 0; i < state.board.length; i += 1) {
          if (!state.board[i]) moves.push({ type: 'drop', cell: gravityCell(state, i), label: String(i + 1) });
        }
        return uniqueMoves(moves);
      }
      const moves = [];
      state.board.forEach((piece, from) => {
        if (!piece || piece[0] !== player) return;
        const [r, c] = rc(from, cols);
        directions.forEach(([dr, dc]) => {
          for (let step = 1; step <= maxStep; step += 1) {
            const nr = r + dr * step;
            const nc = c + dc * step;
            if (!inside(nr, nc, rows, cols)) break;
            const to = idx(nr, nc, cols);
            const target = state.board[to];
            if (!target) {
              moves.push({ type: 'move', from, to });
              continue;
            }
            if (target[0] !== player && def.capture !== false) moves.push({ type: 'move', from, to, capture: true });
            break;
          }
        });
      });
      return moves;
    }

    function gravityCell(state, cell) {
      if (!def.gravity) return cell;
      const [, col] = rc(cell, cols);
      for (let row = rows - 1; row >= 0; row -= 1) {
        const target = idx(row, col, cols);
        if (!state.board[target]) return target;
      }
      return cell;
    }

    function uniqueMoves(moves) {
      const seen = new Set();
      return moves.filter(move => {
        const key = String(move.cell ?? move.to);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function applyMove(state, move) {
      const next = clone(state);
      if (def.mode === 'drop') {
        const cell = gravityCell(next, move.cell);
        if (next.board[cell]) return next;
        next.board[cell] = next.turn;
      } else {
        if (next.board[move.from]?.[0] !== next.turn) return next;
        if (next.board[move.to]?.[0] === next.turn) return next;
        next.board[move.to] = next.board[move.from];
        next.board[move.from] = null;
      }
      next.moves += 1;
      const terminal = isTerminal(next);
      next.winner = terminal.winner || null;
      if (!next.winner) next.turn = opponent(next.turn);
      return next;
    }

    function isTerminal(state) {
      if (length && hasLine(state.board, rows, cols, 'A', length)) return { done: true, winner: 'A' };
      if (length && hasLine(state.board, rows, cols, 'B', length)) return { done: true, winner: 'B' };
      if (def.connect) {
        if (connected(state.board, rows, cols, 'A', 'rows')) return { done: true, winner: 'A' };
        if (connected(state.board, rows, cols, 'B', 'cols')) return { done: true, winner: 'B' };
      }
      const a = countPieces(state.board, 'A');
      const b = countPieces(state.board, 'B');
      if (def.mode !== 'drop' && (a === 0 || b === 0)) return { done: true, winner: a > b ? 'A' : 'B' };
      if (!legalMovesShallow(state, state.turn).length || state.board.every(Boolean)) {
        if (a === b) return { done: true, winner: 'draw' };
        return { done: true, winner: a > b ? 'A' : 'B' };
      }
      return { done: false };
    }

    function legalMovesShallow(state, player) {
      if (def.mode === 'drop') return state.board.some(cell => !cell) ? [1] : [];
      return state.board.some(piece => piece && piece[0] === player) ? [1] : [];
    }

    function score(state) {
      const terminal = isTerminal(state);
      const mine = countPieces(state.board, 'A');
      const theirs = countPieces(state.board, 'B');
      return Math.max(0, (terminal.winner === 'A' ? 1000 : 0) + mine * 12 - theirs * 8 + Math.max(0, 160 - state.moves));
    }

    function aiMove(state, difficulty) {
      const moves = legalMoves(state, 'B');
      if (!moves.length) return null;
      const captures = moves.filter(move => move.capture);
      if (captures.length) return captures[Math.floor(Math.random() * captures.length)];
      if (difficulty === 'hard') {
        for (const move of moves) {
          const test = applyMove({ ...clone(state), turn: 'B' }, move);
          if (isTerminal(test).winner === 'B') return move;
        }
      }
      return moves[Math.floor(Math.random() * moves.length)];
    }

    engines[def.id] = {
      id: def.id,
      boardShape: 'grid',
      usesGravity: !!def.gravity,
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
        const value = state.board[cell];
        if (!value) return '';
        return value[0] === 'A' ? (def.aToken || 'A') : (def.bToken || 'B');
      },
      cellClass(state, cell) {
        const value = state.board[cell];
        return value ? 'is-' + value[0].toLowerCase() : '';
      },
      cellLabel(state, cell) {
        const [row, col] = rc(cell, cols);
        const value = state.board[cell];
        const label = 'Row ' + (row + 1) + ', column ' + (col + 1);
        return value ? label + ', player ' + value[0] : label;
      },
      rules: def.rules || 'Select a piece or cell, then choose a legal destination. Player A moves first.',
    };
  }

  function registerRace(def) {
    const track = def.track || 24;
    const pieces = def.pieces || 5;
    function initialState() {
      return { positions: { A: new Array(pieces).fill(0), B: new Array(pieces).fill(0) }, turn: 'A', roll: roll(), winner: null, moves: 0 };
    }
    function roll() {
      return 1 + Math.floor(Math.random() * (def.die || 4));
    }
    function legalMoves(state, player) {
      if (isTerminal(state).done) return [];
      return state.positions[player].map((pos, piece) => ({ type: 'race', from: pos, to: Math.min(track, pos + state.roll), piece })).filter(move => move.from < track);
    }
    function applyMove(state, move) {
      const next = clone(state);
      next.positions[next.turn][move.piece] = Math.min(track, next.positions[next.turn][move.piece] + next.roll);
      next.moves += 1;
      const terminal = isTerminal(next);
      next.winner = terminal.winner || null;
      next.roll = roll();
      if (!next.winner) next.turn = opponent(next.turn);
      return next;
    }
    function isTerminal(state) {
      if (state.positions.A.every(pos => pos >= track)) return { done: true, winner: 'A' };
      if (state.positions.B.every(pos => pos >= track)) return { done: true, winner: 'B' };
      return { done: false };
    }
    function score(state) {
      return Math.max(0, state.positions.A.reduce((a, b) => a + b, 0) * 10 + Math.max(0, 180 - state.moves));
    }
    function aiMove(state) {
      const moves = legalMoves(state, 'B');
      return moves.sort((a, b) => b.from - a.from)[0] || null;
    }
    engines[def.id] = {
      id: def.id,
      boardShape: 'track',
      usesGravity: false,
      rows: 2,
      cols: Math.ceil(track / 2),
      track,
      initialState,
      legalMoves,
      applyMove,
      isTerminal,
      score,
      aiMove,
      serialize: clone,
      deserialize: clone,
      cellContent(state, cell) {
        const a = state.positions.A.filter(pos => Math.min(pos, track - 1) === cell).length;
        const b = state.positions.B.filter(pos => Math.min(pos, track - 1) === cell).length;
        return (a ? 'A' + a : '') + (b ? ' B' + b : '');
      },
      cellClass(state, cell) {
        const a = state.positions.A.some(pos => Math.min(pos, track - 1) === cell);
        const b = state.positions.B.some(pos => Math.min(pos, track - 1) === cell);
        return a && b ? 'is-mixed' : a ? 'is-a' : b ? 'is-b' : '';
      },
      cellLabel(state, cell) {
        return 'Track space ' + (cell + 1);
      },
      rules: def.rules || 'Move one piece by the current roll. First side to move every piece home wins.',
    };
  }

  function registerSow(def) {
    const pits = 12;
    const seeds = def.seeds || 4;
    function initialState() {
      return { pits: new Array(pits).fill(seeds), stores: { A: 0, B: 0 }, turn: 'A', winner: null, moves: 0 };
    }
    function legalMoves(state, player) {
      const start = player === 'A' ? 0 : 6;
      return state.pits.slice(start, start + 6).map((value, offset) => ({ type: 'sow', cell: start + offset })).filter(move => state.pits[move.cell] > 0);
    }
    function applyMove(state, move) {
      const next = clone(state);
      let hand = next.pits[move.cell];
      next.pits[move.cell] = 0;
      let cursor = move.cell;
      while (hand > 0) {
        cursor = (cursor + 1) % pits;
        next.pits[cursor] += 1;
        hand -= 1;
      }
      const enemySide = next.turn === 'A' ? cursor >= 6 : cursor < 6;
      if (enemySide && (next.pits[cursor] === 2 || next.pits[cursor] === 3)) {
        next.stores[next.turn] += next.pits[cursor];
        next.pits[cursor] = 0;
      }
      next.moves += 1;
      const terminal = isTerminal(next);
      next.winner = terminal.winner || null;
      if (!next.winner) next.turn = opponent(next.turn);
      return next;
    }
    function isTerminal(state) {
      const aEmpty = state.pits.slice(0, 6).every(v => v === 0);
      const bEmpty = state.pits.slice(6).every(v => v === 0);
      if (!aEmpty && !bEmpty && state.moves < 80) return { done: false };
      const a = state.stores.A + state.pits.slice(0, 6).reduce((x, y) => x + y, 0);
      const b = state.stores.B + state.pits.slice(6).reduce((x, y) => x + y, 0);
      return { done: true, winner: a === b ? 'draw' : a > b ? 'A' : 'B' };
    }
    function score(state) {
      return state.stores.A * 20 + Math.max(0, 160 - state.moves);
    }
    function aiMove(state) {
      const moves = legalMoves(state, 'B');
      return moves.sort((a, b) => state.pits[b.cell] - state.pits[a.cell])[0] || null;
    }
    engines[def.id] = {
      id: def.id,
      boardShape: 'pits',
      usesGravity: false,
      rows: 2,
      cols: 6,
      initialState,
      legalMoves,
      applyMove,
      isTerminal,
      score,
      aiMove,
      serialize: clone,
      deserialize: clone,
      cellContent: (state, cell) => String(state.pits[cell]),
      cellClass: (state, cell) => cell < 6 ? 'is-a' : 'is-b',
      cellLabel: (state, cell) => (cell < 6 ? 'Player A pit ' : 'Player B pit ') + ((cell % 6) + 1) + ', ' + state.pits[cell] + ' seeds',
      rules: def.rules || 'Choose one of your pits to sow seeds. Captures score when the final seed lands in an enemy pit with two or three seeds.',
    };
  }

  window.JakhGameFactory = { registerGrid, registerRace, registerSow };
})();
