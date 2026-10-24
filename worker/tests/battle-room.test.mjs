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
      id: "science-001",
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

test("pre-deployment held rooms are purged and indistinguishable from unknown room codes", async () => {
  const unknownContext = fakeContext(undefined);
  const unknownResponse = await new BattleRoom(unknownContext).fetch(connectRequest());
  const heldSocket = fakeSocket({ connectedAt: Date.now() });
  const heldContext = fakeContext(roomState({
    category: "medical-questions",
    questions: [{
      ...roomState().questions[0],
      id: "medical-questions-001",
    }],
  }), [heldSocket]);

  const heldResponse = await new BattleRoom(heldContext).fetch(connectRequest());

  assert.equal(heldResponse.status, unknownResponse.status);
  assert.equal(await heldResponse.text(), await unknownResponse.text());
  assert.equal(
    heldResponse.headers.get("cache-control"),
    unknownResponse.headers.get("cache-control"),
  );
  assert.equal(heldContext.storage.room, undefined);
  assert.equal(heldContext.accepted.length, 0);
  assert.deepEqual(heldSocket.closed, [{ code: 1008, reason: "Room not found" }]);
});

test("room initialization rejects held and category-mismatched question state", async (t) => {
  for (const payload of [
    {
      code: "MED23456",
      category: "medical-questions",
      difficulty: "all",
      hostToken: "host-token",
      questions: [{ ...roomState().questions[0], id: "medical-questions-001" }],
    },
    {
      code: "SCI23456",
      category: "science",
      difficulty: "all",
      hostToken: "host-token",
      questions: [{ ...roomState().questions[0], id: "medical-questions-001" }],
    },
  ]) {
    await t.test(payload.category === "science" ? "mismatched card" : "held category", async () => {
      const context = fakeContext(undefined);
      const response = await new BattleRoom(context).fetch(new Request("https://battle.internal/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }));

      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(context.storage.room, undefined);
      assert.equal(context.storage.alarm, null);
    });
  }
});

test("all hibernated room entrypoints purge held state before sending questions or state", async (t) => {
  const heldRoom = () => roomState({
    category: "medical-questions",
    questions: [{ ...roomState().questions[0], id: "medical-questions-001" }],
  });

  await t.test("message", async () => {
    const player = { id: "p-1", name: "Player", score: 0, streak: 0, isHost: true };
    const socket = fakeSocket({ playerId: player.id });
    const context = fakeContext(heldRoom(), [socket]);
    context.storage.room.players = [player];

    await new BattleRoom(context).webSocketMessage(socket, JSON.stringify({ type: "start-game" }));

    assert.equal(context.storage.room, undefined);
    assert.deepEqual(socket.sent, []);
    assert.deepEqual(socket.closed, [{ code: 1008, reason: "Room not found" }]);
  });

  await t.test("close before join", async () => {
    const socket = fakeSocket({ connectedAt: Date.now() });
    const context = fakeContext(heldRoom(), [socket]);

    await new BattleRoom(context).webSocketClose(socket);

    assert.equal(context.storage.room, undefined);
    assert.deepEqual(socket.sent, []);
    assert.deepEqual(socket.closed, [{ code: 1008, reason: "Room not found" }]);
  });

  await t.test("alarm", async () => {
    const socket = fakeSocket({ playerId: "p-1" });
    const context = fakeContext(heldRoom(), [socket]);

    await new BattleRoom(context).alarm();

    assert.equal(context.storage.room, undefined);
    assert.deepEqual(socket.sent, []);
    assert.deepEqual(socket.closed, [{ code: 1008, reason: "Room not found" }]);
  });
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
  const guest = fakeSocket({ connectedAt: Date.now(), clientKey: "B".repeat(43) });
  const context = fakeContext(roomState(), [socket, guest]);

  await new BattleRoom(context).webSocketMessage(socket, JSON.stringify({
    type: "join-room",
    code: "SCI23456",
    name: "Host",
    hostId: "host-token",
  }));

  const playerId = socket.deserializeAttachment().playerId;
  assert.equal(typeof playerId, "string");
  assert.equal(context.storage.room.players[0].id, playerId);

  await new BattleRoom(context).webSocketMessage(guest, JSON.stringify({
    type: "join-room",
    code: "SCI23456",
    name: "Guest",
  }));

  // A new class instance represents a Durable Object restored after hibernation.
  await new BattleRoom(context).webSocketMessage(socket, JSON.stringify({
    type: "start-game",
  }));

  assert.equal(context.storage.room.phase, "question");
  assert.equal(context.storage.room.players[0].id, playerId);
  for (const playerSocket of [socket, guest]) {
    assert.ok(playerSocket.sent.some((message) => message.type === "question"));
  }
});

test("an invited second player shares the host room and receives its first question", async () => {
  const host = fakeSocket({ connectedAt: Date.now(), clientKey: "A".repeat(43) });
  const guest = fakeSocket({ connectedAt: Date.now(), clientKey: "B".repeat(43) });
  const context = fakeContext(roomState(), [host, guest]);
  const durableObject = new BattleRoom(context);

  await durableObject.webSocketMessage(host, JSON.stringify({
    type: "join-room",
    code: "SCI23456",
    name: "Host",
    hostId: "host-token",
  }));

  await durableObject.webSocketMessage(host, JSON.stringify({ type: "start-game" }));
  assert.equal(context.storage.room.phase, "lobby");
  assert.ok(host.sent.some((message) => message.type === "error"
    && message.code === "NEED_ANOTHER_PLAYER"));

  await durableObject.webSocketMessage(guest, JSON.stringify({
    type: "join-room",
    code: "SCI23456",
    name: "Guest",
  }));

  assert.equal(context.storage.room.players.length, 2);
  assert.equal(context.storage.room.players[0].isHost, true);
  assert.equal(context.storage.room.players[1].isHost, false);
  assert.ok(guest.sent.some((message) => message.type === "joined" && message.isHost === false));

  await durableObject.webSocketMessage(host, JSON.stringify({ type: "start-game" }));

  assert.equal(context.storage.room.phase, "question");
  for (const socket of [host, guest]) {
    assert.ok(socket.sent.some((message) => (
      message.type === "question" && message.roomState.totalPlayers === 2
    )));
  }
});

// Node's Response rejects status 101 and has no WebSocketPair, so this helper
// stands in for the Workers runtime around the real connect-then-join path.
async function withWebSocketUpgrades(run) {
  const NativeResponse = globalThis.Response;
  const hadPair = "WebSocketPair" in globalThis;
  const nativePair = globalThis.WebSocketPair;
  globalThis.WebSocketPair = class {
    constructor() {
      this[0] = fakeSocket();
      this[1] = fakeSocket();
    }
  };
  globalThis.Response = class extends NativeResponse {
    constructor(body, init = {}) {
      super(body, init.status === 101 ? { ...init, status: 200 } : init);
      this.upgraded = init.status === 101;
    }
  };
  try {
    await run();
  } finally {
    globalThis.Response = NativeResponse;
    if (hadPair) globalThis.WebSocketPair = nativePair;
    else delete globalThis.WebSocketPair;
  }
}

function connectFrom(clientKey) {
  return new Request("https://battle.internal/connect", {
    headers: { upgrade: "websocket", "x-jakh-client-key": clientKey },
  });
}

test("players on one network can fill a room up to its capacity, and capacity still holds", async () => {
  await withWebSocketUpgrades(async () => {
    const sharedWifi = "A".repeat(43);
    const otherNetwork = "B".repeat(43);
    const context = fakeContext(roomState());
    const durableObject = new BattleRoom(context);

    // Twenty players on one shared network connect and join one after another:
    // the host and then a whole family or classroom, well past the old cap of four.
    for (let index = 0; index < 20; index += 1) {
      const response = await durableObject.fetch(connectFrom(sharedWifi));
      assert.equal(response.upgraded, true, `player ${index + 1} must be allowed to connect`);
      const socket = context.accepted.at(-1);
      await durableObject.webSocketMessage(socket, JSON.stringify({
        type: "join-room",
        code: "SCI23456",
        name: `Player ${index + 1}`,
        hostId: index === 0 ? "host-token" : "",
      }));
      assert.ok(socket.sent.some((message) => message.type === "joined"), `player ${index + 1} must join`);
      assert.deepEqual(socket.closed, []);
    }
    assert.equal(context.storage.room.players.length, 20);
    assert.equal(context.storage.room.players.filter((player) => player.isHost).length, 1);
    assert.ok(context.accepted.every((socket) => socket.sent.some((message) => (
      message.type === "room-update" && message.roomState.totalPlayers === 20
    ))));

    // The room's normal capacity of 20 still holds for every network.
    for (const clientKey of [sharedWifi, otherNetwork]) {
      const acceptedBefore = context.accepted.length;
      const full = await durableObject.fetch(connectFrom(clientKey));
      assert.equal(full.upgraded, false);
      assert.equal(full.status, 429);
      assert.equal(await full.text(), "Room is full");
      assert.equal(context.accepted.length, acceptedBefore);
    }
    assert.equal(context.storage.room.players.length, 20);
  });
});

test("a join that arrives after the room filled is refused at capacity", async () => {
  const clientKey = "A".repeat(43);
  const players = Array.from({ length: 20 }, (_, index) => ({
    id: `p-${index}`,
    name: `Player ${index}`,
    score: 0,
    streak: 0,
    isHost: index === 0,
  }));
  const sockets = players.map((player) => fakeSocket({ playerId: player.id, clientKey }));
  const late = fakeSocket({ connectedAt: Date.now(), clientKey: "B".repeat(43) });
  sockets.push(late);
  const context = fakeContext(roomState({ players }), sockets);

  await new BattleRoom(context).webSocketMessage(late, JSON.stringify({
    type: "join-room",
    code: "SCI23456",
    name: "Player 21",
  }));

  assert.equal(context.storage.room.players.length, 20);
  assert.deepEqual(late.closed, [{ code: 1008, reason: "Room is full" }]);
  assert.ok(late.sent.some((message) => message.type === "error" && message.code === "ROOM_FULL"));
});

test("players already in a room from one network do not block another from that network", async () => {
  const clientKey = "A".repeat(43);
  const existingPlayers = Array.from({ length: 6 }, (_, index) => ({
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
    name: "Seventh player",
  }));

  assert.equal(context.storage.room.players.length, 7);
  assert.deepEqual(joining.closed, []);
  assert.ok(joining.sent.some((message) => message.type === "joined" && message.isHost === false));
  for (const socket of sockets) {
    assert.ok(socket.sent.some((message) => (
      message.type === "room-update" && message.roomState.totalPlayers === 7
    )));
  }
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
