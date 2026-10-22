import { describe, expect, it } from 'vitest';
import {
  buildPhonePostUrl,
  classifyRelayError,
  findSeenPhonePosts,
  normalizePostText,
  parsePhonePostState,
  phonePostConnectionBand,
  phonePostFailureText,
  phonePostMark,
  phonePostPullDelayMs,
  phonePostRateVerdict,
  readPostKeyFromHash
} from './phonePost.js';

const PK = 'a'.repeat(43);

describe('phonePost: スマホからのコメント(v0.1.1734)', () => {
  it('本文: 前後の空白を落とす・空/251字以上/制御文字は送らない(切り詰めない)', () => {
    expect(normalizePostText('  わこつ  ')).toBe('わこつ');
    expect(normalizePostText('   ')).toBe('');
    expect(normalizePostText('あ'.repeat(250))).toBe('あ'.repeat(250));
    expect(normalizePostText('あ'.repeat(251))).toBe('');
    expect(normalizePostText('a\u0007b')).toBe('');
    expect(normalizePostText(123)).toBe('');
  });

  it('★印: 「届いた(✓✓)」は放送に流れたのを確認したときだけ。PCが投稿しただけでは ✓', () => {
    const now = 100_000;
    expect(phonePostMark({ state: 'queued', at: now }, now).mark).toBe('⏱');
    expect(phonePostMark({ state: 'sent', at: now }, now)).toEqual({ mark: '✓', label: 'PCが投稿した', done: false });
    expect(phonePostMark({ state: 'sent', seen: true, at: now }, now)).toEqual({ mark: '✓✓', label: '届いた', done: true });
    expect(phonePostMark({ state: 'failed', at: now }, now).mark).toBe('⚠');
    // ✓ のまま90秒(放送の記録を切っている等)=✓ のまま行き着いた扱い(照会をやめる)
    expect(phonePostMark({ state: 'sent', at: 0 }, 91_000)).toEqual({ mark: '✓', label: 'PCが投稿した', done: true });
    // 預けたまま1分以上=PC が来ない=届かなかった
    expect(phonePostMark({ state: 'queued', at: 0 }, 70_000).mark).toBe('⚠');
  });

  it('★接続の帯: 鍵が無い/確認中/PCが30秒以内に来ている/来ていない/通信できない、を打つ前に見せる', () => {
    expect(phonePostConnectionBand({ hasKey: false, nowMs: 0 })).toMatchObject({ level: 'off', canSend: false });
    expect(phonePostConnectionBand({ hasKey: true, nowMs: 0 })).toMatchObject({ level: 'checking', canSend: false });
    expect(phonePostConnectionBand({ hasKey: true, checked: true, pcSeenAt: 90_000, nowMs: 100_000 })).toMatchObject({ level: 'ok', canSend: true });
    expect(phonePostConnectionBand({ hasKey: true, checked: true, pcSeenAt: 10_000, nowMs: 100_000 })).toMatchObject({ level: 'down', canSend: false });
    expect(phonePostConnectionBand({ hasKey: true, checked: true, pcSeenAt: 0, nowMs: 100_000 }).level).toBe('down');
    expect(phonePostConnectionBand({ hasKey: true, networkError: true, nowMs: 0 })).toMatchObject({ level: 'network', canSend: false });
  });

  it('★放送に流れたかの照合: 送った10秒前以降に同じ本文があれば流れた(空白の違いは無視・ギフトは見ない)', () => {
    const posts = [
      { id: 'p1', text: 'わこつ', at: 100_000 },
      { id: 'p2', text: 'かわいい  ね', at: 100_000 },
      { id: 'p3', text: 'まだ', at: 100_000 },
      { id: 'p4', text: '昔の', at: 100_000 }
    ];
    const rows = [
      { at: 101_000, text: 'わこつ', kind: 'comment' },
      { at: 95_000, text: 'かわいい ね' },
      { at: 50_000, text: '昔の', kind: 'comment' },
      { at: 102_000, text: 'まだ', kind: 'gift' }
    ];
    expect([...findSeenPhonePosts(posts, rows)].sort()).toEqual(['p1', 'p2']);
    expect(findSeenPhonePosts([], rows).size).toBe(0);
    expect(findSeenPhonePosts(posts, null).size).toBe(0);
  });

  it('回数制限: 20秒8件・1日1000件', () => {
    expect(phonePostRateVerdict({ windowCount: 8, dailyCount: 8 }).allow).toBe(true);
    expect(phonePostRateVerdict({ windowCount: 9, dailyCount: 9 }).reason).toBe('too_fast');
    expect(phonePostRateVerdict({ windowCount: 1, dailyCount: 1001 }).reason).toBe('daily_limit');
  });

  it('状態の読み取りと失敗理由: 知らない理由は unknown に丸める・文言は次の一手まで書く', () => {
    expect(parsePhonePostState('sent')).toEqual({ state: 'sent', reason: '' });
    expect(parsePhonePostState('failed:no_tab')).toEqual({ state: 'failed', reason: 'no_tab' });
    expect(parsePhonePostState('failed:<script>')).toEqual({ state: 'failed', reason: 'unknown' });
    expect(parsePhonePostState('x')).toBeNull();
    expect(phonePostFailureText('no_tab')).toContain('PCでこの放送のタブが開いていません');
    expect(classifyRelayError('watchタブが見つかりません。放送タブを開いてから送信してください。')).toBe('no_tab');
    expect(classifyRelayError('コメント送信に失敗しました。')).toBe('post_failed');
  });

  it('URL: 鍵はフラグメント(#pk=)に載せる=サーバーへ送られない。読むときは形を検査する', () => {
    expect(buildPhonePostUrl('https://app.example/live-view?v=tok12345', PK)).toBe(`https://app.example/live-view?v=tok12345#pk=${PK}`);
    expect(buildPhonePostUrl('https://app.example/live-view?v=tok12345#old', PK)).toBe(`https://app.example/live-view?v=tok12345#pk=${PK}`);
    expect(buildPhonePostUrl('https://app.example/live-view', 'short')).toBe('');
    expect(readPostKeyFromHash(`#pk=${PK}`)).toBe(PK);
    expect(readPostKeyFromHash('#pk=bad')).toBe('');
    expect(readPostKeyFromHash('')).toBe('');
  });

  it('PC の取りに行く間隔: ふだん10秒・入力中/取れた直後は2秒', () => {
    expect(phonePostPullDelayMs({})).toBe(10_000);
    expect(phonePostPullDelayMs({ active: true })).toBe(2_000);
    expect(phonePostPullDelayMs({ hadItems: true })).toBe(2_000);
  });
});
