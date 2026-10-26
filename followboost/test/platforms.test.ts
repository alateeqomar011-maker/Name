import { describe, expect, it } from 'vitest';
import { isReservedHandle, validateUsername } from '../src/lib/platforms';

describe('validateUsername', () => {
  it('accepts and normalizes plain handles', () => {
    expect(validateUsername('  @Nova.Creates ', 'instagram')).toEqual({ ok: true, value: 'nova.creates' });
    expect(validateUsername('gamer_01', 'twitch')).toEqual({ ok: true, value: 'gamer_01' });
  });

  it('keeps dotted usernames as usernames, not links', () => {
    expect(validateUsername('john.doe', 'instagram')).toEqual({ ok: true, value: 'john.doe' });
  });

  it('pulls the username out of profile links', () => {
    expect(validateUsername('https://www.instagram.com/nova.creates/?hl=en', 'instagram')).toEqual({ ok: true, value: 'nova.creates' });
    expect(validateUsername('tiktok.com/@dance.daily', 'tiktok')).toEqual({ ok: true, value: 'dance.daily' });
    expect(validateUsername('https://youtube.com/@MyChannel', 'youtube')).toEqual({ ok: true, value: 'mychannel' });
    expect(validateUsername('https://www.youtube.com/c/OldChannel', 'youtube')).toEqual({ ok: true, value: 'oldchannel' });
    expect(validateUsername('https://twitter.com/someone', 'x')).toEqual({ ok: true, value: 'someone' });
  });

  it('rejects links to the wrong platform', () => {
    const r = validateUsername('https://tiktok.com/@someone', 'instagram');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/isn't from Instagram/);
  });

  it('refuses anything that looks like a password or an email', () => {
    for (const input of ['me:hunter2', 'password=abc', 'my password is 123']) {
      const r = validateUsername(input, 'instagram');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/password/);
    }
    const email = validateUsername('me@example.com', 'instagram');
    expect(email.ok).toBe(false);
    if (!email.ok) expect(email.error).toMatch(/email/);
  });

  it('enforces each platform format', () => {
    expect(validateUsername('', 'instagram')).toMatchObject({ ok: false, error: 'Enter a username to continue.' });
    expect(validateUsername('two words', 'instagram')).toMatchObject({ ok: false, error: "Usernames can't contain spaces." });
    expect(validateUsername('.edge', 'instagram')).toMatchObject({ ok: false });
    expect(validateUsername('a..b', 'instagram')).toMatchObject({ ok: false });
    expect(validateUsername('ends.', 'tiktok')).toMatchObject({ ok: false });
    expect(validateUsername('a', 'tiktok')).toMatchObject({ ok: false, error: 'TikTok usernames are 2–24 characters long.' });
    expect(validateUsername('sixteen_chars_xx', 'x')).toMatchObject({ ok: false, error: 'X usernames are up to 15 characters long.' });
    expect(validateUsername('has-hyphen', 'x')).toMatchObject({ ok: false });
    expect(validateUsername('has-hyphen', 'youtube')).toEqual({ ok: true, value: 'has-hyphen' });
    expect(validateUsername('_lead', 'twitch')).toMatchObject({ ok: false });
    expect(validateUsername('shrt', 'facebook')).toMatchObject({ ok: false });
  });

  it('knows reserved handles', () => {
    expect(isReservedHandle('Admin')).toBe(true);
    expect(isReservedHandle('instagram')).toBe(true);
    expect(isReservedHandle('nova.creates')).toBe(false);
  });
});
