import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PARTY_ROUTES, partyPath, escapeParty, cleanPartyName, partyNames,
  shuffleParty, validatePartyData, createMostLikely, startPartyVoting,
  readyPartyVoter, castPartyVote, finishPartyQuestion, nextPartyQuestion,
  createKnowMeDraft, replaceKnowMeQuestion, quizCreationPayload,
  validQuizCode, validQuizToken, newQuizToken,
} from '../party-games-engine.js';

const content = JSON.parse(await readFile(new URL('../data/party-games.json', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
const fixedRandom = () => 0.37;

test('party content contains 100 original bilingual group prompts and 60 subjective four-choice questions', () => {
  assert.equal(validatePartyData(content), content);
  assert.equal(content.mostLikely.questions.length, 100);
  assert.equal(content.knowMe.questions.length, 60);
  assert.deepEqual(content.mostLikely.packs.map(p => p.id), ['chaos', 'adventures', 'spotlight', 'friends']);
  assert.deepEqual(content.knowMe.packs.map(p => p.id), ['surprises', 'habits', 'choices']);
  const ids = new Set();
  for (const [key, count] of [['mostLikely', 25], ['knowMe', 20]]) {
    const game = content[key];
    for (const pack of game.packs) {
      assert.equal(game.questions.filter(q => q.pack === pack.id).length, count);
      for (const label of [pack.title, pack.description]) for (const lang of ['en', 'ar']) assert.ok(label[lang].trim());
    }
    for (const lang of ['en', 'ar']) assert.equal(new Set(game.questions.map(q => q.text[lang])).size, game.questions.length);
    for (const q of game.questions) {
      assert.ok(!ids.has(q.id), `duplicate id ${q.id}`); ids.add(q.id);
      assert.ok(q.text.en.endsWith('?'));
      assert.ok(q.text.ar.endsWith('؟') && /[\u0600-\u06ff]/u.test(q.text.ar));
      assert.ok(q.text.en.length <= 200 && q.text.ar.length <= 200, `${q.id} fits a readable party card`);
      if (key === 'knowMe') {
        assert.equal(q.options.length, 4);
        for (const lang of ['en', 'ar']) {
          assert.equal(new Set(q.options.map(o => o[lang])).size, 4);
          assert.ok(q.options.every(o => typeof o[lang] === 'string' && o[lang].trim()));
        }
        assert.ok(q.options.every(o => /[\u0600-\u06ff]/u.test(o.ar)));
        for (const answerField of ['answer', 'answerIndex', 'correctIndex', 'correctAnswer']) assert.equal(answerField in q, false, `${q.id}: creator decides the answer`);
      }
    }
  }
});

test('the runtime rejects malformed or incomplete content before starting a game', () => {
  const invalid = [
    d => { d.version = 2; },
    d => { d.mostLikely.questions[1].id = d.mostLikely.questions[0].id; },
    d => { d.knowMe.questions[0].pack = 'missing'; },
    d => { d.mostLikely.questions[0].text.ar = ' '; },
    d => { d.knowMe.questions[0].options.pop(); },
    d => { d.knowMe.questions[0].options[0].en = ''; },
    d => { d.knowMe.questions[0].id = '<script>'; },
    d => { d.knowMe.questions = d.knowMe.questions.slice(0, 19); },
  ];
  for (const mutate of invalid) { const copy = clone(content); mutate(copy); assert.throws(() => validatePartyData(copy), /data/u); }
});

test('party nicknames normalize readable Unicode and accept English and Arabic lists', () => {
  assert.equal(cleanPartyName('  Ｏｍａｒ   Ali  '), 'Omar Ali');
  assert.equal(cleanPartyName('  لينا  '), 'لينا');
  assert.deepEqual(partyNames('Omar\nLina, Maya، سامي'), ['Omar', 'Lina', 'Maya', 'سامي']);
  assert.deepEqual(partyNames('Omar\n\nLina\n'), ['Omar', 'Lina']);
  assert.equal(cleanPartyName('A'.repeat(24)), 'A'.repeat(24));
  assert.equal(cleanPartyName('A'.repeat(25)), null);
});

test('party setup rejects duplicate, unsafe and out-of-bound nicknames', () => {
  for (const value of [null, {}, '', '<b>Omar</b>', 'A&B', 'Lina\u202e', 'Sam\u0000']) assert.equal(cleanPartyName(value), null);
  for (const names of ['Omar', 'Omar,omar', 'Ｏｍａｒ,Omar', 'Omar,<b>Lina</b>', Array.from({length:13}, (_,i) => `Player ${i}`).join('\n')]) assert.throws(() => partyNames(names), /names/u);
  assert.equal(partyNames(Array.from({length:12}, (_,i) => `Player ${i}`).join('\n')).length, 12);
});

test('shuffling and game creation preserve canonical data and choose unique requested-pack questions', () => {
  const before = JSON.stringify(content);
  const original = [1, 2, 3, 4];
  const shuffled = shuffleParty(original, fixedRandom);
  assert.deepEqual(original, [1, 2, 3, 4]); assert.deepEqual([...shuffled].sort(), original);
  for (const pack of ['all', ...content.mostLikely.packs.map(p => p.id)]) {
    for (const rounds of [10, 15, 20]) {
      const game = createMostLikely(content, {names:'Omar,Lina', pack, rounds, mode:'vote'}, fixedRandom);
      assert.equal(game.questions.length, rounds);
      assert.equal(new Set(game.questions.map(q => q.id)).size, rounds);
      assert.ok(game.questions.every(q => pack === 'all' || q.pack === pack));
      assert.deepEqual(game.scores, [0,0]); assert.equal(game.phase, 'question');
    }
  }
  assert.equal(JSON.stringify(content), before);
});

test('game settings reject unsupported counts, modes and packs', () => {
  for (const settings of [{rounds:0}, {rounds:11}, {rounds:'10'}, {mode:'public-ballots'}, {pack:'missing'}]) {
    assert.throws(() => createMostLikely(content, {names:'Omar,Lina', ...settings}, fixedRandom), /settings|pack/u);
  }
});

test('private voting requires each handoff and reveals only the final aggregate tie', () => {
  const game = createMostLikely(content, {names:'Omar,Lina', mode:'vote'}, fixedRandom);
  assert.equal(castPartyVote(game,0), false);
  startPartyVoting(game); assert.equal(game.phase,'handoff');
  assert.equal(castPartyVote(game,0), false);
  readyPartyVoter(game); assert.equal(game.phase,'voting');
  for (const invalid of [-1,2,0.5,'0',null]) assert.equal(castPartyVote(game,invalid),false);
  assert.equal(castPartyVote(game,0),true);
  assert.equal(game.phase,'handoff'); assert.equal(game.voter,1);
  assert.deepEqual(game.scores,[0,0]); assert.deepEqual(game.history,[]);
  assert.equal(castPartyVote(game,1),false,'one voter cannot cast the next ballot without the handoff');
  readyPartyVoter(game); assert.equal(castPartyVote(game,1),true);
  assert.equal(game.phase,'reveal'); assert.deepEqual(game.selected,[0,1]);
  assert.deepEqual(game.history[0].counts,[1,1]); assert.deepEqual(game.scores,[1,1]);
  assert.deepEqual(game.votes,[],'individual private ballots are discarded after the reveal');
  assert.equal(castPartyVote(game,0),false); assert.equal(finishPartyQuestion(game,[0]),false);
  assert.equal(game.history.length,1,'a reveal is scored once');
});

test('private voting finds an unambiguous winner and skips abandon partial ballots', () => {
  const game = createMostLikely(content,{names:'Omar,Lina,Maya',mode:'vote'},fixedRandom);
  startPartyVoting(game);
  for (const vote of [1,0,1]) { readyPartyVoter(game); assert.equal(castPartyVote(game,vote),true); }
  assert.deepEqual(game.selected,[1]); assert.deepEqual(game.scores,[0,1,0]); assert.deepEqual(game.history[0].counts,[1,2,0]);
  nextPartyQuestion(game); startPartyVoting(game); readyPartyVoter(game); castPartyVote(game,2);
  assert.equal(finishPartyQuestion(game),true);
  assert.equal(game.history[1].skipped,true); assert.deepEqual(game.votes,[]); assert.deepEqual(game.scores,[0,1,0]);
  nextPartyQuestion(game); assert.equal(game.voter,0); assert.equal(game.phase,'question');
});

test('point mode supports ties, ignores duplicate winners and counts each round once', () => {
  const game=createMostLikely(content,{names:'Omar,Lina,Maya',mode:'point'},fixedRandom);
  startPartyVoting(game); assert.equal(game.phase,'point');
  finishPartyQuestion(game,[0,1,1,-1,99,'2']);
  assert.deepEqual(game.selected,[0,1]); assert.deepEqual(game.scores,[1,1,0]); assert.equal(game.history[0].counts,null);
  assert.equal(finishPartyQuestion(game,[2]),false); assert.deepEqual(game.scores,[1,1,0]);
});

test('a complete ten-question session finishes with exact scores and no score for skips', () => {
  const game=createMostLikely(content,{names:'Omar,Lina',mode:'point'},fixedRandom);
  for(let i=0;i<10;i++) {
    assert.equal(game.index,i); assert.equal(game.phase,'question');
    startPartyVoting(game); finishPartyQuestion(game,i<2?[0,1]:i===2?[0]:[]); nextPartyQuestion(game);
  }
  assert.equal(game.phase,'finished'); assert.equal(game.index,10); assert.deepEqual(game.scores,[3,2]);
  assert.equal(game.history.length,10); assert.equal(game.history.filter(q=>q.skipped).length,7);
  nextPartyQuestion(game); assert.equal(game.index,10);
});

test('Know Me drafts select ten distinct questions from every requested pack without changing source', () => {
  const before=JSON.stringify(content);
  for(const pack of ['all',...content.knowMe.packs.map(p=>p.id)]) {
    const draft=createKnowMeDraft(content,pack,fixedRandom);
    assert.equal(draft.questions.length,10); assert.equal(new Set(draft.questions.map(q=>q.id)).size,10);
    assert.ok(draft.questions.every(q=>pack==='all'||q.pack===pack)); assert.deepEqual(draft.answers,Array(10).fill(null));
  }
  assert.throws(()=>createKnowMeDraft(content,'missing'),/pack/u); assert.equal(JSON.stringify(content),before);
});

test('question replacement resets only that answer and never duplicates another chosen question', () => {
  const draft=createKnowMeDraft(content,'surprises',fixedRandom);
  draft.answers=Array(10).fill(2); draft.index=4;
  let previous=draft.questions[4].id;
  for(let i=0;i<35;i++) {
    assert.equal(replaceKnowMeQuestion(draft,content,fixedRandom),true);
    assert.notEqual(draft.questions[4].id,previous); assert.equal(draft.questions[4].pack,'surprises');
    assert.equal(new Set(draft.questions.map(q=>q.id)).size,10); assert.equal(draft.answers[4],null);
    assert.ok(draft.answers.every((a,index)=>index===4||a===2)); previous=draft.questions[4].id; draft.answers[4]=1;
  }
});

test('quiz creation includes only canonical IDs, creator choices and a valid private token', () => {
  const draft=createKnowMeDraft(content,'choices',fixedRandom); draft.answers=Array.from({length:10},(_,i)=>i%4);
  const token='A'.repeat(43); const payload=quizCreationPayload(draft,'  لينا  ','ar',token);
  assert.deepEqual(payload,{token,name:'لينا',lang:'ar',questions:draft.questions.map((q,i)=>({id:q.id,answerIndex:i%4}))});
  assert.ok(payload.questions.every(q=>Object.keys(q).join(',')==='id,answerIndex'),'question text and options are selected by the server from canonical IDs');
});

test('quiz creation rejects missing answers, bad choices, tokens, languages and nicknames', () => {
  const valid=createKnowMeDraft(content,'all',fixedRandom); valid.answers=Array(10).fill(0);
  for(const answers of [Array(9).fill(0),Array(10).fill(null),[...Array(9).fill(0),4],[...Array(9).fill(0),0.5],[...Array(9).fill(0),'0']]) {
    assert.throws(()=>quizCreationPayload({...valid,answers},'Omar','en','A'.repeat(43)),/answers/u);
  }
  for(const [name,lang,token] of [['<Omar>','en','A'.repeat(43)],['Omar','fr','A'.repeat(43)],['Omar','en','short'],['Omar','en','A'.repeat(42)+'+']]) {
    assert.throws(()=>quizCreationPayload(valid,name,lang,token),/name/u);
  }
});

test('public codes and cryptographic access tokens are distinct validated shapes', () => {
  assert.equal(validQuizCode('ABCDEFGHJKMN'),true);
  for(const code of ['ABC', 'ABCDEFGHIJKL','ABCDEFGHIJKO','abcdefghjkmn','ABCDEFGHJKM0','ABCDEFGHJKM1']) assert.equal(validQuizCode(code),false);
  assert.equal(validQuizToken('A'.repeat(43)),true); assert.equal(validQuizToken('a_-'.repeat(14)+'Z'),true);
  for(const token of ['',null,'A'.repeat(42),'A'.repeat(44),'A'.repeat(42)+'+']) assert.equal(validQuizToken(token),false);
  const tokens=new Set(Array.from({length:20},()=>newQuizToken())); assert.equal(tokens.size,20);
  assert.ok([...tokens].every(validQuizToken)); assert.ok([...tokens].every(token=>!validQuizCode(token)));
});

test('game links use the correct bilingual routes and escape untrusted display text', () => {
  assert.deepEqual(PARTY_ROUTES,{mostLikely:'most-likely-to',knowMe:'how-well-do-you-know-me'});
  assert.equal(partyPath('mostLikely','en'),'/most-likely-to'); assert.equal(partyPath('mostLikely','ar'),'/ar/games/most-likely-to/');
  assert.equal(partyPath('knowMe','en'),'/how-well-do-you-know-me'); assert.equal(partyPath('knowMe','ar'),'/ar/games/how-well-do-you-know-me/');
  assert.equal(escapeParty('<img src="x" onerror=\'bad\'>&'), '&lt;img src=&quot;x&quot; onerror=&#39;bad&#39;&gt;&amp;');
  assert.equal(escapeParty(null),'');
});
