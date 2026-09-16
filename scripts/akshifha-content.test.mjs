import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES } from '../akshifha-cases.js';

const languages = ['ar', 'en'];
const key = (ids) => [...ids].sort().join('|');
const pairs = (values) => values.flatMap((first, i) => values.slice(i + 1).map(second => [first, second]));
const product = (arrays) => arrays.reduce((rows, values) => rows.flatMap(row => values.map(value => [...row, value])), [[]]);
const bilingual = (value, context) => {
  assert.deepEqual(Object.keys(value).sort(), languages, context);
  for (const language of languages) {
    assert.equal(typeof value[language], 'string', `${context}/${language}`);
    assert.ok(value[language].trim(), `${context}/${language} is empty`);
    assert.doesNotMatch(value[language], /<\/?(?:script|iframe|img)\b/iu, context);
  }
  assert.match(value.ar, /[\u0621-\u064A]/u, `${context}: Arabic text expected`);
  assert.match(value.en, /[A-Za-z]/u, `${context}: English text expected`);
};

test('five original cases have a complete bilingual, accessible text-only contract', () => {
  assert.equal(CASES.length, 5);
  assert.equal(new Set(CASES.map(item => item.id)).size, CASES.length);
  assert.deepEqual(CASES.map(item => item.number), [1, 2, 3, 4, 5]);
  for (const item of CASES) {
    assert.match(item.id, /^[a-z]+(?:-[a-z]+)*$/u);
    for (const field of ['title', 'intro', 'rule', 'difficulty', 'explanation']) bilingual(item[field], `${item.id}/${field}`);
    assert.ok(item.evidence.length >= 4 && item.evidence.length <= 5);
    assert.equal(new Set(item.evidence.map(card => card.id)).size, item.evidence.length);
    assert.equal(item.options.length, 3);
    assert.equal(new Set(item.options.map(option => option.id)).size, 3);
    assert.equal(item.hints.length, 2);
    for (const card of item.evidence) {
      assert.match(card.id, /^[a-z]+(?:-[a-z]+)*$/u);
      assert.ok(['record', 'message', 'note', 'receipt', 'schedule'].includes(card.kind));
      bilingual(card.label, `${item.id}/${card.id}/label`);
      bilingual(card.text, `${item.id}/${card.id}/text`);
      assert.deepEqual(Object.keys(card).sort(), ['id', 'kind', 'label', 'text']);
    }
    for (const option of item.options) bilingual(option.text, `${item.id}/${option.id}`);
    item.hints.forEach((hint, i) => bilingual(hint, `${item.id}/hint-${i}`));
    assert.equal(item.solution.evidenceIds.length, 2);
    assert.equal(new Set(item.solution.evidenceIds).size, 2);
    assert.ok(item.solution.evidenceIds.every(id => item.evidence.some(card => card.id === id)));
    assert.ok(item.options.some(option => option.id === item.solution.optionId));
    for (const language of languages) {
      assert.equal(new Set(item.options.map(option => option.text[language])).size, 3);
    }
  }
});

