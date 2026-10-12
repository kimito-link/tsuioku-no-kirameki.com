/**
 * 会場が全画面・bfcache 復帰で消えない/ずれない配線の固定(2026-10-12)。
 *
 * ■ 実測(Playwright・放送中の watch ページ)
 *   プレイヤーを全画面にすると、会場のボタンが elementFromPoint に当たらない(root が <html> 直下で
 *   全画面要素=top layer に覆われる)。解除すると戻る。修正後は root が全画面要素の中へ移り、当たる。
 * ■ bfcache
 *   pagehide のクラス掃除だけでは、復帰時(mount 再実行なし)に「stage は開いたまま・html の印は無し・集計停止」になる。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'extension', 'venueBar.js'), 'utf8').split('\r\n').join('\n');

describe('会場: 全画面でも出す', () => {
  const at = src.indexOf('const relocateRootForFullscreen = () => {');
  const body = at < 0 ? '' : src.slice(at, at + 900);

  it('relocateRootForFullscreen の本体が取れている(前提)', () => {
    expect(body.length).toBeGreaterThan(400);
  });

  it('全画面要素の中へ root を移す(video は子を描けないので除外・二重移動しない)', () => {
    expect(body).toContain('if (fs !== root && !(fs instanceof HTMLVideoElement) && !fs.contains(root)) fs.appendChild(root);');
  });

  it('解除したら <html> 直下へ戻す(全画面要素が消えていても)', () => {
    expect(body).toContain('} else if (root.parentNode !== home) {');
    expect(body).toContain('home.appendChild(root);');
  });

  it('fullscreenchange に配線されている', () => {
    expect(src).toContain("document.addEventListener('fullscreenchange', relocateRootForFullscreen);");
  });
});

describe('会場: bfcache に保存される離脱で状態を閉じる', () => {
  const at = src.indexOf("'pagehide',\n    (ev) => {");
  const body = at < 0 ? '' : src.slice(at, at + 1900);

  it('pagehide の本体が取れている(前提・once ではない)', () => {
    expect(body.length).toBeGreaterThan(900);
    expect(body).not.toContain('{ once: true }');
  });

  it('persisted かつ開いているときだけ setOpen(false) で内部状態も閉じる', () => {
    expect(body).toContain('if (ev && /** @type {PageTransitionEvent} */ (ev).persisted && open) {');
    expect(body).toContain('try { setOpen(false, false); } catch');
  });

  it('html の印の掃除は従来どおり残っている', () => {
    expect(body).toContain("document.documentElement.classList.remove('nlsb-venue-open');");
  });
});
