import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1386: 「推測URLだが実際に画像が出た」を記録する配線。
 *
 * ユーザー:「また会場モードのサムネがしろい 一体なんのため」
 *
 * 実態: uid から式で組んだサムネURLは **実在を確認していない**ため score=1 のままで、
 * 速報は「実サムネ0%」と言い続けていた。しかし実測では推測URLの多くが実在した
 * (2026-08-13・curl で5件中3件が HTTP 200)。
 *
 * ★直し方の肝: **追加の通信をしない**。
 *   画面は既にその URL で <img> を描いており、成功/失敗は onload/onerror で分かっている。
 *   その「既に起きた事実」を拾うだけで実在確認になる。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const popupSrc = readFileSync(path.join(repoRoot, 'src/extension/popup-entry.js'), 'utf8').replace(
  /\r\n/g,
  '\n'
);

describe('★実在確認済みサムネの記録が配線されている', () => {
  it('import している', () => {
    expect(popupSrc).toContain("from '../lib/verifiedAvatarRegistry.js'");
    expect(popupSrc).toContain('extractUidFromAvatarUrl');
  });

  it('★onRemoteSuccess(実際に表示できた瞬間)から記録する', () => {
    const idx = popupSrc.indexOf('const storyAvatarLoadGuard = createSupportAvatarLoadGuard({');
    expect(idx).toBeGreaterThan(-1);
    const block = popupSrc.slice(idx, idx + 1400);
    expect(block).toContain('onRemoteSuccess:');
    expect(block).toContain('noteVerifiedAvatarFromImg(img)');
    // ★既存の見た目復帰(fallbackクラス除去)を壊していないこと。
    expect(block).toContain('removeStoryAvatarTvFallbackClass(img)');
  });

  it('★追加の通信をしない(fetch/XHR を足していない)', () => {
    const fnIdx = popupSrc.indexOf('function noteVerifiedAvatarFromImg(img)');
    expect(fnIdx).toBeGreaterThan(-1);
    const fn = popupSrc.slice(fnIdx, fnIdx + 600);
    expect(fn).not.toContain('fetch(');
    expect(fn).not.toContain('XMLHttpRequest');
    // 既に描いた img の src を読むだけ。
    expect(fn).toMatch(/img\?\.currentSrc \|\| img\?\.src/);
  });

  it('★storage 書き込みを間引く(成功のたびに set しない)', () => {
    expect(popupSrc).toContain('VERIFIED_AVATAR_SAVE_GAP_MS');
    const fnIdx = popupSrc.indexOf('function maybeFlushVerifiedAvatars()');
    expect(fnIdx).toBeGreaterThan(-1);
    const fn = popupSrc.slice(fnIdx, fnIdx + 900);
    expect(fn).toMatch(/if \(now - _verifiedAvatarSavedAt < VERIFIED_AVATAR_SAVE_GAP_MS\) return;/);
    // ★変化が無ければ書かない。
    expect(fn).toContain('if (!merged.changed) return;');
  });

  it('★全件読みを持ち込んでいない(1キーだけ読む)', () => {
    const fnIdx = popupSrc.indexOf('function maybeFlushVerifiedAvatars()');
    const fn = popupSrc.slice(fnIdx, fnIdx + 900);
    expect(fn).toContain('local.get(KEY_VERIFIED_AVATAR_UIDS)');
    expect(fn).not.toMatch(/\.get\(\s*null\s*\)/);
  });
});
