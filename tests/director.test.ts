import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressesEveryone, followUp, mentioned, planSpeakers, type Participant } from '../shared/director.ts';

const people: Participant[] = [
  { id: 'ronaldo', name: 'Cristiano Ronaldo', aliases: ['CR7'], nameAr: 'كريستيانو رونالدو' },
  { id: 'messi', name: 'Lionel Messi', aliases: ['Leo'], nameAr: 'ليونيل ميسي' },
  { id: 'khabib', name: 'Khabib Nurmagomedov', aliases: ['The Eagle'], nameAr: 'حبيب نورمحمدوف' },
  { id: 'mrbeast', name: 'MrBeast', aliases: ['Jimmy'] },
];

function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

test('mentioned finds participants by full name, surname, alias and Arabic name', () => {
  assert.deepEqual(mentioned('Messi, what do you think?', people), ['messi']);
  assert.deepEqual(mentioned('cr7 and the eagle should fight', people).sort(), ['khabib', 'ronaldo']);
  assert.deepEqual(mentioned('يا ميسي وش رايك', people), ['messi']);
  assert.deepEqual(mentioned('who is the best player ever?', people), []);
});

test('addressesEveryone recognises group address in several languages', () => {
  assert.ok(addressesEveryone('Okay everyone, favourite food?'));
  assert.ok(addressesEveryone('كلكم وش رايكم'));
  assert.ok(addressesEveryone('¿Qué opinan ustedes?'));
  assert.ok(!addressesEveryone('What is your favourite food?'));
});

test('planSpeakers lets the addressed character answer first', () => {
  const plan = planSpeakers({ participants: people, text: 'Khabib, who wins?', history: ['ronaldo'], rng: seq(0.99) });
  assert.deepEqual(plan, ['khabib']);
});

test('planSpeakers gives everyone a turn (capped) when the user addresses the group', () => {
  const plan = planSpeakers({ participants: people, text: 'Everyone: pineapple on pizza?', history: ['messi', 'ronaldo'] });
  assert.equal(plan.length, 4);
  assert.equal(new Set(plan).size, 4);
  // Least recently heard speak first.
  assert.equal(plan[plan.length - 1], 'ronaldo');
});

test('planSpeakers never picks the previous speaker for an open question', () => {
  for (let i = 0; i < 200; i++) {
    const plan = planSpeakers({ participants: people, text: 'What did you eat today?', history: ['mrbeast', 'khabib'] });
    assert.ok(plan.length >= 1 && plan.length <= 2);
    assert.notEqual(plan[0], 'khabib');
    assert.equal(new Set(plan).size, plan.length);
  }
});

test('planSpeakers with one participant always returns that participant', () => {
  assert.deepEqual(planSpeakers({ participants: [people[0]], text: 'hi', history: [] }), ['ronaldo']);
  assert.deepEqual(planSpeakers({ participants: [], text: 'hi', history: [] }), []);
});

test('followUp hands the turn to a character addressed with a question', () => {
  assert.deepEqual(followUp('Messi, do you agree with me?', 'ronaldo', [], people, 2), ['messi']);
  // Passing mentions without a question do not trigger a reply.
  assert.deepEqual(followUp('I played against Messi many times.', 'ronaldo', [], people, 2), []);
  // No budget left: queue unchanged.
  assert.deepEqual(followUp('Messi, do you agree?', 'ronaldo', ['khabib'], people, 0), ['khabib']);
  // A speaker never hands the turn to themselves.
  assert.deepEqual(followUp('Ronaldo here, right?', 'ronaldo', [], people, 2), []);
});
