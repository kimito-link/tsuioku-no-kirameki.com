import { describe, it, expect } from 'vitest';
import { parseTwStreamInfo, parseTwUsersIcons, safeTwImageUrl, buildTwUsersIconQuery, buildTwStreamInfoQuery } from './twGql.js';
import { buildTwStreamKey, isTwStreamKey, twLoginOfStreamKey, twChannelUrlOfStreamKey } from './twStreamKey.js';

describe('twGql', () => {
  it('配信中の応答を読む', () => {
    const r = parseTwStreamInfo({
      data: { user: { id: '713936733', login: 'Kimito_Link', displayName: 'きみとりんく', profileImageURL: 'https://static-cdn.jtvnw.net/jtv_user_pictures/x-70x70.png', broadcastSettings: { title: '雑談' }, stream: { id: '41234567890', createdAt: '2026-11-07T10:00:00Z', viewersCount: 15 } } },
    });
    expect(r).toMatchObject({ login: 'kimito_link', live: true, streamId: '41234567890', viewers: 15, title: '雑談', userId: '713936733' });
    expect(r?.startedAtMs).toBe(Date.parse('2026-11-07T10:00:00Z'));
  });
  it('配信していない・形が違う', () => {
    expect(parseTwStreamInfo({ data: { user: { login: 'a_b_c', stream: null } } })).toMatchObject({ live: false, streamId: '' });
    expect(parseTwStreamInfo({ data: { user: null } })).toBeNull();
    expect(parseTwStreamInfo({ errors: [{ message: 'x' }] })).toBeNull();
    expect(parseTwStreamInfo(null)).toBeNull();
  });
  it('顔の一覧(退会=null・既定画像は外す)', () => {
    const m = parseTwUsersIcons({ data: { users: [
      { login: 'aaa', profileImageURL: 'https://static-cdn.jtvnw.net/jtv_user_pictures/a-70x70.png' },
      null,
      { login: 'bbb', profileImageURL: 'https://static-cdn.jtvnw.net/user-default-pictures-uv/x-70x70.png' },
      { login: 'ccc', profileImageURL: 'https://evil.example/a.png' },
    ] } });
    expect([...m.keys()]).toEqual(['aaa']);
    expect(safeTwImageUrl('javascript:alert(1)')).toBe('');
  });
  it('問い合わせ文は login を英数字に限る(差し込み防止)', () => {
    expect(buildTwStreamInfoQuery('a"){x}').query).toContain('user(login:"ax")');
    expect(buildTwUsersIconQuery(['AAA', 'aaa', 'b"c', 'ok_1']).logins).toEqual(['aaa', 'ok_1']);
  });
});

describe('twStreamKey', () => {
  it('配信番号があればそれ', () => {
    const k = buildTwStreamKey('Kimito_Link', { streamId: '41234567890' });
    expect(k).toBe('tw.kimito_link.41234567890');
    expect(isTwStreamKey(k)).toBe(true);
    expect(twLoginOfStreamKey(k)).toBe('kimito_link');
    expect(twChannelUrlOfStreamKey(k)).toBe('https://www.twitch.tv/kimito_link');
  });
  it('番号が無ければ開始の時間帯', () => {
    const k = buildTwStreamKey('abcd', { startedAtMs: Date.parse('2026-11-07T10:30:00Z') });
    expect(k).toBe('tw.abcd.d2026110719');
    expect(isTwStreamKey(k)).toBe(true);
  });
  it('YouTube の videoId は Twitch のキーではない', () => {
    expect(isTwStreamKey('dQw4w9WgXcQ')).toBe(false);
    expect(twLoginOfStreamKey('dQw4w9WgXcQ')).toBe('');
    expect(buildTwStreamKey('a b')).toBe('');
  });
});
