// sidepanel-entry.js — サイドパネルの自己診断だけを担う極小エントリ。
//
// ★役割は1つ: 「いま自分が黒く見える状態か」を storage に書く。
//   ユーザーに DevTools を開いてもらわなくても、いつもの【状態速報コピー】に出る。
//   背景: サイドパネルの黒画面は開発環境で再現せず、実機だけで起きていた(2026-08-08)。
//   推測で修正を重ねるより、実機の値を1行で取り出せるようにする方が速い。
//
// ★描画には一切関与しない(読むだけ・best-effort)。失敗してもパネルは普通に動く。

import { judgeSidepanelBlack } from '../lib/sidepanelSelfDiag.js';
import { KEY_SIDEPANEL_SELF_DIAG } from '../lib/sidepanelSelfDiagKey.js';

/** @param {Element|null} el */
function sampleLayer(el) {
  if (!el) return null;
  try {
    const cs = getComputedStyle(/** @type {HTMLElement} */ (el));
    return {
      bgColor: cs.backgroundColor,
      bgImage: cs.backgroundImage === 'none' ? 'none' : 'grad',
      colorScheme: cs.colorScheme,
      styleAttr: el.getAttribute('style') ? 'yes' : 'no'
    };
  } catch {
    return null;
  }
}

/** この起動で観測した「最悪の瞬間」(黒かった1回目)。null=まだ黒を見ていない。
 *  @type {{ phase: string, verdict: { ok: boolean, line: string, cause: string }, sample: any, at: number }|null} */
let _worst = null;
/** この起動で collectAndPublish を呼んだ回数(何回目の測定か)。 */
let _samples = 0;

/**
 * @param {string} phase どの瞬間の測定か('load'=描画直後 / 'settled'=落ち着いた後)
 */
function collectAndPublish(phase) {
  try {
    const ifr = document.querySelector('iframe');
    const rect = ifr ? ifr.getBoundingClientRect() : null;
    /** @type {Document|null} */
    let innerDoc = null;
    let canRead = false;
    try {
      innerDoc = ifr ? ifr.contentDocument : null;
      canRead = Boolean(innerDoc && innerDoc.documentElement);
    } catch {
      canRead = false;
    }

    const innerLayer = canRead && innerDoc ? sampleLayer(innerDoc.documentElement) : null;
    const sample = {
      version: (() => {
        try {
          return chrome.runtime.getManifest().version;
        } catch {
          return '';
        }
      })(),
      panelW: window.innerWidth,
      panelH: window.innerHeight,
      outer: sampleLayer(document.documentElement),
      iframe: ifr
        ? {
            ...(sampleLayer(ifr) || {}),
            w: rect ? Math.round(rect.width) : 0,
            h: rect ? Math.round(rect.height) : 0,
            canRead,
            ready: canRead && innerDoc ? innerDoc.readyState : ''
          }
        : null,
      inner: innerLayer
        ? {
            ...innerLayer,
            bodyKids: innerDoc && innerDoc.body ? innerDoc.body.children.length : 0,
            cloak:
              innerDoc && innerDoc.documentElement
                ? innerDoc.documentElement.getAttribute('data-nl-popup-primary-cloak') || ''
                : ''
          }
        : null
    };

    const verdict = judgeSidepanelBlack(sample);
    _samples += 1;
    // ★「一瞬だけ黒い」を消さない(2026-08-09 ユーザー報告=出た直後だけ黒く、しばらくすると直る)。
    //   従来は load 直後と 2500ms 後の2回とも【同じキーへ素で set】していたため、
    //   後の落ち着いた✅が先の🔴を上書きし、実機で必ず「✅正常」しか残らなかった
    //   ([[settled-state-hides-flash-bugs-2026-08-07]] を計器自身が踏んだ形)。
    //   → 黒を一度でも観測したらそれを保持し、以後の✅で塗り潰さない。
    if (!verdict.ok && !_worst) _worst = { phase, verdict, sample, at: Date.now() };

    const worst = _worst;
    const flashed = Boolean(worst);
    // 出す行: 黒を見たならその瞬間の原因を出し、今は直っているかも併記する。
    const line = flashed
      ? `${worst.verdict.line} ★出た直後だけ黒い(${worst.phase}時点で検知・今は${verdict.ok ? '正常' : '黒いまま'})`
      : verdict.line;

    void chrome?.storage?.local?.set({
      [KEY_SIDEPANEL_SELF_DIAG]: {
        at: Date.now(),
        // ok は「この起動で一度も黒くなかった」を意味する(瞬間の黒も見逃さない)。
        ok: verdict.ok && !flashed,
        cause: flashed ? worst.verdict.cause : verdict.cause,
        line,
        phase,
        samples: _samples,
        flashed,
        flashPhase: flashed ? worst.phase : '',
        // 黒かった瞬間の生値を残す(原因の裏取り用)。無ければ今の値。
        sample: flashed ? worst.sample : sample,
        nowSample: sample
      }
    });
  } catch {
    /* best-effort: 診断の失敗はパネルを止めない */
  }
}

// ★「出た直後だけ黒い」を捕まえるため、開いた瞬間から連続で測る(2026-08-09 ユーザー報告)。
//   2点(load+50ms / 2500ms)だけだと、その【あいだ】で起きる黒を丸ごと取り逃がす。
//   黒は最初の数百msに出るので、序盤を密に・後半を粗く見る。
//   ★上のロジックが「一度でも黒ければ保持」するので、何度測っても✅で塗り潰されない。
const SAMPLE_AT_MS = [0, 60, 120, 200, 300, 450, 600, 800, 1100, 1500, 2000, 2500, 3500];
for (const ms of SAMPLE_AT_MS) {
  setTimeout(() => collectAndPublish(ms === 0 ? 'immediate' : `t+${ms}ms`), ms);
}
// iframe の load 直後も1点(タイマー格子とズレた瞬間を拾う)。
try {
  const ifr = document.querySelector('iframe');
  if (ifr) ifr.addEventListener('load', () => setTimeout(() => collectAndPublish('load'), 50), { once: true });
} catch {
  /* no-op */
}
