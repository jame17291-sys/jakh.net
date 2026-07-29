import type { BattlePlayer, BattleQuestion, BattleRoomState } from "./types.js";

const QUESTION_TIME_MS = 15_000;
const REVEAL_TIME_MS = 4_000;
const LOBBY_TTL_MS = 30 * 60_000;
const FINISHED_TTL_MS = 5 * 60_000;
const MAX_PLAYERS = 20;
const MAX_MESSAGE_BYTES = 8_192;

interface InitPayload {
  code: string;
  category: string;
  difficulty: string;
  hostToken: string;
  questions: BattleQuestion[];
}

interface SocketAttachment {
  playerId?: string;
}

export class BattleRoom implements DurableObject {
  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/init" && request.method === "POST") return this.initialize(request);
    if (path === "/connect" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({} satisfies SocketAttachment);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("Not found", { status: 404 });
  }

  private async initialize(request: Request): Promise<Response> {
    const existing = await this.ctx.storage.get<BattleRoomState>("room");
    if (existing) return new Response("Room already exists", { status: 409 });

    const payload = await request.json() as InitPayload;
    const now = Date.now();
    const room: BattleRoomState = {
      code: payload.code,
      category: payload.category,
      difficulty: payload.difficulty,
      hostToken: payload.hostToken,
      players: [],
      questions: payload.questions,
      currentQ: 0,
      phase: "lobby",
      answers: {},
      questionStartTime: 0,
      deadline: now + LOBBY_TTL_MS,
      createdAt: now,
    };
    await this.save(room);
    return new Response("Created", { status: 201 });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    if (new TextEncoder().encode(text).byteLength > MAX_MESSAGE_BYTES) {
      socket.close(1009, "Message too large");
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.send(socket, { type: "error", message: "Invalid message" });
      return;
    }

    const room = await this.ctx.storage.get<BattleRoomState>("room");
    if (!room) {
      this.send(socket, { type: "error", message: "Room not found" });
      socket.close(1008, "Room not found");
      return;
    }

    if (payload.type === "join-room") {
      await this.join(socket, room, payload);
      return;
    }

    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    const player = room.players.find((item) => item.id === attachment?.playerId);
    if (!player) {
      this.send(socket, { type: "error", message: "Join the room first" });
      return;
    }

    if (payload.type === "start-game") {
      if (room.phase !== "lobby" || !player.isHost || room.players.length < 1) return;
      await this.startQuestion(room);
      return;
    }

    if (payload.type === "submit-answer") {
      await this.submitAnswer(room, player, payload);
    }
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.playerId) return;
    const room = await this.ctx.storage.get<BattleRoomState>("room");
    if (!room) return;

    const departed = room.players.find((player) => player.id === attachment.playerId);
    room.players = room.players.filter((player) => player.id !== attachment.playerId);
    delete room.answers[attachment.playerId];

    if (!room.players.length && room.phase === "lobby") {
      await this.expireRoom();
      return;
    }

    if (room.phase === "lobby" && departed?.isHost && room.players[0]) {
      room.players[0].isHost = true;
      const promoted = this.ctx.getWebSockets().find((candidate) => {
        const candidateAttachment = candidate.deserializeAttachment() as SocketAttachment | null;
        return candidateAttachment?.playerId === room.players[0]?.id;
      });
      if (promoted) this.send(promoted, { type: "joined", playerId: room.players[0].id, isHost: true });
    }

