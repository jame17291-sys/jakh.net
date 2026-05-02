import { WebSocket, WebSocketServer } from 'ws';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { IncomingMessage } from 'http';
import { Router } from 'express';

const DATA_DIR = '/var/www/jakh.net/data';
const QUESTION_TIME_MS = 15000;
const REVEAL_TIME_MS = 4000;
const MAX_PLAYERS = 20;

interface BattleQuestion {
  id: string;
  question: { en: string; ar: string };
  answer: { en: string; ar: string };
  options: { en: string[]; ar: string[] };
  correctIndex: number;
}

interface Player {
  id: string;
  name: string;
  score: number;
  streak: number;
  ws: WebSocket;
}

interface RoomAnswer {
  answerIndex: number;
  timeMs: number;
}

interface Room {
  code: string;
  category: string;
  difficulty: string;
  hostId: string;
  players: Map<string, Player>;
  questions: BattleQuestion[];
  currentQ: number;
  phase: 'lobby' | 'question' | 'reveal' | 'finished';
  answers: Map<string, RoomAnswer>;
  questionTimer?: ReturnType<typeof setTimeout>;
  revealTimer?: ReturnType<typeof setTimeout>;
  questionStartTime: number;
  createdAt: number;
}

const rooms = new Map<string, Room>();
const socketToPlayer = new Map<WebSocket, { roomCode: string; playerId: string }>();

function generateCode(category: string): string {
  const prefix = category.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const suffix = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  const code = `${prefix}${suffix}`;
  return rooms.has(code) ? generateCode(category) : code;
}

function loadQuestions(
  category: string,
  difficulty: string,
  count: number,
): BattleQuestion[] {
  const filePath = join(DATA_DIR, `${category}.json`);
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    const allCards: any[] = Array.isArray(raw) ? raw : raw.cards || [];
    let pool = difficulty === 'all'
      ? allCards
      : allCards.filter(c => c.difficulty === difficulty);

    pool = [...pool].sort(() => Math.random() - 0.5).slice(0, count);

    return pool.map(card => {
      const distractors = [...allCards]
        .filter(c => c.id !== card.id && c.answer?.en && c.answer?.ar)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      while (distractors.length < 3) {
        distractors.push({ answer: { en: 'None of the above', ar: 'لا شيء مما سبق' } });
      }

      const optEn = [card.answer.en, ...distractors.map((d: any) => d.answer.en)];
      const optAr = [card.answer.ar, ...distractors.map((d: any) => d.answer.ar)];
      const indices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);

      return {
        id: card.id,
        question: { en: card.question?.en || '', ar: card.question?.ar || '' },
        answer: { en: card.answer.en, ar: card.answer.ar },
        options: {
          en: indices.map(i => optEn[i]),
          ar: indices.map(i => optAr[i]),
        },
        correctIndex: indices.indexOf(0),
      };
    });
  } catch (e) {
    console.error('[Battle] loadQuestions error:', e);
    return [];
  }
}

function playerList(room: Room) {
  return Array.from(room.players.values())
    .map(p => ({ id: p.id, name: p.name, score: p.score, streak: p.streak }))
    .sort((a, b) => b.score - a.score);
}

function roomSnapshot(room: Room) {
  return {
    code: room.code,
    category: room.category,
    difficulty: room.difficulty,
    phase: room.phase,
    currentQ: room.currentQ,
    totalQ: room.questions.length,
    hostId: room.hostId,
    players: playerList(room),
    answeredCount: room.answers.size,
    totalPlayers: room.players.size,
  };
}

function broadcast(room: Room, msg: object) {
  const data = JSON.stringify(msg);
  room.players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  });
}

function startQuestion(room: Room) {
  room.phase = 'question';
  room.answers.clear();
  room.questionStartTime = Date.now();
  const q = room.questions[room.currentQ];
  broadcast(room, {
    type: 'question',
    roomState: roomSnapshot(room),
    question: {
      index: room.currentQ,
      total: room.questions.length,
      text: q.question,
      options: q.options,
    },
    timeMs: QUESTION_TIME_MS,
  });
  room.questionTimer = setTimeout(() => revealAnswers(room), QUESTION_TIME_MS);
}

