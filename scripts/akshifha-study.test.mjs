import test from 'node:test';
import assert from 'node:assert/strict';
import { createAkshifhaStudy } from '../akshifha-study.js';

const initial = {
  caseId: 'the-first-van', gameMode: 'practice', language: 'en',
  entry: 'initial', completedBefore: false, priorCompletions: 0, progressAvailable: true,
};

function setup(consent = true) {
  const sent = [];
  const choice = { consent };
  const study = createAkshifhaStudy({
    allowed: () => choice.consent,
    send: (name, params) => sent.push({ name, params }),
  });
  return { sent, choice, study };
}

test('declining analytics creates no events and opting in never reconstructs the current round', () => {
  const { sent, choice, study } = setup(false);
  assert.equal(study.open(initial), false);
  study.track('check', { attempts: 1, correct: false });
  choice.consent = true;
  assert.equal(study.track('complete', { outcome: 'solved' }), false);
  assert.deepEqual(sent, []);
  study.open({ ...initial, entry: 'next', caseId: 'the-next-case' });
  assert.equal(sent[0].params.observed_round_index, 1);
  assert.equal(sent[0].params.first_page_case, false);
  assert.equal(sent[0].params.after_first_completion, false);
});

test('first round, actual engagement, completion and an uncompleted next case are distinguished', () => {
  const { study, sent } = setup();
  study.open(initial);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.round_kind, 'first_case');
  study.track('hint', { hints_used: 1 });
  study.track('check', { attempts: 1, correct: true });
  study.track('complete', { attempts: 1, hints_used: 1, outcome: 'assisted' });
  study.track('complete', { attempts: 1, hints_used: 1, outcome: 'assisted' });
  study.track('next_case', { destination_case_id: 'the-next-case' });
  study.open({ ...initial, caseId: 'the-next-case', entry: 'next', priorCompletions: 1 });
  assert.equal(sent.filter(item => item.name === 'akshifha_engage').length, 1);
  assert.equal(sent.filter(item => item.name === 'akshifha_complete').length, 1);
  assert.equal(sent.at(-1).params.round_kind, 'next_uncompleted');
  assert.equal(sent.at(-1).params.after_first_completion, true);
  assert.equal(sent.at(-1).params.observed_round_index, 2);
  // The first round's captured history must not turn into 'present' when it finishes.
  assert.equal(sent.find(item => item.name === 'akshifha_complete').params.prior_progress, 'none');
});

test('opening, completing and replaying the same round cannot masquerade as a fresh continuation', () => {
  const { study, sent } = setup();
  study.open(initial);
  study.track('complete', { outcome: 'revealed' });
  study.open({ ...initial, entry: 'next', completedBefore: true, priorCompletions: 1 });
  assert.equal(sent.at(-1).params.round_kind, 'replay');
  assert.equal(sent.at(-1).params.case_history, 'completed');
  assert.equal(sent.at(-1).params.after_first_completion, true);
  assert.equal(sent.find(item => item.name === 'akshifha_complete').params.outcome, 'revealed');
});

test('a previously opened incomplete case is a revisit, and a non-next entry is not continuation', () => {
  const { study, sent } = setup();
  study.open(initial);
  study.open({ ...initial, caseId: 'other-case', entry: 'casebook' });
  assert.equal(sent.at(-1).params.round_kind, 'other_case');
  study.open({ ...initial, entry: 'casebook' });
  assert.equal(sent.at(-1).params.round_kind, 'replay');
  assert.equal(sent.at(-1).params.case_history, 'opened_this_page');
  assert.equal(sent.at(-1).params.after_first_completion, false);
});

