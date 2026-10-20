import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 2026-10-16: 起動の読み出しの予算化(v0.1.1630)の配線の固定。
 *   記憶(storageKeyMemo)が働くのは popup-entry.js の読み出し側で「記憶が新しければ get しない」と書かれているから。
 *   ここが元の毎回 get に戻ると、画面は同じに見えたまま起動の約12MBの読み直し(稼働率 約+21ポイント)が静かに復活する。
 */
const popup = fs.readFileSync(path.resolve('src/extension/popup-entry.js'), 'utf8').split('\r\n').join('\n');

describe('popup-entry: 巨大なキーの読み直しをやめる(記憶)', () => {
  it('★onChanged で両方の記憶を更新する listener が、モジュール読み込み時に登録される', () => {
    const at = popup.indexOf('const _profileCacheMemo = createStorageKeyMemo(KEY_USER_COMMENT_PROFILE_CACHE);');
    expect(at).toBeGreaterThan(0);
    const body = popup.slice(at, at + 900);
    expect(body).toContain('const _calibrationRingMemo = createStorageKeyMemo(KEY_CONCURRENT_CALIBRATION_RING_V1);');
    expect(body).toContain('_profileCacheMemo.onChanged(changes, area, now);');
    expect(body).toContain('_calibrationRingMemo.onChanged(changes, area, now);');
  });
  it('★軽い読み(12〜14回の犯人): 記憶が新しければプロフィール cache を get のキーから外し、読んだら記憶し、記憶の値を lightData へ渡す', () => {
    const at = popup.indexOf('const _profFresh = _profileCacheMemo.isFresh(Date.now());');
    expect(at).toBeGreaterThan(0);
    const body = popup.slice(at, at + 1500);
    expect(body).toContain('...(_profFresh ? [] : [KEY_USER_COMMENT_PROFILE_CACHE]),');
    expect(body).toContain('if (!_profFresh) _profileCacheMemo.absorbBag(lightData, _profV0, Date.now());');
    expect(body).toContain('(lightData)[KEY_USER_COMMENT_PROFILE_CACHE] = _profileCacheMemo.get();');
    // 読み出しの【前】に version を取る(読み出し中の onChanged を古い結果で上書きしないため)
    const v0At = body.indexOf('const _profV0 = _profileCacheMemo.version();');
    expect(v0At).toBeGreaterThan(-1); // 見つからない(-1)ままの比較で通らないように
    expect(v0At).toBeLessThan(body.indexOf('const lightData = await'));
  });
  it('★後続の処理(従来どおり lightData のコピー data を読む)が壊れていない', () => {
    expect(popup).toContain('const data = { ...lightData };');
    expect(popup).toContain('normalizeUserCommentProfileMap(\n    data[KEY_USER_COMMENT_PROFILE_CACHE]\n  );');
  });
  it('★deferred hydrate と、空のときのフォールバック(timeline)は、記憶経由(readUserCommentProfileCacheRaw)で読む', () => {
    expect(popup).toContain('const profRaw = await readUserCommentProfileCacheRaw(() =>');
    expect(popup).toContain('timelineProfileMap = normalizeUserCommentProfileMap(await readUserCommentProfileCacheRaw());');
    // v0.1.1712: 3つ目(メディアキットの応援者辞書)はメディアキット統合で popup から無くなった(2か所に減った)。
  });
  it('★readUserCommentProfileCacheRaw: 新しければ get しない・読んだら記憶・記憶のほうが新しければそちらを返す', () => {
    const at = popup.indexOf('async function readUserCommentProfileCacheRaw(readBag) {');
    expect(at).toBeGreaterThan(0);
    const body = popup.slice(at, at + 800);
    expect(body).toContain('if (_profileCacheMemo.isFresh(Date.now())) return _profileCacheMemo.get();');
    expect(body).toContain('_profileCacheMemo.absorbBag(bag, v0, Date.now());');
    expect(body).toContain('return _profileCacheMemo.isLoaded() ? _profileCacheMemo.get() : bag?.[KEY_USER_COMMENT_PROFILE_CACHE];');
  });
  it('★較正の記録(820KB): 記憶が新しければ get のキーから外す・記録が変わったときだけ再計算する', () => {
    const at = popup.indexOf('async function refreshAutopatrolStatusLine() {');
    expect(at).toBeGreaterThan(0);
    const body = popup.slice(at, at + 2200);
    expect(body).toContain('...(_ringFresh ? [] : [KEY_CONCURRENT_CALIBRATION_RING_V1])');
    expect(body).toContain('if (!_ringFresh) _calibrationRingMemo.absorbBag(bag, _ringV0, Date.now());');
    expect(body).toContain('if (_calibrationFitVersion !== _calibrationRingMemo.version()) {');
    expect(body).toContain('_calibrationFitVersion = _calibrationRingMemo.version();');
    const r0At = body.indexOf('const _ringV0 = _calibrationRingMemo.version();');
    expect(r0At).toBeGreaterThan(-1);
    expect(r0At).toBeLessThan(body.indexOf('const bag = await chrome.storage.local.get(['));
  });
});
