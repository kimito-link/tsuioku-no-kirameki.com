/**
 * watchSnapshotPartialMerge のテスト。
 *
 * 0.1.41 (W): 配信者タイル「出たと思ったら消える」事象の修正。
 *
 * 背景:
 *   popup-entry.js は 10〜30 秒ごとに `requestWatchPageSnapshotFromOpenTab` を
 *   呼んで watchMetaCache.snapshot を上書きしていた。content-entry.js の
 *   `collectWatchPageSnapshot` は `embedded-data` から broadcaster 系を引くが、
 *   niconico SPA は時間経過で `#embedded-data` 要素を書き換える/一瞬消す
 *   ことがあり、運悪く polling がそのタイミングに当たると broadcaster
 *   フィールドがすべて空文字の snapshot が返る。
 *
 *   旧コードは無条件で `watchMetaCache.snapshot = snapResult.snapshot` で
 *   上書きしていたため、空に上書きされ → `resolveBroadcasterFollowTarget`
 *   が kind=none → タイルが消える、という現象が発生。
 *
 *   このヘルパは「新 snapshot で broadcaster 系が空、かつ旧 snapshot に
 *   値が入っている」場合に旧値を保つ partial-merge。新 snapshot が確実な
 *   フィールド（liveId, viewerCount 等）はそのまま新値で上書きする。
 *
 *   保護対象: broadcasterName, broadcasterPageUrl, broadcasterIconUrl,
 *            broadcasterUserId, broadcasterLevel
 */

import { describe, it, expect } from 'vitest';
import { mergeWatchSnapshotPreservingBroadcaster } from './watchSnapshotPartialMerge.js';