test('continue control opens an uncompleted case without claiming result-next continuation or retention', () => {
  const { study, sent } = setup();
  study.open({ ...initial, completedBefore: true, priorCompletions: 1 });
  study.track('complete', { outcome: 'solved' });
  study.open({ ...initial, caseId: 'the-next-case', entry: 'continue', priorCompletions: 1 });
  assert.equal(sent.at(-1).name, 'akshifha_start');
  assert.equal(sent.at(-1).params.entry_point, 'continue');
  assert.equal(sent.at(-1).params.round_kind, 'other_case');
  assert.equal(sent.at(-1).params.after_first_completion, false);
  assert.equal(sent.at(-1).params.prior_progress, 'present');
});

test('missing local progress never implies a first-ever visit or known fresh case', () => {
  const { study, sent } = setup();
  study.open({ ...initial, progressAvailable: false });
  assert.equal(sent[0].params.prior_progress, 'unavailable');
  assert.equal(sent[0].params.case_history, 'unavailable');
  study.track('complete', { outcome: 'solved' });
  study.open({ ...initial, caseId: 'the-next-case', entry: 'next', progressAvailable: false });
  assert.equal(sent.at(-1).params.round_kind, 'next_history_unknown');
});

test('revocation clears round context and a later opt-in requires a new observed opening', () => {
  const { study, sent, choice } = setup();
  study.open(initial);
  choice.consent = false;
  assert.equal(study.track('hint', { hints_used: 1 }), false);
  choice.consent = true;
  assert.equal(study.track('complete', { outcome: 'solved' }), false);
  study.open({ ...initial, caseId: 'other-case', entry: 'next' });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].params.observed_round_index, 1);
  assert.equal(sent[1].params.after_first_completion, false);
});

test('each emitted event checks consent even when engagement and a result occur together', () => {
  let allowed = true;
  const sent = [];
  const study = createAkshifhaStudy({
    allowed: () => allowed,
    send: (name) => {
      sent.push(name);
      if (name === 'akshifha_engage') allowed = false;
    },
  });
  study.open(initial);
  assert.equal(study.track('complete', { outcome: 'revealed' }), false);
  assert.deepEqual(sent, ['akshifha_start', 'akshifha_engage']);
  allowed = true;
  assert.equal(study.track('complete', { outcome: 'revealed' }), false);
});

test('explicit reset drops context, including same-page case history', () => {
  const { study, sent } = setup();
  study.open(initial);
  study.reset();
  assert.equal(study.track('check', { attempts: 1, correct: true }), false);
  study.open({ ...initial, entry: 'casebook' });
  assert.equal(sent.at(-1).params.case_history, 'no_saved_completion');
  assert.equal(sent.at(-1).params.observed_round_index, 1);
});

test('only known scalar event fields are sent; no free text or overridden round identity leaks', () => {
  const { study, sent } = setup();
  study.open(initial);
  study.track('check', {
    attempts: 10000, correct: false, email: 'person@example.test',
    answer: 'free text', case_id: 'overridden', prior_progress: 'fabricated',
  });
  assert.equal(sent.at(-1).params.attempts, 999);
  assert.equal(sent.at(-1).params.case_id, initial.caseId);
  assert.equal(sent.at(-1).params.prior_progress, 'none');
  assert.equal('email' in sent.at(-1).params, false);
  assert.equal('answer' in sent.at(-1).params, false);
  assert.equal(study.track('custom_personal_event', { value: 'private' }), false);
});

test('privacy/storage-access errors and failed analytics transports cannot break play', () => {
  const unavailable = createAkshifhaStudy({ allowed: () => { throw new Error('Storage blocked'); } });
  assert.doesNotThrow(() => unavailable.open(initial));
  assert.equal(unavailable.track('complete'), false);
  const blockedTransport = createAkshifhaStudy({ allowed: () => true, send: () => { throw new Error('Blocked'); } });
  assert.doesNotThrow(() => blockedTransport.open(initial));
  assert.doesNotThrow(() => blockedTransport.track('complete', { outcome: 'revealed' }));
  assert.equal(blockedTransport.track('share', { method: 'copy' }), false);
});
