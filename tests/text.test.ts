import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SentenceSplitter, clampText, emotionOf, normalize, tokens, wordOverlap } from '../shared/text.ts';

test('normalize strips diacritics, case and Arabic letter variants', () => {
  assert.equal(normalize('Kylian Mbappé'), 'kylian mbappe');
  assert.equal(normalize('  Vinícius   JÚNIOR '), 'vinicius junior');
  assert.equal(normalize('أحمد'), normalize('احمد'));
  assert.deepEqual(tokens('CR7, the GOAT!'), ['cr7', 'the', 'goat']);
});

test('SentenceSplitter emits sentences as soon as they end while streaming', () => {
  const s = new SentenceSplitter();
  assert.deepEqual(s.push('Hey there, my friend! How are'), ['Hey there, my friend!']);
  assert.deepEqual(s.push(' you doing today? I'), ['How are you doing today?']);
  assert.deepEqual(s.push(' trained all morning.'), []);
  assert.deepEqual(s.flush(), ['I trained all morning.']);
  assert.deepEqual(s.flush(), []);
});

test('SentenceSplitter keeps abbreviations, decimals and short fragments together', () => {
  const s = new SentenceSplitter();
  const out = [...s.push('I met Dr. Smith at 9.30 this morning. Wow. That was a long day! '), ...s.flush()];
  assert.deepEqual(out, ['I met Dr. Smith at 9.30 this morning.', 'Wow. That was a long day!']);
});

test('SentenceSplitter handles Arabic and Spanish punctuation', () => {
  const s = new SentenceSplitter();
  const out = [...s.push('كيف حالك يا صديقي العزيز؟ أنا بخير والحمد لله. '), ...s.flush()];
  assert.equal(out.length, 2);
  const es = new SentenceSplitter();
  assert.deepEqual(es.push('¡Qué partido tan increíble! ¿Lo viste? '), ['¡Qué partido tan increíble!']);
  // "¿Lo viste?" is shorter than the minimum, so it waits for more text or the final flush.
  assert.deepEqual(es.flush(), ['¿Lo viste?']);
});

test('SentenceSplitter breaks very long clauses at a comma so speech can start', () => {
  const s = new SentenceSplitter();
  const long = 'When I was a kid I used to play in the streets every single day after school with my friends, ' + 'and we never stopped until it got dark and our parents called us home for dinner';
  const out = s.push(long);
  assert.equal(out.length, 1);
  assert.ok(out[0].endsWith('friends,'));
});

test('wordOverlap detects echoed speech', () => {
  assert.ok(wordOverlap('I love playing football with my friends', 'love playing football with friends') > 0.6);
  assert.ok(wordOverlap('what is your favourite goal', 'tell me about the weather') < 0.2);
});

test('emotionOf and clampText', () => {
  assert.equal(emotionOf('Hahaha that is hilarious!'), 'laugh');
  assert.equal(emotionOf('The match starts at nine.'), 'neutral');
  assert.equal(clampText('short', 10), 'short');
  assert.ok(clampText('a'.repeat(50), 10).length <= 10);
});