// Independent finite-world models check the intended logical structure. They do
// not parse natural language or certify its editorial quality. The text anchors
// below make important data drift visible; human review is still required.
const models = new Map([
  ['the-first-van', {
    worlds: product([[8, 12, 16], [8, 12, 16], [false, true]]).map(([sealed, departed, late]) => ({ sealed, departed, late })),
    facts: {
      'cake-seal': world => world.sealed === 12,
      'cake-van': world => world.departed === 8,
      'cake-greeting': () => true,
      'cake-decoration': () => true,
    },
    conclusions: {
      'missed-first-van': world => world.sealed > world.departed,
      'arrival-late': world => world.late,
      'never-packed': () => false,
    },
  }],
  ['one-table-please', {
    worlds: product([['A', 'B', 'C'], [4, 2, 3], [4, 2, 3], [4, 2, 3]]).map(([booking, A, B, C]) => ({ booking, layouts: { A, B, C } })),
    facts: {
      'table-booking': world => world.booking === 'B',
      // The value is the biggest table allocation in the package; every
      // package has four seats total, arranged 4, 2+2, or 3+1.
      'table-layout': world => world.layouts.A === 4 && world.layouts.B === 2 && world.layouts.C === 3,
      'table-menu': () => true,
      'table-music': () => true,
    },
    conclusions: {
      'split-group': world => world.layouts[world.booking] < 4,
      'two-standing': () => false,
      'single-table': world => world.layouts[world.booking] === 4,
    },
  }],
  ['the-wrong-invitation', {
    worlds: product([[4, 5], ['Cedar', 'Garden'], ['Cedar', 'Garden'], [false, true]]).map(([printed, v4, v5, guestsMisdirected]) => ({ printed, venues: { 4: v4, 5: v5 }, guestsMisdirected })),
    facts: {
      'invitation-print': world => world.printed === 4,
      'invitation-versions': world => world.venues[4] === 'Cedar' && world.venues[5] === 'Garden',
      'invitation-paper': () => true,
      'invitation-books': () => true,
      'invitation-envelopes': () => true,
    },
    conclusions: {
      'old-venue-printed': world => world.venues[world.printed] === 'Cedar',
      'new-venue-printed': world => world.venues[world.printed] === 'Garden',
      'all-guests-misdirected': world => world.guestsMisdirected,
    },
  }],
  ['the-aquarium-shortcut', {
    worlds: product([['Blue', 'Green'], [false, true], [false, true], [false, true], [false, true]]).map(([line, blueAquarium, greenAquarium, wrongDate, fee]) => ({ line, stops: { Blue: blueAquarium, Green: greenAquarium }, wrongDate, fee })),
    facts: {
      'bus-ticket': world => world.line === 'Blue',
      'bus-routes': world => !world.stops.Blue && world.stops.Green,
      // Departure/admission times impose no stop-membership constraints.
      'bus-departures': () => true,
      'bus-admission': () => true,
    },
    conclusions: {
      'not-direct': world => !world.stops[world.line],
      'wrong-date': world => world.wrongDate,
      'extra-charge': world => world.fee,
    },
  }],
  ['the-photo-caption', {
    worlds: [
      ['Salma', 'Noor', 'Amina'], ['Salma', 'Amina', 'Noor'],
      ['Noor', 'Salma', 'Amina'], ['Noor', 'Amina', 'Salma'],
      ['Amina', 'Salma', 'Noor'], ['Amina', 'Noor', 'Salma'],
    ],
    facts: {
      'photo-neighbors': world => world.indexOf('Salma') + 1 === world.indexOf('Noor'),
      'photo-order': world => world.indexOf('Noor') < world.indexOf('Amina'),
      // A membership list supplies no ordering. The editing log preserves
      // whichever of the six original permutations was photographed.
      'photo-attendance': () => true,
      'photo-editing': () => true,
      'photo-album': () => true,
    },
    conclusions: {
      'salma-left': world => world[0] === 'Salma',
      'noor-left': world => world[0] === 'Noor',
      'amina-left': world => world[0] === 'Amina',
    },
  }],
]);

for (const item of CASES) {
  test(`${item.id}: exactly one evidence pair proves the answer; neither card alone suffices`, () => {
    const model = models.get(item.id);
    assert.ok(model, 'case needs an independently authored constraint model');
    assert.deepEqual(Object.keys(model.facts).sort(), item.evidence.map(card => card.id).sort());
    assert.deepEqual(Object.keys(model.conclusions).sort(), item.options.map(option => option.id).sort());
    const surviving = ids => model.worlds.filter(world => ids.every(id => model.facts[id](world)));
    const proves = (ids, optionId) => {
      const worlds = surviving(ids);
      return worlds.length > 0 && worlds.every(model.conclusions[optionId]);
    };
    const ids = item.evidence.map(card => card.id);
    assert.ok(surviving(ids).length > 0, 'trusted evidence must be mutually consistent');
    const supportedOptions = item.options.filter(option => proves(ids, option.id));
    assert.deepEqual(supportedOptions.map(option => option.id), [item.solution.optionId]);
    assert.equal(proves([], item.solution.optionId), false, 'rules alone must not solve the case');
    for (const id of ids) assert.equal(proves([id], item.solution.optionId), false, `${id} alone must not solve the case`);
    const proofPairs = pairs(ids).filter(pair => proves(pair, item.solution.optionId));
    assert.deepEqual(proofPairs.map(key), [key(item.solution.evidenceIds)]);
  });
}