function revealAnswers(room: Room) {
  clearTimeout(room.questionTimer);
  room.phase = 'reveal';
  const q = room.questions[room.currentQ];

  room.answers.forEach((ans, playerId) => {
    const player = room.players.get(playerId);
    if (!player) return;
    if (ans.answerIndex === q.correctIndex) {
      const ratio = Math.min(1, ans.timeMs / QUESTION_TIME_MS);
      const speedBonus = Math.round((1 - ratio) * 50);
      player.streak++;
      const mult = player.streak >= 3 ? 2 : player.streak >= 2 ? 1.5 : 1;
      player.score += Math.round((100 + speedBonus) * mult);
    } else {
      player.streak = 0;
    }
  });

  broadcast(room, {
    type: 'reveal',
    roomState: roomSnapshot(room),
    correctIndex: q.correctIndex,
    correctAnswer: q.answer,
  });

  room.revealTimer = setTimeout(() => {
    room.currentQ++;
    if (room.currentQ >= room.questions.length) {
      room.phase = 'finished';
      broadcast(room, { type: 'game-end', roomState: roomSnapshot(room) });
      setTimeout(() => rooms.delete(room.code), 5 * 60 * 1000);
    } else {
      startQuestion(room);
    }
  }, REVEAL_TIME_MS);
}

export function createRoom(
  category: string,
  difficulty: string,
  questionCount: number,
): { code: string; hostId: string } {
  if (!/^[a-z0-9-]+$/.test(category)) throw new Error('Invalid category');
  const questions = loadQuestions(category, difficulty, questionCount);
  if (questions.length === 0) throw new Error('No questions available for this selection');

  const code = generateCode(category);
  const hostId = Math.random().toString(36).slice(2, 10);

  const room: Room = {
    code, category, difficulty, hostId,
    players: new Map(),
    questions,
    currentQ: 0,
    phase: 'lobby',
    answers: new Map(),
    questionStartTime: 0,
    createdAt: Date.now(),
  };

  rooms.set(code, room);
  setTimeout(() => {
    if (rooms.get(code)?.phase === 'lobby') rooms.delete(code);
  }, 30 * 60 * 1000);

  return { code, hostId };
}

export function setupBattleWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const playerId = Math.random().toString(36).slice(2, 10);

    ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'join-room') {
        const code = String(msg.code || '').toUpperCase().trim();
        const name = String(msg.name || 'Player').slice(0, 20).trim() || 'Player';
        const room = rooms.get(code);
        if (!room) { ws.send(JSON.stringify({ type: 'error', message: 'Room not found' })); return; }
        if (room.phase !== 'lobby') { ws.send(JSON.stringify({ type: 'error', message: 'Battle already started' })); return; }
        if (room.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ type: 'error', message: 'Room is full' })); return; }

        const isHost = msg.hostId === room.hostId;
        const player: Player = { id: playerId, name, score: 0, streak: 0, ws };
        room.players.set(playerId, player);
        socketToPlayer.set(ws, { roomCode: code, playerId });
        ws.send(JSON.stringify({ type: 'joined', playerId, isHost }));
        broadcast(room, { type: 'room-update', roomState: roomSnapshot(room) });
      }

      else if (msg.type === 'start-game') {
        const binding = socketToPlayer.get(ws);
        if (!binding) return;
        const room = rooms.get(binding.roomCode);
        if (!room || room.phase !== 'lobby') return;
        const isHost = binding.playerId === room.hostId || msg.hostId === room.hostId;
        if (!isHost || room.players.size < 1) return;
        startQuestion(room);
      }

      else if (msg.type === 'submit-answer') {
        const binding = socketToPlayer.get(ws);
        if (!binding) return;
        const room = rooms.get(binding.roomCode);
        if (!room || room.phase !== 'question') return;
        if (room.answers.has(binding.playerId)) return;
        const answerIndex = Number(msg.answerIndex);
        if (answerIndex < 0 || answerIndex > 3 || !Number.isInteger(answerIndex)) return;
        const timeMs = Math.min(QUESTION_TIME_MS, Math.max(0, Date.now() - room.questionStartTime));
        room.answers.set(binding.playerId, { answerIndex, timeMs });
        broadcast(room, { type: 'answer-count', answeredCount: room.answers.size, totalPlayers: room.players.size });
        if (room.answers.size >= room.players.size) revealAnswers(room);
      }
    });

    ws.on('close', () => {
      const binding = socketToPlayer.get(ws);
      if (!binding) return;
      socketToPlayer.delete(ws);
      const room = rooms.get(binding.roomCode);
      if (!room) return;
      room.players.delete(binding.playerId);
      if (room.players.size === 0 && room.phase === 'lobby') {
        rooms.delete(room.code);
      } else if (room.phase !== 'finished') {
        broadcast(room, { type: 'room-update', roomState: roomSnapshot(room) });
      }
    });

    ws.on('error', () => { try { ws.terminate(); } catch (_) {} });
  });
}

// REST router
const router = Router();
router.post('/create', (req, res) => {
  const { category, difficulty = 'all', questionCount = 10 } = req.body;
  if (!category || typeof category !== 'string') {
    return res.status(400).json({ error: 'category is required' });
  }
  const count = Math.min(30, Math.max(5, parseInt(String(questionCount), 10) || 10));
  try {
    const result = createRoom(category, difficulty, count);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Failed to create room' });
  }
});

export default router;
