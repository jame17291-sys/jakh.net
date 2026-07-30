import assert from "node:assert/strict";
import test from "node:test";
import { BattleRoom } from "../dist/battle-room.js";

function roomState(overrides = {}) {
  const now = Date.now();
  return {
    code: "SCI23456",
    category: "science",
    difficulty: "all",
    hostToken: "host-token",
    players: [],
    questions: [{
      id: "science-1",
      question: { en: "Question", ar: "سؤال" },
      answer: { en: "Answer", ar: "جواب" },
      options: {
        en: ["Answer", "B", "C", "D"],
        ar: ["جواب", "ب", "ج", "د"],
      },
      correctIndex: 0,
    }],
    currentQ: 0,
    phase: "lobby",
    answers: {},
    questionStartTime: 0,
    deadline: now + 60_000,
    createdAt: now,
    ...overrides,
  };
}

function fakeSocket(attachment = {}) {
  return {
    attachment,
    sent: [],
    closed: [],
    serializeAttachment(value) {
      this.attachment = value;
    },
    deserializeAttachment() {
      return this.attachment;
    },
    send(message) {
      this.sent.push(JSON.parse(message));
    },
    close(code, reason) {
      this.closed.push({ code, reason });
    },
  };
}

function fakeContext(initialRoom, sockets = []) {
  const storage = {
    room: initialRoom,
    getCount: 0,
    alarm: null,
    async get() {
      this.getCount += 1;
      return this.room;
    },
    async put(_key, value) {
      this.room = value;
    },
    async deleteAll() {
      this.room = undefined;
    },
    async setAlarm(value) {
      this.alarm = value;
    },
  };
  return {
    storage,
    sockets,
    accepted: [],
    acceptWebSocket(socket) {
      this.accepted.push(socket);
      this.sockets.push(socket);
    },
    getWebSockets() {
      return this.sockets;
    },
  };
}

function connectRequest() {
  return new Request("https://battle.internal/connect", {
    headers: {
      upgrade: "websocket",
      "x-jakh-client-key": "A".repeat(43),
    },
  });
}

test("unknown rooms are rejected before accepting a WebSocket", async () => {
  const staleSocket = fakeSocket();
  const context = fakeContext(undefined, [staleSocket]);
  const durableObject = new BattleRoom(context);

  const response = await durableObject.fetch(connectRequest());

  assert.equal(response.status, 404);
  assert.equal(context.accepted.length, 0);
  assert.deepEqual(staleSocket.closed, [{ code: 1008, reason: "Room not found" }]);
});

test("room socket and pending-join caps are enforced before acceptance", async (t) => {
  await t.test("stored player cap", async () => {
    const players = Array.from({ length: 20 }, (_, index) => ({
      id: `p-${index}`,
      name: `Player ${index}`,
      score: 0,
      streak: 0,
      isHost: index === 0,
    }));
    const context = fakeContext(roomState({ players }));
    const response = await new BattleRoom(context).fetch(connectRequest());

    assert.equal(response.status, 429);
    assert.equal(context.accepted.length, 0);
  });

  await t.test("total socket cap", async () => {
    const sockets = Array.from({ length: 20 }, (_, index) => fakeSocket({ playerId: `p-${index}` }));
    const context = fakeContext(roomState(), sockets);
    const response = await new BattleRoom(context).fetch(connectRequest());

    assert.equal(response.status, 429);
    assert.equal(context.accepted.length, 0);
  });

  await t.test("pending join cap", async () => {
    const sockets = Array.from({ length: 4 }, () => fakeSocket({ connectedAt: Date.now() }));
    const context = fakeContext(roomState(), sockets);
    const response = await new BattleRoom(context).fetch(connectRequest());

    assert.equal(response.status, 429);
    assert.equal(context.accepted.length, 0);
  });

  await t.test("one network cannot reserve multiple pending slots", async () => {
    const sockets = [fakeSocket({
      connectedAt: Date.now(),
      clientKey: "A".repeat(43),
    })];
    const context = fakeContext(roomState(), sockets);
    const response = await new BattleRoom(context).fetch(connectRequest());

    assert.equal(response.status, 429);
    assert.equal(await response.text(), "Too many pending connections from this network");
    assert.equal(context.accepted.length, 0);
  });
});

