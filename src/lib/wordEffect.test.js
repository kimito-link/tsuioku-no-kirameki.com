import { describe, expect, it } from 'vitest';
import {
  KEY_WORD_EFFECT,
  WORD_EFFECT_BURST_SKIP,
  WORD_EFFECT_MAX_CONCURRENT,
  WORD_EFFECT_SCHEMA_VERSION,
  advanceWordEffectWatch,
  applyWordEffectIngest,
  buildWordEffectIngestMessage,
  createWordEffectWatchState,
  defaultWordEffectSettings,
  liveIdFromWordEffectStorageKey,
  matchWordEffectRule,
  normalizeWordEffectSettings,
  readWordEffectSettings,
  sanitizeWordEffectImageUrl,
  wordEffectEventsFromRows,
  wordEffectKindFromStorageKey,
  wordEffectServiceOf,
  writeWordEffectSettings
} from './wordEffect.js';

const wordRule = {
  id: 'w1',
  trigger: 'word',
  word: '888',
  effect: 'pop',
  emoji: '✨',
  imageUrl: '',
  count: 1,
  cooldownMs: 3000
};

function settings(overrides = {}) {
  return normalizeWordEffectSettings({
    schemaVersion: 1,
    enabled: true,
    maxConcurrent: 4,
    rules: [wordRule],
    ...overrides
  });
}

describe('wordEffect の保存形', () => {
  it('キーは版付きで、既定はオフ', () => {
    expect(KEY_WORD_EFFECT).toBe('nls_word_effect_v1');
    expect(defaultWordEffectSettings()).toEqual({
      schemaVersion: WORD_EFFECT_SCHEMA_VERSION,
      enabled: false,
      maxConcurrent: 4,
      rules: []
    });
  });

  it('壊れた値は既定に戻し、同時数と言葉数を上限で切る', () => {
    const raw = {
      enabled: true,
      maxConcurrent: 99,
      rules: Array.from({ length: 20 }, (_, i) => ({
        id: `r${i}`,
        trigger: 'word',
        word: 'あ'.repeat(40),
        effect: 'fall',
        emoji: '🎉'.repeat(10),
        imageUrl: 'javascript:alert(1)',
        count: 30,
        cooldownMs: 10
      }))
    };
    const out = normalizeWordEffectSettings(raw);
    expect(out.rules).toHaveLength(12);
    expect(out.maxConcurrent).toBe(WORD_EFFECT_MAX_CONCURRENT);
    expect(out.rules[0].word).toHaveLength(24);
    expect(Array.from(out.rules[0].emoji)).toHaveLength(8);
    expect(out.rules[0].imageUrl).toBe('');
    expect(out.rules[0].count).toBe(5);
    expect(out.rules[0].cooldownMs).toBe(1500);
    expect(out.rules[0].effect).toBe('fall');
  });

  it('ポンは常に1個で、画像は https だけ', () => {
    const out = normalizeWordEffectSettings({
      enabled: true,
      rules: [{ id: 'pop1', trigger: 'word', word: 'わこつ', effect: 'pop', count: 5, imageUrl: 'https://example.com/a.png' }]
    });
    expect(out.rules[0].count).toBe(1);
    expect(out.rules[0].imageUrl).toBe('https://example.com/a.png');
    expect(sanitizeWordEffectImageUrl('http://example.com/a.png')).toBe('');
    expect(sanitizeWordEffectImageUrl('https://user:pw@example.com/a.png')).toBe('');
  });

  it('新しい版の保存は上書きしない', () => {
    const newer = { schemaVersion: 2, enabled: true, rules: [{ word: '残す' }] };
    const read = readWordEffectSettings(newer);
    expect(read.locked).toBe(true);
    expect(read.settings.enabled).toBe(false);
    const write = writeWordEffectSettings(newer, { enabled: true, rules: [] });
    expect(write.ok).toBe(false);
    expect(write.value).toBe(newer);
  });

  it('同じ版は正規化して書ける', () => {
    const write = writeWordEffectSettings({ schemaVersion: 1, enabled: false }, {
      enabled: true,
      rules: [{ id: 'gift1', trigger: 'gift', word: '', effect: 'fall', emoji: '🎁' }]
    });
    expect(write.ok).toBe(true);
    expect(write.value.enabled).toBe(true);
    expect(write.value.rules[0].trigger).toBe('gift');
    expect(write.value.rules[0].count).toBe(4);
  });
});