describe('mergeWatchSnapshotPreservingBroadcaster', () => {
  it('next の broadcasterName が空、prev に値あり → prev の値を保つ', () => {
    const prev = {
      broadcasterName: 'ᖇio',
      broadcasterPageUrl: 'https://www.nicovideo.jp/user/143899079',
      broadcasterIconUrl: 'https://example.com/icon.jpg',
      broadcasterUserId: '143899079',
      broadcasterLevel: 32,
      viewerCountFromDom: 100
    };
    const next = {
      broadcasterName: '',
      broadcasterPageUrl: '',
      broadcasterIconUrl: '',
      broadcasterUserId: '',
      broadcasterLevel: null,
      viewerCountFromDom: 105
    };
    const merged = mergeWatchSnapshotPreservingBroadcaster(prev, next);
    expect(merged.broadcasterName).toBe('ᖇio');
    expect(merged.broadcasterPageUrl).toBe('https://www.nicovideo.jp/user/143899079');
    expect(merged.broadcasterIconUrl).toBe('https://example.com/icon.jpg');
    expect(merged.broadcasterUserId).toBe('143899079');
    expect(merged.broadcasterLevel).toBe(32);
    // 配信者以外のフィールドは next で上書き
    expect(merged.viewerCountFromDom).toBe(105);
  });

  it('next の broadcasterName が値あり → next の値で上書き（変更を反映）', () => {
    const prev = {
      broadcasterName: 'old name',
      broadcasterPageUrl: 'https://old.example.com',
      broadcasterIconUrl: 'https://old.example.com/icon.jpg',
      broadcasterUserId: '111',
      broadcasterLevel: 1
    };
    const next = {
      broadcasterName: 'new name',
      broadcasterPageUrl: 'https://new.example.com',
      broadcasterIconUrl: 'https://new.example.com/icon.jpg',
      broadcasterUserId: '999',
      broadcasterLevel: 99
    };
    const merged = mergeWatchSnapshotPreservingBroadcaster(prev, next);
    expect(merged.broadcasterName).toBe('new name');
    expect(merged.broadcasterPageUrl).toBe('https://new.example.com');
    expect(merged.broadcasterIconUrl).toBe('https://new.example.com/icon.jpg');
    expect(merged.broadcasterUserId).toBe('999');
    expect(merged.broadcasterLevel).toBe(99);
  });

  it('prev が null → next をそのまま返す', () => {
    const next = {
      broadcasterName: 'new',
      viewerCountFromDom: 50
    };
    const merged = mergeWatchSnapshotPreservingBroadcaster(null, next);
    expect(merged).toEqual(next);
  });

  it('next が null → null を返す（snapshot 自体が無いケースは保護しない）', () => {
    const prev = { broadcasterName: 'old' };
    const merged = mergeWatchSnapshotPreservingBroadcaster(prev, null);
    expect(merged).toBeNull();
  });

  it('prev も next も null → null', () => {
    expect(mergeWatchSnapshotPreservingBroadcaster(null, null)).toBeNull();
  });

  it('next の broadcasterPageUrl だけ空、name は値あり → pageUrl は prev、他は next', () => {
    const prev = {
      broadcasterName: 'old',
      broadcasterPageUrl: 'https://old.example.com',
      broadcasterIconUrl: 'https://old.example.com/icon.jpg'
    };
    const next = {
      broadcasterName: 'new',
      broadcasterPageUrl: '',
      broadcasterIconUrl: 'https://new.example.com/icon.jpg'
    };
    const merged = mergeWatchSnapshotPreservingBroadcaster(prev, next);
    expect(merged.broadcasterName).toBe('new');
    expect(merged.broadcasterPageUrl).toBe('https://old.example.com');
    expect(merged.broadcasterIconUrl).toBe('https://new.example.com/icon.jpg');
  });

  it('broadcasterLevel: next が null かつ prev に数値 → prev を保つ', () => {
    const prev = { broadcasterName: 'a', broadcasterLevel: 32 };
    const next = { broadcasterName: 'a', broadcasterLevel: null };
    const merged = mergeWatchSnapshotPreservingBroadcaster(prev, next);
    expect(merged.broadcasterLevel).toBe(32);
  });

  it('broadcasterLevel: next が 0 でも数値なら next を採用（明示的なゼロは尊重）', () => {
    // ニコ生で level=0 はあり得ないが、API 仕様変更で出る可能性も考えて尊重する
    const prev = { broadcasterName: 'a', broadcasterLevel: 32 };
    const next = { broadcasterName: 'a', broadcasterLevel: 0 };
    const merged = mergeWatchSnapshotPreservingBroadcaster(prev, next);
    expect(merged.broadcasterLevel).toBe(0);
  });

  it('文字列フィールドが undefined（プロパティ自体無し） → 空扱いで prev 保護', () => {
    const prev = { broadcasterName: 'old', broadcasterPageUrl: 'https://old.example.com' };
    const next = {};  // broadcaster 系一切無し
    const merged = mergeWatchSnapshotPreservingBroadcaster(prev, next);
    expect(merged.broadcasterName).toBe('old');
    expect(merged.broadcasterPageUrl).toBe('https://old.example.com');
  });

  it('prev で空、next で値あり → next の値を採用（初回取得時の正常上書き）', () => {
    const prev = { broadcasterName: '', broadcasterPageUrl: '' };
    const next = { broadcasterName: 'first', broadcasterPageUrl: 'https://x.com' };
    const merged = mergeWatchSnapshotPreservingBroadcaster(prev, next);
    expect(merged.broadcasterName).toBe('first');
    expect(merged.broadcasterPageUrl).toBe('https://x.com');
  });

  it('viewer/comment 等の非 broadcaster フィールドは常に next で上書き', () => {
    const prev = {
      broadcasterName: 'name',
      viewerCountFromDom: 100,
      totalComments: 50,
      streamAgeMin: 10
    };
    const next = {
      broadcasterName: '',  // 空で来た
      viewerCountFromDom: 110,
      totalComments: 55,
      streamAgeMin: 11
    };
    const merged = mergeWatchSnapshotPreservingBroadcaster(prev, next);
    expect(merged.broadcasterName).toBe('name');  // 保護
    expect(merged.viewerCountFromDom).toBe(110);  // 最新値
    expect(merged.totalComments).toBe(55);
    expect(merged.streamAgeMin).toBe(11);
  });
});
