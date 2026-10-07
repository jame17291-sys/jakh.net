import assert from 'node:assert/strict';
import test from 'node:test';
import { FRIENDSHIP_CONTENT } from '../friendship-games-content.js';
import { FRIENDSHIP_ROUTES, friendshipPath, createFriendshipGame, revealSecret, nextSecret, startFriendshipVote, readyFriendshipVoter, castFriendshipVote, finishPanic, finishFriendshipRound } from '../friendship-games-engine.js';

const fixed = () => 0;

test('friendship games have original bilingual prompts and safe local routes', () => {
  assert.deepEqual(FRIENDSHIP_ROUTES, { impostor: 'secret-word-impostor', panic: 'panic-mode', court: 'friendship-court' });
  for (const game of Object.keys(FRIENDSHIP_ROUTES)) {
    assert.ok(FRIENDSHIP_CONTENT[game].length >= 10);
    assert.equal(new Set(FRIENDSHIP_CONTENT[game].map(card => card.id)).size, FRIENDSHIP_CONTENT[game].length);
    for (const card of FRIENDSHIP_CONTENT[game]) {
      const text = card.word || card.text || card.charge;
      assert.ok(text.en.trim() && text.ar.trim() && /[\u0600-\u06ff]/u.test(text.ar));
    }
  }
  assert.equal(friendshipPath('impostor', 'en'), '/secret-word-impostor');
  assert.equal(friendshipPath('court', 'ar'), '/ar/games/friendship-court/');
});

test('impostor keeps roles private until every player has seen their screen and discards ballots after reveal', () => {
  const state = createFriendshipGame('impostor', 'Omar,Lina,Maya', 5, fixed);
  assert.equal(state.imposter, 0); assert.equal(state.phase, 'secret-handoff');
  assert.equal(nextSecret(state), false);
  for (let player = 0; player < 3; player++) {
    assert.equal(revealSecret(state), true);
    assert.equal(revealSecret(state), false);
    assert.equal(nextSecret(state), true);
    if (player < 2) assert.equal(state.phase, 'secret-handoff');
  }
  assert.equal(state.phase, 'clue');
  assert.equal(startFriendshipVote(state), true);
  for (const vote of [0, 0, 1]) { assert.equal(readyFriendshipVoter(state), true); assert.equal(castFriendshipVote(state, vote), true); }
  assert.equal(state.phase, 'reveal'); assert.equal(state.votes.length, 3);
  finishFriendshipRound(state); assert.equal(state.votes.length, 0); assert.equal(state.phase, 'secret-handoff');
});

test('panic scores only a group-approved round and court skips the accused during private jury voting', () => {
  const panic = createFriendshipGame('panic', 'Omar,Lina', 5, fixed);
  assert.equal(finishPanic(panic, true), false);
  panic.phase = 'judge';
  assert.equal(finishPanic(panic, true), true); assert.equal(panic.lastSuccess, true); assert.deepEqual(panic.scores, [1, 0]); finishFriendshipRound(panic); assert.equal(panic.timer, 5);
  const court = createFriendshipGame('court', 'Omar,Lina,Maya', 5, fixed);
  assert.equal(court.accused, 0); startFriendshipVote(court); assert.equal(court.viewer, 1); assert.equal(readyFriendshipVoter(court), true);
  assert.equal(castFriendshipVote(court, 1), true); assert.equal(readyFriendshipVoter(court), true); assert.equal(court.viewer, 2);
  assert.equal(castFriendshipVote(court, 1), true); assert.equal(court.phase, 'reveal'); finishFriendshipRound(court); assert.equal(court.scores[0], 1);
});

test('impostor needs three players and draws a fresh role rather than revealing the next role through rotation', () => {
  assert.throws(() => createFriendshipGame('impostor', 'Omar,Lina', 5, fixed));
  const state = createFriendshipGame('impostor', 'Omar,Lina,Maya', 5, fixed);
  for (const [random, expected] of [[0, 0], [0.99, 2], [0.4, 1]]) {
    state.phase = 'reveal'; state.skipped = true;
    finishFriendshipRound(state, () => random);
    assert.equal(state.imposter, expected);
    assert.equal(state.phase, 'secret-handoff');
    assert.deepEqual(state.scores, [0, 0, 0]);
  }
});

test('the accused never receives the initial or subsequent jury handoff', () => {
  for (let accused = 0; accused < 3; accused++) {
    const state = createFriendshipGame('court', 'Omar,Lina,Maya', 5, fixed);
    state.accused = accused; startFriendshipVote(state);
    const voters = [];
    while (state.phase !== 'reveal') {
      assert.notEqual(state.viewer, accused);
      voters.push(state.viewer);
      assert.equal(readyFriendshipVoter(state), true);
      assert.equal(castFriendshipVote(state, 1), true);
    }
    assert.deepEqual(voters, [0, 1, 2].filter(index => index !== accused));
  }
});

test('skipping a round cannot award points or carry a previous panic result', () => {
  const impostor = createFriendshipGame('impostor', 'Omar,Lina,Maya', 5, fixed);
  impostor.phase = 'reveal'; impostor.skipped = true;
  assert.equal(finishFriendshipRound(impostor), true); assert.deepEqual(impostor.scores, [0, 0, 0]);
  const panic = createFriendshipGame('panic', 'Omar,Lina', 5, fixed);
  panic.phase = 'judge'; finishPanic(panic, true); finishFriendshipRound(panic);
  panic.phase = 'judge'; finishPanic(panic, false);
  assert.equal(panic.lastSuccess, false);
});
