import { describe, it, expect } from 'vitest';
import { buildStatusShareUrls } from './statusShareUrls.js';

const ORIGIN = 'https://app.tsuioku-no-kirameki.com';
const TOKEN = 'YSa4FNwL4iG4FjVpgA7rFWG4sMBVjgGZ';

describe('buildStatusShareUrls', () => {
  it('元の uploadStatusSnapshot と同一の URL を組む(characterization)', () => {
    const { statusUrl, liveViewUrl, ingestUrl } = buildStatusShareUrls(ORIGIN, TOKEN);
    // status-entry.js の元コードと完全一致であること。
    expect(statusUrl).toBe(`${ORIGIN}/?v=${encodeURIComponent(TOKEN)}`);
    expect(liveViewUrl).toBe(`${ORIGIN}/live-view?v=${encodeURIComponent(TOKEN)}`);
    expect(ingestUrl).toBe(`${ORIGIN}/api/status`);
  });

  it('閲覧トークンを encodeURIComponent する(特殊文字を URL 安全に)', () => {
    const { statusUrl, liveViewUrl } = buildStatusShareUrls(ORIGIN, 'a b/c?d=e');
    const enc = encodeURIComponent('a b/c?d=e');
    expect(statusUrl).toBe(`${ORIGIN}/?v=${enc}`);
    expect(liveViewUrl).toBe(`${ORIGIN}/live-view?v=${enc}`);
    expect(statusUrl).not.toContain(' '); // 生のスペースが混ざらない
  });

  it('appOrigin 末尾スラッシュを 1 つに正規化(二重スラッシュを作らない)', () => {
    const a = buildStatusShareUrls('https://x.example.com/', TOKEN);
    const b = buildStatusShareUrls('https://x.example.com', TOKEN);
    expect(a.statusUrl).toBe(b.statusUrl);
    expect(a.ingestUrl).toBe('https://x.example.com/api/status');
    expect(a.statusUrl).not.toContain('com//'); // 二重スラッシュ無し
  });

  // ネガティブコントロール: 退化(固定文字列を返す/トークンを無視する)を検知する。
  it('ネガコン: 異なるトークンは異なる URL になる(固定値退化を検知)', () => {
    const x = buildStatusShareUrls(ORIGIN, 'tokenAAA');
    const y = buildStatusShareUrls(ORIGIN, 'tokenBBB');
    expect(x.statusUrl).not.toBe(y.statusUrl);
    expect(x.liveViewUrl).not.toBe(y.liveViewUrl);
  });

  it('ネガコン: statusUrl と liveViewUrl は別パス(取り違え退化を検知)', () => {
    const { statusUrl, liveViewUrl } = buildStatusShareUrls(ORIGIN, TOKEN);
    expect(statusUrl).not.toBe(liveViewUrl);
    expect(liveViewUrl).toContain('/live-view?v=');
    expect(statusUrl).not.toContain('/live-view');
  });

  it('null/undefined を渡しても投げない(空トークン扱い)', () => {
    const r = buildStatusShareUrls(ORIGIN, undefined);
    expect(r.statusUrl).toBe(`${ORIGIN}/?v=`);
    expect(() => buildStatusShareUrls(undefined, undefined)).not.toThrow();
  });
});
