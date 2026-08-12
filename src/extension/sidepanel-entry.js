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
import { summarizeCloakDuration } from '../lib/sidepanelCloakDuration.js';
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
/**
 * ★v0.1.1351: 起動から30秒より【後】に観測した黒(最後の1回)。
 *   2026-08-12 のユーザー実機は「ニコ生でない普通のページを開いた状態で真っ黒」だった。
 *   従来の観測点は30秒で打ち切りのため、この経路は**構造的に観測できていなかった**
 *   (速報は永久に「✅正常」と言い続ける)。_worst と混ぜると「出た直後だけ黒い」と
 *   誤表示されるので別の箱に分ける。
 * @type {{ phase: string, verdict: { ok: boolean, line: string, cause: string },
 *   at: number, sinceBootMs: number, count: number }|null}
 */
let _lateBlack = null;
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
/**
 * ★v0.1.1307: 幕(cloak)の観測列。
 *   2026-08-10 実機のスクショは【配信5時間45分経過】で真っ黒だった=黒は居座っている。
 *   しかし従来の観測窓は 3500ms 打ち切りで、居座る黒を構造的に測れず、速報は必ず
 *   「★出た直後だけ黒い」としか言えなかった([[zero-count-may-mean-unmeasured]] と同型)。
 *   幕が「1.5秒で解除されるのか / 永久に残るのか」が次の一手を決めるので系列で残す。
 * @type {{ t: number, cloak: string }[]}
 */