    await this.save(room);
    if (room.phase === "question" && Object.keys(room.answers).length >= room.players.length) {
      await this.reveal(room);
      return;
    }
    if (room.phase !== "finished") this.broadcast({ type: "room-update", roomState: this.snapshot(room) });
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket);
  }

  async alarm(): Promise<void> {
    const room = await this.ctx.storage.get<BattleRoomState>("room");
    if (!room) return;
    if (room.deadline > Date.now() + 50) {
      await this.ctx.storage.setAlarm(room.deadline);
      return;
    }

    if (room.phase === "question") {
      await this.reveal(room);
      return;
    }
    if (room.phase === "reveal") {
      room.currentQ += 1;
      if (room.currentQ >= room.questions.length) {
        room.phase = "finished";
        room.deadline = Date.now() + FINISHED_TTL_MS;
        await this.save(room);
        this.broadcast({ type: "game-end", roomState: this.snapshot(room) });
      } else {
        await this.startQuestion(room);
      }
      return;
    }

    await this.expireRoom();
  }

  private async join(
    socket: WebSocket,
    room: BattleRoomState,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment?.playerId) return;
    if (room.phase !== "lobby") {
      this.send(socket, { type: "error", message: "Battle already started" });
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      this.send(socket, { type: "error", message: "Room is full" });
      return;
    }
    if (String(payload.code || "").trim().toUpperCase() !== room.code) {
      this.send(socket, { type: "error", message: "Invalid room code" });
      return;
    }

    const name = String(payload.name || "").trim().slice(0, 20);
    if (!name) {
      this.send(socket, { type: "error", message: "Player name is required" });
      return;
    }

    const isHost = payload.hostId === room.hostToken && !room.players.some((player) => player.isHost);
    const player: BattlePlayer = {
      id: crypto.randomUUID(),
      name,
      score: 0,
      streak: 0,
      isHost,
    };
    room.players.push(player);
    socket.serializeAttachment({ playerId: player.id } satisfies SocketAttachment);
    await this.save(room);
    this.send(socket, { type: "joined", playerId: player.id, isHost });
    this.broadcast({ type: "room-update", roomState: this.snapshot(room) });
  }

  private async startQuestion(room: BattleRoomState): Promise<void> {
    room.phase = "question";
    room.answers = {};
    room.questionStartTime = Date.now();
    room.deadline = room.questionStartTime + QUESTION_TIME_MS;
    await this.save(room);
    const question = room.questions[room.currentQ];
    if (!question) {
      await this.expireRoom();
      return;
    }
    this.broadcast({
      type: "question",
      roomState: this.snapshot(room),
      question: {
        index: room.currentQ,
        total: room.questions.length,
        text: question.question,
        options: question.options,
      },
      timeMs: QUESTION_TIME_MS,
    });
  }

  private async submitAnswer(
    room: BattleRoomState,
    player: BattlePlayer,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (room.phase !== "question" || room.answers[player.id]) return;
    const answerIndex = Number(payload.answerIndex);
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return;
    room.answers[player.id] = {
      answerIndex,
      timeMs: Math.min(QUESTION_TIME_MS, Math.max(0, Date.now() - room.questionStartTime)),
    };
    await this.save(room);
    const answeredCount = Object.keys(room.answers).length;
    this.broadcast({ type: "answer-count", answeredCount, totalPlayers: room.players.length });
    if (answeredCount >= room.players.length) await this.reveal(room);
  }

  private async reveal(room: BattleRoomState): Promise<void> {
    if (room.phase !== "question") return;
    const question = room.questions[room.currentQ];
    if (!question) {
      await this.expireRoom();
      return;
    }

    for (const player of room.players) {
      const answer = room.answers[player.id];
      if (answer?.answerIndex === question.correctIndex) {
        const speedBonus = Math.round((1 - Math.min(1, answer.timeMs / QUESTION_TIME_MS)) * 50);
        player.streak += 1;
        const multiplier = player.streak >= 3 ? 2 : player.streak >= 2 ? 1.5 : 1;
        player.score += Math.round((100 + speedBonus) * multiplier);
      } else {
        player.streak = 0;
      }
    }

    room.phase = "reveal";
    room.deadline = Date.now() + REVEAL_TIME_MS;
    await this.save(room);
    this.broadcast({
      type: "reveal",
      roomState: this.snapshot(room),
      correctIndex: question.correctIndex,
      correctAnswer: question.answer,
    });
  }

  private snapshot(room: BattleRoomState) {
    const players = [...room.players]
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
      .map(({ isHost: _isHost, ...player }) => player);
    return {
      code: room.code,
      category: room.category,
      difficulty: room.difficulty,
      phase: room.phase,
      currentQ: room.currentQ,
      totalQ: room.questions.length,
      hostId: room.players.find((player) => player.isHost)?.id || null,
      players,
      answeredCount: Object.keys(room.answers).length,
      totalPlayers: room.players.length,
    };
  }

  private async save(room: BattleRoomState): Promise<void> {
    await this.ctx.storage.put("room", room);
    await this.ctx.storage.setAlarm(room.deadline);
  }

  private send(socket: WebSocket, payload: unknown): void {
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      // The close callback will remove stale sockets.
    }
  }

  private broadcast(payload: unknown): void {
    const message = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        // The close callback will remove stale sockets.
      }
    }
  }

  private async expireRoom(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.close(1000, "Room expired");
      } catch {
        // Ignore already closed sockets.
      }
    }
    await this.ctx.storage.deleteAll();
  }
}