describe('wordEffect の発火', () => {
  it('コメントの言葉は部分一致で、空の言葉は一致しない', () => {
    const s = settings();
    expect(matchWordEffectRule(s, 'comment', { key: 'a', text: '8888', itemName: '' })?.id).toBe('w1');
    expect(matchWordEffectRule(s, 'comment', { key: 'a', text: 'こんにちは', itemName: '' })).toBe(null);
    const empty = settings({ rules: [{ ...wordRule, word: '' }] });
    expect(matchWordEffectRule(empty, 'comment', { key: 'a', text: 'なんでも', itemName: '' })).toBe(null);
  });

  it('大文字小文字を無視し、ギフトは品名が空ならどれでも', () => {
    const s = settings({
      rules: [
        { id: 'any', trigger: 'gift', word: '', effect: 'pop', emoji: '🎁' },
        { id: 'mega', trigger: 'gift', word: 'メガホン', effect: 'fall', emoji: '📣' }
      ]
    });
    expect(matchWordEffectRule(s, 'gift', { key: 'g', text: '', itemName: '応援メガホン' })?.id).toBe('mega');
    expect(matchWordEffectRule(s, 'gift', { key: 'g', text: '', itemName: '花' })?.id).toBe('any');
    expect(matchWordEffectRule(s, 'comment', { key: 'c', text: 'Mega', itemName: '' })).toBe(null);
    const ascii = settings({ rules: [{ ...wordRule, word: 'GG' }] });
    expect(matchWordEffectRule(ascii, 'comment', { key: 'c', text: 'ggです', itemName: '' })?.id).toBe('w1');
  });

  it('最初のスナップショットでは出さず、次の1件で出す', () => {
    const s = settings();
    const state = createWordEffectWatchState();
    const first = advanceWordEffectWatch(
      s,
      wordEffectEventsFromRows([{ commentNo: '1', text: '888' }], 'comment'),
      'comment',
      state,
      1000,
      4,
      'lv1'
    );
    expect(first.fires).toEqual([]);
    expect(first.state.primed).toBe(true);
    const second = advanceWordEffectWatch(
      s,
      wordEffectEventsFromRows([
        { commentNo: '1', text: '888' },
        { commentNo: '2', text: '888 ありがとう' }
      ], 'comment'),
      'comment',
      first.state,
      2000,
      4,
      'lv1'
    );
    expect(second.fires).toHaveLength(1);
    expect(second.fires[0]).toHaveLength(1);
    expect(second.fires[0][0].effect).toBe('pop');
    expect(second.fires[0][0].emoji).toBe('✨');
  });

  it('同じ言葉は間隔のあいだ出さない', () => {
    const s = settings();
    let state = advanceWordEffectWatch(s, [], 'comment', createWordEffectWatchState(), 0, 4, 'lv1').state;
    state = advanceWordEffectWatch(
      s,
      wordEffectEventsFromRows([{ commentNo: '1', text: '888' }], 'comment'),
      'comment',
      state,
      1000,
      4,
      'lv1'
    ).state;
    const again = advanceWordEffectWatch(
      s,
      wordEffectEventsFromRows([
        { commentNo: '1', text: '888' },
        { commentNo: '2', text: '888' }
      ], 'comment'),
      'comment',
      state,
      2000,
      4,
      'lv1'
    );
    expect(again.fires).toEqual([]);
    const later = advanceWordEffectWatch(
      s,
      wordEffectEventsFromRows([
        { commentNo: '2', text: '888' },
        { commentNo: '3', text: '888' }
      ], 'comment'),
      'comment',
      again.state,
      1000 + 3000,
      4,
      'lv1'
    );
    expect(later.fires).toHaveLength(1);
  });

  it('オフのあいだは記憶だけ進めて、オンの次のコメントから出す', () => {
    const off = settings({ enabled: false });
    let state = createWordEffectWatchState();
    state = advanceWordEffectWatch(
      off,
      wordEffectEventsFromRows([{ commentNo: '1', text: '888' }], 'comment'),
      'comment',
      state,
      1000,
      4,
      'lv1'
    ).state;
    const still = advanceWordEffectWatch(
      off,
      wordEffectEventsFromRows([
        { commentNo: '1', text: '888' },
        { commentNo: '2', text: '888' }
      ], 'comment'),
      'comment',
      state,
      2000,
      4,
      'lv1'
    );
    expect(still.fires).toEqual([]);
    const on = advanceWordEffectWatch(
      settings(),
      wordEffectEventsFromRows([
        { commentNo: '2', text: '888' },
        { commentNo: '3', text: '888' }
      ], 'comment'),
      'comment',
      still.state,
      5000,
      4,
      'lv1'
    );
    expect(on.fires).toHaveLength(1);
  });

  it('一気に届いた塊は出さない', () => {
    const s = settings();
    const state = advanceWordEffectWatch(s, [], 'comment', createWordEffectWatchState(), 0, 4, 'lv1').state;
    const rows = Array.from({ length: WORD_EFFECT_BURST_SKIP }, (_, i) => ({ commentNo: String(i + 1), text: '888' }));
    const burst = advanceWordEffectWatch(s, wordEffectEventsFromRows(rows, 'comment'), 'comment', state, 1000, 8, 'lv1');
    expect(burst.fires).toEqual([]);
  });

  it('同時数の空きだけ出し、落ちる演出は複数個', () => {
    const s = settings({
      maxConcurrent: 3,
      rules: [{ id: 'fall1', trigger: 'word', word: '花', effect: 'fall', emoji: '🌸', count: 4, cooldownMs: 1500 }]
    });
    const state = advanceWordEffectWatch(s, [], 'comment', createWordEffectWatchState(), 0, 3, 'lv1').state;
    const fired = advanceWordEffectWatch(
      s,
      wordEffectEventsFromRows([{ commentNo: '9', text: '花です' }], 'comment'),
      'comment',
      state,
      1000,
      3,
      'lv1'
    );
    expect(fired.fires[0]).toHaveLength(3);
    expect(fired.fires[0].every((sp) => sp.effect === 'fall')).toBe(true);
    expect(new Set(fired.fires[0].map((sp) => sp.xPct)).size).toBeGreaterThan(1);
  });

  it('配信が変わったら出し直さず、記憶をリセットする', () => {
    const s = settings();
    const primed = advanceWordEffectWatch(
      s,
      wordEffectEventsFromRows([{ commentNo: '1', text: '888' }], 'comment'),
      'comment',
      createWordEffectWatchState(),
      1000,
      4,
      'lv1'
    );
    const next = advanceWordEffectWatch(
      s,
      wordEffectEventsFromRows([{ commentNo: '1', text: '888' }], 'comment'),
      'comment',
      primed.state,
      2000,
      4,
      'lv2'
    );
    expect(next.fires).toEqual([]);
    expect(next.state.activeLiveId).toBe('lv2');
    expect(next.state.primed).toBe(true);
  });

  it('保存キーから配信と種類を分ける', () => {
    expect(liveIdFromWordEffectStorageKey('nls_ctail_lv12')).toBe('');
    expect(wordEffectKindFromStorageKey('nls_ctail_lv12')).toBe('');
    expect(liveIdFromWordEffectStorageKey('nls_gift_events_lv12')).toBe('lv12');
    expect(wordEffectKindFromStorageKey('nls_gift_events_lv12')).toBe('gift');
    expect(liveIdFromWordEffectStorageKey('nls_comments_lv12')).toBe('');
  });
});