const _cloakSeries = [];
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
    // ★v0.1.1307: 幕の観測列を積む(iframe を読めない間は測れないので記録しない=
    //   「読めない」を「外れている」と誤読しないため)。
    if (sample.inner) {
      _cloakSeries.push({
        t: Math.max(0, Date.now() - _bootAt),
        cloak: String(sample.inner.cloak || '')
      });
    }
    const cloakDuration = summarizeCloakDuration(_cloakSeries);
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

    /*
     * ★v0.1.1351: 「起動直後の一瞬の黒」と「あとから黒くなった」を別の事実として持つ。
     *   混ぜると late の黒が「★出た直後だけ黒い(今は正常)」と誤って表示され、
     *   ユーザーのスクショ(30秒より後に黒い)を計器が否定してしまう。
     *   late 側は【最後に観測した黒】を上書きで持つ(今どうなっているかが次の一手に効く)。
     */
    const isLatePhase = phase === 'late' || phase === 'visible' || phase === 'reload';
    if (!verdict.ok && !unlaidOut && isLatePhase) {
      _lateBlack = {
        phase,
        verdict,
        at: Date.now(),
        sinceBootMs: Math.max(0, Date.now() - _bootAt),
        count: (_lateBlack?.count || 0) + 1
      };
    }

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
    /*
     * ★v0.1.1307: 幕の継続を必ず1行に混ぜる。
     *   「★出た直後だけ黒い」という文言は観測窓(旧3500ms)が作っていた見え方で、
     *   実機は5時間45分経過でも黒かった。幕が残り続けているかどうかを速報から
     *   直接読めるようにする(次の一手=CSSで救えているのか/JSの解除が届いていないのか)。
     */
    const cloakNote = cloakDuration.everCloaked ? ` / ${cloakDuration.line}` : '';
    /*
     * ★v0.1.1351: 「あとから黒くなった」を必ず1行に混ぜる。
     *   これが無いと、30秒より後に黒くなった実機を計器が「✅正常」と報告してしまう
     *   (画面にしか出ない情報は報告に乗らない=無いのと同じ)。
     *   起動からの経過を秒で併記する=「開いた直後の話ではない」ことが一目で分かる。
     */
    const lateNote = _lateBlack
      ? ` / ★あとから黒くなった(起動${Math.round(_lateBlack.sinceBootMs / 1000)}秒後の${_lateBlack.phase}で検知・${_lateBlack.count}回・原因=${_lateBlack.verdict.cause || '不明'})`
      : '';
    const line = flashed
      ? `${worst.verdict.line} ★出た直後だけ黒い(${worst.phase}時点で検知・今は${verdict.ok ? '正常' : '黒いまま'})${paintNote}${zeroNote}${cloakNote}${lateNote}`
      : `${verdict.line}${paintNote}${zeroNote}${cloakNote}${lateNote}`;

    void chrome?.storage?.local?.set({
      [KEY_SIDEPANEL_SELF_DIAG]: {
        at: Date.now(),
        // ok は「この起動で一度も黒くなかった」を意味する(瞬間の黒も見逃さない)。
        // ★未レイアウトは黒として数えない(偽陽性を永久保持しない)。
        // ★v0.1.1351: あとから黒くなった場合も ok=false。ここを入れ忘れると、行には
        //   「★あとから黒くなった」と出るのに ok=true のままになり、判定と表示が食い違う。
        ok: verdict.ok && !flashed && !_lateBlack,
        cause: flashed ? worst.verdict.cause : _lateBlack ? _lateBlack.verdict.cause : verdict.cause,
        line,
        phase,
        samples: _samples,
        flashed,
        flashPhase: flashed ? worst.phase : '',
        // ★窓0x0の継続(黒の正体を絞る本命の材料)。
        zeroArea,
        sizeSeries: _sizeSeries,
        // ★v0.1.1307: 幕の継続(居座る黒か・CSSで救えているか)。
        cloakDuration,
        cloakSeries: _cloakSeries,
        // ★v0.1.1351: 30秒より後に黒くなった事実(null=起きていない)。
        //   起動直後の一瞬(flashed)とは別物として読むこと。
        lateBlack: _lateBlack,
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
/*
 * ★v0.1.1307: 観測窓を 3.5秒 → 30秒 へ延ばす(居座る黒を測れるようにする)。
 *
 * ■ なぜ必要か(2026-08-10 実機で確定)
 *   ユーザーのスクリーンショットは【配信5時間45分経過】の時点で真っ黒だった。
 *   つまり黒は「開いた直後の一瞬」ではなく【居座っている】。
 *   ところが従来の最終観測点は 3500ms で、それ以降を一切見ていなかった。
 *   そのため速報はどれだけ黒くても「★出た直後だけ黒い(今は正常)」としか言えず、
 *   5セッションのあいだ「一瞬の黒」を追い続けることになった。
 *   ★計器の観測窓が症状の姿を決めてしまっていた([[zero-count-may-mean-unmeasured]] と同型)。
 *
 * ■ なぜ 30秒で十分か
 *   CSS の自動解除は 1500ms・JS の最終安全網は window load 後 800ms。
 *   どちらの保険も効かずに 30秒残っていれば、それは【恒久的に残る】と断定してよい。
 *   後半は粗く間引くので測定コストはほぼ増えない(合計19点)。
 */
const SAMPLE_AT_MS = [
  0, 60, 120, 200, 300, 450, 600, 800, 1100, 1500, 2000, 2500, 3500,
  5000, 8000, 12000, 18000, 25000, 30000
];
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

/*
 * ─────────────────────────────────────────────────────────────────────
 * ★v0.1.1351: 起動から30秒より【後】に黒くなる場合を測る。
 * ─────────────────────────────────────────────────────────────────────
 *
 * ■ なぜ要るか(2026-08-12 ユーザー実機スクショ)
 *   パネルは【ニコ生でない普通のページ】(chikuwachan.com)を開いた状態で真っ黒だった。
 *   従来の観測点は SAMPLE_AT_MS の最後=30秒で終わりで、それ以降は一度も測らない。
 *   つまり「起動時は正常→あとから黒くなる」経路が**構造的に観測できず**、
 *   速報は永久に「✅正常」と言い続ける。
 *
 *   ★これは v0.1.1307 で 3500ms→30000ms に伸ばしたときと**同じ型の穴**である。
 *     観測窓の端を伸ばしただけでは「窓の外で起きる症状」は消えない。
 *     → 端を伸ばすのではなく【今の状態を測り直す契機】を作るのが正しい直し方。
 *
 * ■ 3つの契機
 *   1. 遅い定期観測(30秒ごと): 居座る黒を必ず1回は捕まえる。
 *      ★rAF は使わない(タブ非表示で止まる=G5)。setInterval + 実時刻で測る。
 *   2. 可視化(visibilitychange): 隠れている間は測っても意味がないので、
 *      見えた瞬間に測り直す。ユーザーが「見て黒い」と気づく瞬間と一致する。
 *   3. iframe の再 load: パネル内の遷移(配信を移る/別ページを開く)ごとに測り直す。
 *      ★これが今回のスクショの経路。once:true の初回 load しか見ていなかった。
 *
 * ■ 「あとから黒くなった」を別の事実として残す
 *   _worst は「起動直後の一瞬の黒」を保持するための箱で、これに late の黒を混ぜると
 *   区別が消える(「出た直後だけ黒い」と誤って表示される)。別の箱に分けて記録する。
 */
const LATE_PROBE_INTERVAL_MS = 30000;

try {
  setInterval(() => {
    // 隠れている間の測定は無意味(かつタイマー間引きで時刻もぶれる)。見えているときだけ測る。
    if (document.visibilityState === 'visible') collectAndPublish('late');
  }, LATE_PROBE_INTERVAL_MS);
} catch {
  /* no-op */
}

try {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // 表示された直後はレイアウトが確定していないことがあるので少し待つ。
      setTimeout(() => collectAndPublish('visible'), 120);
    }
  });
} catch {
  /* no-op */
}

try {
  const ifr = document.querySelector('iframe');
  // ★once を付けない(初回 load 以降の遷移こそが今回の症状の経路)。
  if (ifr) {
    ifr.addEventListener('load', () => {
      setTimeout(() => collectAndPublish('reload'), 120);
    });
  }
} catch {
  /* no-op */
}