test("oversized binary messages are rejected before decoding or loading room state", async () => {
  const context = fakeContext(roomState());
  const socket = fakeSocket();
  const durableObject = new BattleRoom(context);

  await durableObject.webSocketMessage(socket, new Uint8Array(8_193).buffer);

  assert.equal(context.storage.getCount, 0);
  assert.deepEqual(socket.closed, [{ code: 1009, reason: "Message too large" }]);
});

test("non-object WebSocket messages close pending connections", async () => {
  const context = fakeContext(roomState());
  const socket = fakeSocket({ connectedAt: Date.now() });

  await new BattleRoom(context).webSocketMessage(socket, "null");

  assert.deepEqual(socket.closed, [{ code: 1008, reason: "Invalid message" }]);
  assert.equal(context.storage.getCount, 0);
});

test("silent pre-join sockets expire through the hibernation-safe alarm", async () => {
  const pending = fakeSocket({ connectedAt: Date.now() - 16_000 });
  const room = roomState({ deadline: Date.now() + 60_000 });
  const context = fakeContext(room, [pending]);

  await new BattleRoom(context).alarm();

  assert.deepEqual(pending.closed, [{ code: 1008, reason: "Join timed out" }]);
  assert.equal(context.storage.room, room);
  assert.equal(context.storage.alarm, room.deadline);
});

test("serialized socket attachments preserve identity across hibernation", async () => {
  const socket = fakeSocket({ connectedAt: Date.now(), clientKey: "A".repeat(43) });
  const context = fakeContext(roomState(), [socket]);

  await new BattleRoom(context).webSocketMessage(socket, JSON.stringify({
    type: "join-room",
    code: "SCI23456",
    name: "Host",
    hostId: "host-token",
  }));

  const playerId = socket.deserializeAttachment().playerId;
  assert.equal(typeof playerId, "string");
  assert.equal(context.storage.room.players[0].id, playerId);

  // A new class instance represents a Durable Object restored after hibernation.
  await new BattleRoom(context).webSocketMessage(socket, JSON.stringify({
    type: "start-game",
  }));

  assert.equal(context.storage.room.phase, "question");
  assert.equal(context.storage.room.players[0].id, playerId);
  assert.ok(socket.sent.some((message) => message.type === "question"));
});

test("one network cannot occupy an entire room", async () => {
  const clientKey = "A".repeat(43);
  const existingPlayers = Array.from({ length: 4 }, (_, index) => ({
    id: `p-${index}`,
    name: `Player ${index}`,
    score: 0,
    streak: 0,
    isHost: index === 0,
  }));
  const sockets = existingPlayers.map((player) => fakeSocket({
    playerId: player.id,
    clientKey,
  }));
  const joining = fakeSocket({ connectedAt: Date.now(), clientKey });
  sockets.push(joining);
  const context = fakeContext(roomState({ players: existingPlayers }), sockets);

  await new BattleRoom(context).webSocketMessage(joining, JSON.stringify({
    type: "join-room",
    code: "SCI23456",
    name: "Fifth player",
  }));

  assert.equal(context.storage.room.players.length, 4);
  assert.deepEqual(joining.closed, [{
    code: 1008,
    reason: "Too many players from this network",
  }]);
});

test("joined sockets are disconnected before a message flood reaches storage", async () => {
  const player = { id: "p-1", name: "Player", score: 0, streak: 0, isHost: true };
  const socket = fakeSocket({ playerId: player.id, clientKey: "A".repeat(43) });
  const context = fakeContext(roomState({ players: [player] }), [socket]);
  const durableObject = new BattleRoom(context);

  for (let index = 0; index < 31; index += 1) {
    await durableObject.webSocketMessage(socket, JSON.stringify({ type: "unknown" }));
  }

  assert.equal(context.storage.getCount, 30);
  assert.deepEqual(socket.closed.at(-1), {
    code: 1008,
    reason: "Too many messages",
  });
});

test("answers at or after the deadline are not accepted", async () => {
  const player = { id: "p-1", name: "Player", score: 0, streak: 0, isHost: true };
  const room = roomState({
    players: [player],
    phase: "question",
    questionStartTime: Date.now() - 20_000,
    deadline: Date.now() - 1,
  });
  const socket = fakeSocket({ playerId: player.id });
  const context = fakeContext(room, [socket]);
  const durableObject = new BattleRoom(context);

  await durableObject.webSocketMessage(socket, JSON.stringify({
    type: "submit-answer",
    answerIndex: 0,
  }));

  assert.deepEqual(context.storage.room.answers, {});
  assert.equal(context.storage.room.phase, "reveal");
  assert.equal(context.storage.room.players[0].score, 0);
});