describe('言葉の演出は各サービスの取り込み口から出す', () => {
  const rule = {
    id: 'place',
    trigger: 'word',
    word: '長野どうですか',
    effect: 'pop',
    emoji: '✨',
    imageUrl: '',
    count: 1,
    cooldownMs: 1500
  };
  const enabled = { schemaVersion: 1, enabled: true, maxConcurrent: 4, rules: [rule] };
  /** @type {Array<[string, string, Record<string, string>, string]>} */
  const services = [
    ['niconico', 'lv351100897', { commentNo: '9001', text: '長野どうですか' }, ''],
    ['youtube', 'dQw4w9WgXcQ', { id: 'yt-1', text: '長野どうですか' }, 'www.youtube.com'],
    ['twitch', 'tw.streamer.99', { id: 'tw-1', text: '長野どうですか' }, 'www.twitch.tv'],
    ['kick', 'kk.streamer.99', { id: 'kk-1', text: '長野どうですか' }, 'kick.com'],
    ['abema', 'AbCdEfGhIjK', { id: 'ab-1', text: '長野どうですか' }, 'abema.tv'],
    ['whowatch', 'ww.12345.678', { id: 'ww-1', text: '長野どうですか' }, 'whowatch.tv'],
    ['showroom', 'sr.room1.99', { id: 'sr-1', text: '長野どうですか' }, 'www.showroom-live.com'],
    ['mixch', 'mx.42.99', { id: 'mx-1', text: '長野どうですか' }, 'mixch.tv'],
    ['tiktok', 'tt.liveuser.12345', { id: 'tt-1', text: '長野どうですか' }, 'www.tiktok.com']
  ];
  for (const [service, liveId, row, host] of services) {
    it(`${service} の新しいコメントで出る。テールキーは要らない`, () => {
      expect(wordEffectServiceOf(liveId, host)).toBe(service);
      const msg = buildWordEffectIngestMessage(liveId, [row], 'comment', 'live', host);
      expect(msg).not.toBeNull();
      expect(JSON.stringify(msg)).not.toContain('nls_ctail_');
      const fired = applyWordEffectIngest(enabled, msg, createWordEffectWatchState(), 1000, 4);
      expect(fired.service).toBe(service);
      expect(fired.fires).toHaveLength(1);
      expect(fired.fires[0][0].emoji).toBe('✨');
      const again = applyWordEffectIngest(enabled, msg, fired.state, 5000, 4);
      expect(again.fires).toEqual([]);
    });
  }

  it('過去ログと、8件以上の塊は出さない', () => {
    const row = { id: 'x', text: '長野どうですか' };
    expect(buildWordEffectIngestMessage('dQw4w9WgXcQ', [row], 'comment', 'backfill')).toBeNull();
    expect(buildWordEffectIngestMessage('lv1', [row], 'comment', 'deep')).toBeNull();
    const many = Array.from({ length: WORD_EFFECT_BURST_SKIP }, (_, i) => ({ id: `n${i}`, text: '長野どうですか' }));
    expect(buildWordEffectIngestMessage('lv1', many, 'comment', 'live')).toBeNull();
  });

  it('オフのあいだは出さない', () => {
    const msg = buildWordEffectIngestMessage('lv1', [{ commentNo: '1', text: '長野どうですか' }], 'comment', 'ndgr');
    const off = applyWordEffectIngest(
      { schemaVersion: 1, enabled: false, maxConcurrent: 4, rules: [rule] },
      msg,
      createWordEffectWatchState(),
      1000,
      4
    );
    expect(off.fires).toEqual([]);
  });
});
