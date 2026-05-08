/** @vitest-environment happy-dom */
/**
 * v0.1.203 Patch 3: parseEmbeddedDataViewerInfo のテスト。
 * streamlink/yt-dlp と同じ embedded-data 経路から viewer ID を抽出する。
 */

import { describe, it, expect } from 'vitest';
import { parseEmbeddedDataViewerInfo } from './parseEmbeddedDataViewerInfo.js';

/**
 * @param {string|null} dataProps
 * @returns {Document}
 */
function buildDoc(dataProps) {
  const html =
    dataProps == null
      ? '<html><head></head><body></body></html>'
      : `<html><head><script id="embedded-data" data-props='${dataProps.replace(/'/g, "&apos;")}'></script></head><body></body></html>`;
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

describe('parseEmbeddedDataViewerInfo', () => {
  it('null / undefined → EMPTY_INFO', () => {
    const r = parseEmbeddedDataViewerInfo(null);
    expect(r.userId).toBe('');
    expect(r.isLoggedIn).toBe(false);
    expect(r.isBroadcaster).toBe(false);
  });

  it('embedded-data なし → EMPTY_INFO', () => {
    const doc = buildDoc(null);
    const r = parseEmbeddedDataViewerInfo(doc);
    expect(r.userId).toBe('');
    expect(r.isLoggedIn).toBe(false);
  });

  it('正規ログイン状態を抽出', () => {
    const doc = buildDoc(
      JSON.stringify({
        user: {
          id: '12345678',
          isLoggedIn: true,
          isBroadcaster: false,
          nickname: 'kimito'
        }
      })
    );
    const r = parseEmbeddedDataViewerInfo(doc);
    expect(r.userId).toBe('12345678');
    expect(r.isLoggedIn).toBe(true);
    expect(r.isBroadcaster).toBe(false);
    expect(r.nickname).toBe('kimito');
  });

  it('user.id が number でも文字列化', () => {
    const doc = buildDoc(
      JSON.stringify({ user: { id: 99887766, isLoggedIn: true } })
    );
    expect(parseEmbeddedDataViewerInfo(doc).userId).toBe('99887766');
  });

  it('未ログイン（isLoggedIn=false） → userId 空でも EMPTY 相当', () => {
    const doc = buildDoc(
      JSON.stringify({ user: { id: '', isLoggedIn: false } })
    );
    const r = parseEmbeddedDataViewerInfo(doc);
    expect(r.userId).toBe('');
    expect(r.isLoggedIn).toBe(false);
  });

  it('isBroadcaster=true（自分が配信者）', () => {
    const doc = buildDoc(
      JSON.stringify({
        user: { id: '143172392', isLoggedIn: true, isBroadcaster: true }
      })
    );
    expect(parseEmbeddedDataViewerInfo(doc).isBroadcaster).toBe(true);
  });

  it('壊れた JSON でも crash しない', () => {
    const html =
      '<html><head><script id="embedded-data" data-props=\'{"user":\'></script></head><body></body></html>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const r = parseEmbeddedDataViewerInfo(doc);
    expect(r.userId).toBe('');
    expect(r.isLoggedIn).toBe(false);
  });

  it('user フィールド欠落 → EMPTY_INFO', () => {
    const doc = buildDoc(JSON.stringify({ program: { id: 'lv123' } }));
    expect(parseEmbeddedDataViewerInfo(doc).userId).toBe('');
  });

  it('nickname は 80 文字まで切り詰め', () => {
    const longNick = 'a'.repeat(200);
    const doc = buildDoc(
      JSON.stringify({
        user: { id: '1', isLoggedIn: true, nickname: longNick }
      })
    );
    expect(parseEmbeddedDataViewerInfo(doc).nickname).toHaveLength(80);
  });
});
