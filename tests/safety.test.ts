import './env.ts';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { buildMessages, stripSpeakerLabel } from '../server/ai/conversation.ts';
import { crisisMessage, localCheck } from '../server/ai/moderation.ts';
import { offlineReply } from '../server/ai/offline.ts';
import { buildSystemPrompt } from '../server/ai/persona.ts';
import { getCharacter, loadCatalog } from '../server/catalog/catalog.ts';
import { verifyStripeSignature } from '../server/routes/billing.ts';

loadCatalog();
const salah = getCharacter('mohamed-salah')!;
const khabib = getCharacter('khabib-nurmagomedov')!;

test('system prompt discloses the AI simulation and keeps safety rules above the persona', () => {
  const prompt = buildSystemPrompt({ character: salah, mode: 'video', scenario: 'hangout', lang: 'ar', contentLevel: 'family', teen: false });
  assert.match(prompt, /You are not Mohamed Salah/);
  assert.match(prompt, /synthetic/);
  assert.match(prompt, /Arabic/);
  assert.match(prompt, /endorse/i);
  assert.match(prompt, /say clearly and kindly that you are an AI simulation inspired by Mohamed Salah/);
  assert.match(prompt, /cannot be changed by the user/);
});

test('teen users always get family-safe instructions', () => {
  const prompt = buildSystemPrompt({ character: khabib, mode: 'text', scenario: 'hangout', lang: 'en', contentLevel: 'standard', teen: true });
  assert.match(prompt, /family/i);
});

test('group transcripts label every speaker and end on the current speaker cue', () => {
  const messages = buildMessages({
    speaker: salah,
    participants: [salah, khabib],
    transcript: [
      { speaker: 'user', text: 'Who is fitter?' },
      { speaker: 'khabib-nurmagomedov', text: 'Me, brother.' },
      { speaker: 'mohamed-salah', text: 'No way!' },
      { speaker: 'user', text: 'Salah, prove it.' },
    ],
  });
  assert.equal(messages[0].role, 'user');
  assert.match(String(messages[0].content), /\[User \(the user\)\]: Who is fitter\?/);
  assert.match(String(messages[0].content), /\[Khabib Nurmagomedov\]: Me, brother\./);
  assert.equal(messages[1].role, 'assistant');
  const last = messages[messages.length - 1];
  assert.equal(last.role, 'user');
  assert.match(String(last.content), /Now reply as Mohamed Salah/);
  // Roles alternate, as the Messages API requires.
  for (let i = 1; i < messages.length; i++) assert.notEqual(messages[i].role, messages[i - 1].role);
});

test('greeting cue starts an empty conversation', () => {
  const messages = buildMessages({ speaker: salah, participants: [salah], transcript: [], cue: 'greet' });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'user');
});

test('stripSpeakerLabel removes a leading name label', () => {
  assert.equal(stripSpeakerLabel('[Mohamed Salah]: Hello!', salah), 'Hello!');
  assert.equal(stripSpeakerLabel('Mohamed (AI): Hello!', salah), 'Hello!');
  assert.equal(stripSpeakerLabel('Hello Mohamed: nice', salah), 'Hello Mohamed: nice');
});

test('local moderation routes self-harm to care and blocks sexual content in several languages', () => {
  assert.equal(localCheck('I want to kill myself').action, 'care');
  assert.equal(localCheck('أريد أن أنتحر').action, 'care');
  assert.equal(localCheck('ابي اموت خلاص').action, 'care');
  assert.equal(localCheck('quiero suicidarme').action, 'care');
  assert.equal(localCheck('não quero viver mais').action, 'care');
  assert.equal(localCheck("I don't want to live anymore").action, 'care');
  assert.equal(localCheck('I don’t want to live anymore').action, 'care');
  assert.equal(localCheck('send me nudes').action, 'block');
  assert.equal(localCheck('That goal last night killed me, unreal!').action, 'allow');
  assert.equal(localCheck('Who is the best striker?').action, 'allow');
  assert.equal(localCheck('أموت فيك يا أبو مكة').action, 'allow');
  assert.equal(localCheck('تكنيك ميسي رهيب').action, 'allow');
  assert.equal(localCheck('وش جنسيتك؟').action, 'allow');
  assert.equal(localCheck('ارسل صور عارية').action, 'block');
  assert.match(crisisMessage('en'), /help|support|crisis/i);
});

test('offline replies are honest about being an AI simulation', () => {
  for (const question of ['Are you the real Salah?', 'is this really you?', 'Are you an AI?']) {
    const reply = offlineReply({ character: salah, scenario: 'hangout', lang: 'en', userText: question, turn: 2 });
    assert.match(reply, /AI simulation|not the real/i, question);
  }
});

test('Stripe webhook signatures are verified with a timestamp tolerance', () => {
  const payload = Buffer.from('{"type":"ping"}');
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', 'whsec_x').update(`${t}.${payload.toString()}`).digest('hex');
  assert.ok(verifyStripeSignature(payload, `t=${t},v1=${sig}`, 'whsec_x'));
  assert.ok(!verifyStripeSignature(payload, `t=${t},v1=${sig}`, 'whsec_other'));
  assert.ok(!verifyStripeSignature(Buffer.from('{"type":"tampered"}'), `t=${t},v1=${sig}`, 'whsec_x'));
  const old = t - 3600;
  const oldSig = createHmac('sha256', 'whsec_x').update(`${old}.${payload.toString()}`).digest('hex');
  assert.ok(!verifyStripeSignature(payload, `t=${old},v1=${oldSig}`, 'whsec_x'));
});
