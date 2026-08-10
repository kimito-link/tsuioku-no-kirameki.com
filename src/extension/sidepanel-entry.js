// sidepanel-entry.js — サイドパネルの自己診断だけを担う極小エントリ。
//
// ★役割は1つ: 「いま自分が黒く見える状態か」を storage に書く。
//   ユーザーに DevTools を開いてもらわなくても、いつもの【状態速報コピー】に出る。
//   背景: サイドパネルの黒画面は開発環境で再現せず、実機だけで起きていた(2026-08-08)。
//   推測で修正を重ねるより、実機の値を1行で取り出せるようにする方が速い。
//
// ★描画には一切関与しない(読むだけ・best-effort)。失敗してもパネルは普通に動く。

import {
  findCenterPainter,
  judgeSidepanelBlack,
  summarizeZeroAreaWindow
} from '../lib/sidepanelSelfDiag.js';
import { KEY_SIDEPANEL_SELF_DIAG } from '../lib/sidepanelSelfDiagKey.js';

/**
 * ★v0.1.1302: 画面中央の点から祖先チェーンを集める(判定は純関数 findCenterPainter が行う)。
 *   CSS 値を層ごとに読むだけでは足りないと実機で確定した(3層✅なのに黒い)ため、
 *   「その座標に実在する要素」から辿る。elementFromPoint は既存パターン
 *   (tests/e2e/popup-layout.spec.js / contentVisibilityHitTest.wiring.test.js)。
 * @returns {{ painter: string|null, chain: string[], hit: string }}
 */
function probeCenterPainter() {
  try {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 面積が無いときは elementFromPoint が無意味(必ず null)。測らず「未レイアウト」を返す。
    if (!(w > 0 && h > 0)) return { painter: null, chain: [], hit: 'ZERO_AREA' };
    const el = document.elementFromPoint(Math.floor(w / 2), Math.floor(h / 2));
    if (!el) return { painter: null, chain: [], hit: 'NO_ELEMENT' };
    /** @type {{ tag: string, bgColor: string, bgImage: string }[]} */
    const chain = [];
    /** @type {Element|null} */
    let cur = el;
    for (let i = 0; cur && i < 12; i += 1) {
      const cs = getComputedStyle(/** @type {HTMLElement} */ (cur));
      chain.push({
        tag: cur.tagName.toLowerCase() + (cur.id ? `#${cur.id}` : ''),
        bgColor: cs.backgroundColor,
        bgImage: cs.backgroundImage
      });
      cur = cur.parentElement;
    }
    const r = findCenterPainter(chain);
    return { painter: r.painter, chain: r.chain, hit: el.tagName.toLowerCase() };
  } catch {
    return { painter: null, chain: [], hit: 'ERROR' };
  }
}

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
 * ★v0.1.1302: 各測定点の窓/iframe サイズの【系列】。
 *   従来は最後の1点(nowSample)しか残らず、「窓が 0x0 だったのは何msか」が消えていた。
 *   ユーザー証言「でる瞬間黒いが見える感じ」の裏取りに継続時間が要る:
 *     60ms → 人間に見えない = 黒の正体は別 / 800ms → これが見えている黒。
 * @type {{ t: number, w: number, h: number, iw: number, ih: number }[]}
 */
const _sizeSeries = [];
/** パネルが開いた時刻(系列の t=0 基準)。 */
const _bootAt = Date.now();

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
      // ★v0.1.1302: その座標を実際に塗っているのは誰か(CSS値の層読みでは足りない)。
      centerPaint: probeCenterPainter(),
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
    // ★v0.1.1302: 窓/iframe サイズを系列として残す(継続時間を測る唯一の材料)。
    _sizeSeries.push({
      t: Math.max(0, Date.now() - _bootAt),
      w: Math.max(0, Math.round(Number(sample.panelW) || 0)),
      h: Math.max(0, Math.round(Number(sample.panelH) || 0)),
      iw: Math.max(0, Math.round(Number(sample.iframe?.w) || 0)),
      ih: Math.max(0, Math.round(Number(sample.iframe?.h) || 0))
    });
    const zeroArea = summarizeZeroAreaWindow(_sizeSeries);
    /*
     * ★窓が未レイアウト(0x0)の測定は【最悪値として記録しない】。
     *   t=0 の setTimeout はレイアウト前に走りうるので、ここを🔴として保持すると
     *   ★毎回必ず偽の「黒くなりうる」が残る(実機 v0.1.1298 がまさにこれ)。
     *   測定自体は続ける=継続時間は上の系列に残るので情報は失わない。
     */
    const unlaidOut = String(verdict.cause || '').startsWith('未レイアウト');
    // ★「一瞬だけ黒い」を消さない(2026-08-09 ユーザー報告=出た直後だけ黒く、しばらくすると直る)。
    //   従来は load 直後と 2500ms 後の2回とも【同じキーへ素で set】していたため、
    //   後の落ち着いた✅が先の🔴を上書きし、実機で必ず「✅正常」しか残らなかった
    //   ([[settled-state-hides-flash-bugs-2026-08-07]] を計器自身が踏んだ形)。
    //   → 黒を一度でも観測したらそれを保持し、以後の✅で塗り潰さない。
    if (!verdict.ok && !unlaidOut && !_worst) _worst = { phase, verdict, sample, at: Date.now() };

    const worst = _worst;
    const flashed = Boolean(worst);
    /*
     * ★v0.1.1302: 1行に「誰が塗っているか」と「窓0x0の継続」を併記する(行は増やさない)。
     *   - 塗り主=🔴誰も塗っていない … その座標が本物の黒
     *   - 窓0x0の継続 … 人間に見える長さか(60ms=見えない / 800ms=これが正体)
     *   ★塗り主は【今の値】を出す。過去の一瞬より「今どうなっているか」が次の一手に効く。
     */
    const cp = sample.centerPaint || null;
    const paintNote = cp
      ? ` / 中央の塗り主=${cp.painter || '🔴誰も塗っていない'}${cp.hit === 'ZERO_AREA' ? '(未レイアウト)' : ''}`
      : '';
    const zeroNote = zeroArea.everZero || _samples > 1 ? ` / ${zeroArea.line}` : '';
    const line = flashed
      ? `${worst.verdict.line} ★出た直後だけ黒い(${worst.phase}時点で検知・今は${verdict.ok ? '正常' : '黒いまま'})${paintNote}${zeroNote}`
      : `${verdict.line}${paintNote}${zeroNote}`;

    void chrome?.storage?.local?.set({
      [KEY_SIDEPANEL_SELF_DIAG]: {
        at: Date.now(),
        // ok は「この起動で一度も黒くなかった」を意味する(瞬間の黒も見逃さない)。
        // ★未レイアウトは黒として数えない(偽陽性を永久保持しない)。
        ok: verdict.ok && !flashed,
        cause: flashed ? worst.verdict.cause : verdict.cause,
        line,
        phase,
        samples: _samples,
        flashed,
        flashPhase: flashed ? worst.phase : '',
        // ★窓0x0の継続(黒の正体を絞る本命の材料)。
        zeroArea,
        sizeSeries: _sizeSeries,
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