test('bilingual clue anchors retain the facts used by the independent models', () => {
  const card = (caseId, cardId) => CASES.find(item => item.id === caseId).evidence.find(item => item.id === cardId);
  for (const language of languages) {
    assert.match(card('the-first-van', 'cake-seal').text[language], /14:12/u);
    assert.match(card('the-first-van', 'cake-van').text[language], /14:08/u);
    assert.match(card('one-table-please', 'table-booking').text[language], /\bB\b/u);
    for (const code of ['A:', 'B:', 'C:']) assert.ok(card('one-table-please', 'table-layout').text[language].includes(code));
    assert.match(card('the-wrong-invitation', 'invitation-print').text[language], /4/u);
    assert.match(card('the-wrong-invitation', 'invitation-versions').text[language], /4.*5/su);
  }
  assert.match(card('the-wrong-invitation', 'invitation-versions').text.ar, /4.*قاعة الأرز.*5.*قاعة الحديقة/su);
  assert.match(card('the-wrong-invitation', 'invitation-versions').text.en, /4.*Cedar Hall.*5.*Garden Hall/su);
  assert.match(card('the-aquarium-shortcut', 'bus-ticket').text.ar, /الأزرق/u);
  assert.match(card('the-aquarium-shortcut', 'bus-ticket').text.en, /Blue/u);
  assert.match(card('the-photo-caption', 'photo-neighbors').text.ar, /سلمى مباشرة إلى يسار نور/u);
  assert.match(card('the-photo-caption', 'photo-neighbors').text.en, /Salma.*immediately to Noor’s left/u);
  assert.match(card('the-photo-caption', 'photo-order').text.ar, /نور إلى يسار أمينة/u);
  assert.match(card('the-photo-caption', 'photo-order').text.en, /Noor.*Amina’s left/u);
});

test('reviewed wording closes re-sealing ambiguity and does not reveal early answers in titles', () => {
  const cake = CASES.find(item => item.id === 'the-first-van');
  const seal = cake.evidence.find(card => card.id === 'cake-seal');
  assert.match(seal.text.ar, /للمرة الأولى داخل المخبز/u);
  assert.match(seal.text.en, /for the first time inside the bakery/u);
  assert.equal(cake.title.en, 'The party cake delivery');
  assert.equal(CASES.find(item => item.id === 'one-table-please').title.en, 'The quiz-night booking');
  assert.equal(CASES.find(item => item.id === 'the-wrong-invitation').title.en, 'The invitation print run');
});

test('later cases include plausible records beyond the two decisive cards', () => {
  const bus = CASES.find(item => item.id === 'the-aquarium-shortcut');
  const photo = CASES.find(item => item.id === 'the-photo-caption');
  for (const item of [bus, photo]) {
    const contextualRecords = item.evidence.filter(card => !item.solution.evidenceIds.includes(card.id)
      && ['record', 'receipt', 'schedule'].includes(card.kind));
    assert.ok(contextualRecords.length >= 2, `${item.id} needs contextual record distractors`);
  }
  const departure = bus.evidence.find(card => card.id === 'bus-departures');
  for (const language of languages) assert.match(departure.text[language], /18:20/u);
  assert.match(departure.text.ar, /الأزرق والأخضر/u);
  assert.match(departure.text.en, /Blue and Green/u);
  const attendance = photo.evidence.find(card => card.id === 'photo-attendance');
  assert.match(attendance.text.ar, /لا ترتيبهم في الصورة/u);
  assert.match(attendance.text.en, /not positions in the photo/u);
});
