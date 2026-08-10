import { describe, it, expect } from 'vitest';
import {
  buildWatchSnapshotKey,
  normalizeWatchUrlForKey,
  WATCH_SNAPSHOT_KEY_SCHEMA
} from './watchSnapshotKey.js';

/*
 * ★このテストの役目(2026-08-11・会場の鏡が映らない件の根治):
 *   heavy read が `STALE_SNAPSHOT` で毎回捨てられ heavyEverSettled:false のまま
 *   だった真因は「同じ配信なのに供給元によって url 文字列が違い、鍵が動く」こと。
 *   ここでは【同じ配信なら鍵が同一になる】を実データ形状で固定する。
 */

describe('normalizeWatchUrlForKey', () => {
  it('クエリとハッシュを落とす(同じ配信の同じページを指すため)', () => {
    expect(normalizeWatchUrlForKey('https://live.nicovideo.jp/watch/lv1?ref=foo'))
      .toBe('https://live.nicovideo.jp/watch/lv1');
    expect(normalizeWatchUrlForKey('https://live.nicovideo.jp/watch/lv1#chat'))
      .toBe('https://live.nicovideo.jp/watch/lv1');
  });

  it('末尾スラッシュと大文字小文字を吸収する', () => {
    expect(normalizeWatchUrlForKey('https://live.nicovideo.jp/watch/lv1/'))
      .toBe('https://live.nicovideo.jp/watch/lv1');
    expect(normalizeWatchUrlForKey('HTTPS://LIVE.NICOVIDEO.JP/watch/LV1'))
      .toBe('https://live.nicovideo.jp/watch/lv1');
  });

  it('URL として壊れていても ?/# を落として正規化する(例外を投げない)', () => {
    expect(normalizeWatchUrlForKey('/watch/lv1?x=1')).toBe('/watch/lv1');
    expect(normalizeWatchUrlForKey('not a url #frag')).toBe('not a url');
  });

  it('空・null・undefined は空文字', () => {
    expect(normalizeWatchUrlForKey('')).toBe('');
    expect(normalizeWatchUrlForKey(null)).toBe('');
    expect(normalizeWatchUrlForKey(undefined)).toBe('');
  });
});

describe('buildWatchSnapshotKey', () => {
  /*
   * ★これが本丸。実機で起きていた組み合わせをそのまま置く:
   *   inlineParam は lv から組んだ正規形、activeTab はブラウザの実URL。
   *   旧実装 `${lv}|${url}|s17` では両者の鍵が【違って】いたため、
   *   heavy 完了時に watchMetaCache.key !== snapshotKey となり全件を捨てていた。
   */
  it('★同じ配信なら供給元が違っても鍵が同一(stale-snapshot の根治)', () => {
    const fromInlineParam = buildWatchSnapshotKey({
      liveId: 'lv351148095',
      url: 'https://live.nicovideo.jp/watch/lv351148095'
    });
    const fromActiveTab = buildWatchSnapshotKey({
      liveId: 'lv351148095',
      url: 'https://live.nicovideo.jp/watch/lv351148095?ref=share&_topic=live'
    });
    const fromStorageTrailingSlash = buildWatchSnapshotKey({
      liveId: 'lv351148095',
      url: 'https://live.nicovideo.jp/watch/lv351148095/#comment'
    });
    expect(fromInlineParam).toBe(fromActiveTab);
    expect(fromInlineParam).toBe(fromStorageTrailingSlash);
  });

  it('★url が空でも lv が同じなら鍵は同一(URL解決が遅れた瞬間に鍵が動かない)', () => {
    expect(buildWatchSnapshotKey({ liveId: 'lv1', url: '' }))
      .toBe(buildWatchSnapshotKey({ liveId: 'lv1', url: 'https://live.nicovideo.jp/watch/lv1' }));
  });

  it('別の配信なら鍵は必ず変わる(切替を取り違えない)', () => {
    const a = buildWatchSnapshotKey({ liveId: 'lv1', url: 'https://live.nicovideo.jp/watch/lv1' });
    const b = buildWatchSnapshotKey({ liveId: 'lv2', url: 'https://live.nicovideo.jp/watch/lv2' });
    expect(a).not.toBe(b);
  });

  it('lv の大文字/前後空白は吸収する(同じ配信として扱う)', () => {
    expect(buildWatchSnapshotKey({ liveId: '  LV1 ' }))
      .toBe(buildWatchSnapshotKey({ liveId: 'lv1' }));
  });

  it('lv が無いときは正規化 url で決める(watch 以外の取り違え防止)', () => {
    const p1 = buildWatchSnapshotKey({ liveId: '', url: 'https://example.com/a?x=1' });
    const p2 = buildWatchSnapshotKey({ liveId: '', url: 'https://example.com/a#h' });
    const p3 = buildWatchSnapshotKey({ liveId: '', url: 'https://example.com/b' });
    expect(p1).toBe(p2);
    expect(p1).not.toBe(p3);
  });

  it('スキーマ版が鍵に含まれる(旧鍵と混ざらない)', () => {
    expect(buildWatchSnapshotKey({ liveId: 'lv1' })).toContain(WATCH_SNAPSHOT_KEY_SCHEMA);
  });

  it('入力が壊れていても例外を投げない', () => {
    expect(() => buildWatchSnapshotKey(/** @type {any} */ (null))).not.toThrow();
    expect(() => buildWatchSnapshotKey(/** @type {any} */ (undefined))).not.toThrow();
    expect(() => buildWatchSnapshotKey(/** @type {any} */ ({ liveId: 123 }))).not.toThrow();
  });
});
