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
import { summarizeCloakDuration, summarizeContentBlindTime } from '../lib/sidepanelCloakDuration.js';
import { summarizeEventLoopStall } from '../lib/eventLoopStallSummary.js';
import { buildCommentWriteModeDiagLine } from '../lib/commentWriteModeDiag.js';
import { KEY_COMMENT_WRITE_MODE_DIAG } from '../lib/commentWriteModeDiagKey.js';
import { KEY_SIDEPANEL_SELF_DIAG } from '../lib/sidepanelSelfDiagKey.js';
import { buildSidePanelIframeSrc } from '../lib/sidepanelIframeSrc.js';

/*
 * ★v0.1.1419: iframe に配信ID(lv)を渡してから読み込ませる。【描画に関与する唯一の処理】。
 *
 * ■ 実機(2026-08-17)の状態速報が名指しした真因
 *     🔴 レーンが空: 描画関数が一度も呼ばれていません
 *     laneTickProbe: lidMiss=4 / lidFromInline=0 / lidFromSnapshot=0 / lidFromLastPainted=0
 *   background.js は `sidepanel.html?lv=lv351195145` と正しく渡していたが、
 *   iframe の src が静的で lv を持たず【この境界で捨てられていた】。
 *   popup 側の INLINE_OWN_WATCH_URL は `if (!INLINE_EMBED_WATCH) return ''`
 *   (popup-entry.js:1027)＝サイドパネルでは構造上【常に空】なので、
 *   lv を渡す道はここしか無い。
 *
 * ★このファイルの「描画に関与しない」原則の唯一の例外。ここでしか直せないため。
 *   失敗しても素の src で読み込む(=従来どおり)ので、パネルが出なくなることはない。
 * ★src ではなく data-nl-src に書いてあるのは、lv を足す【前】に popup が
 *   読み込まれて二重ロードになるのを防ぐため(sidepanel.html のコメント参照)。
 */
try {
  const ifr = document.querySelector('iframe[data-nl-src]');
  if (ifr) {
    const base = ifr.getAttribute('data-nl-src') || '';
    const next = buildSidePanelIframeSrc(base, window.location.search);
    if (next) ifr.setAttribute('src', next);
  }
} catch {
  /* no-op: 失敗しても下の自己診断は続ける(パネル自体は素の src で出る) */
}

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
 * ★v0.1.1381: sched(予定時刻)を追加。実発火 t との差が「イベントループが止まっていた長さ」。
 *   予定を持たない点(load/visible/reload)は null＝遅延を計算しない。
 * @type {{ t: number, sched: number|null, w: number, h: number, iw: number, ih: number }[]}
 */
const _sizeSeries = [];
/**
 * ★v0.1.1382: コメント書き込みモードの最新観測値(記録エンジンが書く)。
 *   非同期で読むので、読めるまでは null=「未観測」として扱う(「正常」とは言わない)。
 * @type {import('../lib/commentWriteModeDiag.js').CommentWriteModeDiag|null}
 */
let _commentWriteModeDiag = null;
/**
 * ★v0.1.1307: 幕(cloak)の観測列。
 *   2026-08-10 実機のスクショは【配信5時間45分経過】で真っ黒だった=黒は居座っている。
 *   しかし従来の観測窓は 3500ms 打ち切りで、居座る黒を構造的に測れず、速報は必ず
 *   「★出た直後だけ黒い」としか言えなかった([[zero-count-may-mean-unmeasured]] と同型)。
 *   幕が「1.5秒で解除されるのか / 永久に残るのか」が次の一手を決めるので系列で残す。
 * @type {{ t: number, cloak: string }[]}
 */
const _cloakSeries = [];
/** ★v0.1.1364: 初回シェードが覆っていた最後の時刻[ms](-1=一度も覆っていない)。 */
let _shadeCoveringLastT = -1;
/** ★v0.1.1364: シェードが覆っている状態を観測した回数。 */
let _shadeCoveringSamples = 0;
/** パネルが開いた時刻(系列の t=0 基準)。 */
const _bootAt = Date.now();

/** ★v0.1.1372: 自己診断オーバーレイの id(重複生成を防ぐ)。 */
const SELF_DIAG_OVERLAY_ID = 'nlSidepanelSelfDiagOverlay';

/**
 * ★v0.1.1383: 観測系列の上限。
 *   起動格子(SAMPLE_AT_MS=19点)は黒の判定に必須なので必ず残し、
 *   それ以降の late/visible/reload 点は直近ぶんだけ保持する。
 */
const SERIES_HEAD_KEEP = 24;
const SERIES_TAIL_KEEP = 16;

/**
 * 系列を有界に保つ(先頭=起動直後は温存し、古い中間だけ捨てる)。
 *
 * ★なぜ「先頭を残す」のか: 黒は起動直後に出るので、頭を捨てると
 *   [[observation-window-edge-hides-late-symptoms-2026-08-12]] の逆で
 *   **症状そのものの記録**を失う。捨ててよいのは「その後ずっと正常だった」中間だけ。
 *
 * @param {any[]} arr 破壊的に切り詰める配列
 */
function trimObservationSeries(arr) {
  if (!Array.isArray(arr)) return;
  const max = SERIES_HEAD_KEEP + SERIES_TAIL_KEEP;
  if (arr.length <= max) return;
  const tail = arr.slice(arr.length - SERIES_TAIL_KEEP);
  arr.length = SERIES_HEAD_KEEP;
  for (const row of tail) arr.push(row);
}

/**
 * ★v0.1.1373: この時間以上「中身が見えない」なら異常とみなす[ms]。
 *
 * 実機(2026-08-12)は 12,773ms 中身が出ていないのに ✅正常 と出ていた。
 * ★v0.1.1374: 1秒 → 4秒。v1373 の 2.5秒シェード上限を踏まえた値。
 *   実機は改善後 909ms(正常な起動時の読み込み)で、1秒だと【正常な起動を異常と呼ぶ】。
 *   シェード上限(2.5s)+CSS保険の余裕を越えたときだけ異常＝出るなら本物。
 */
const CONTENT_BLIND_ALERT_MS = 4_000;

/**
 * ★v0.1.1374: オーバーレイを出してよいのは【いま異常なとき】だけ。
 *
 * ■ 何が起きたか(2026-08-12 実機・私が作った直後のノイズ)
 *   v1373 適用後の実機は「中身が見えなかった合計=909ms」で、パネルは正常に
 *   描けているのに ⚠オーバーレイが【出っぱなし】になった。
 *   ★blindMs は【累積値】なので一度超えたら永久に超えたまま。
 *     つまり「いま異常か」ではなく「起動時に何msかかったか」を表示し続けていた。
 *   ★[[settled-state-hides-flash-bugs-2026-08-07]] の【逆】: 過去の一瞬を
 *     現在の状態として出し続けると、正常なのに警告が居座る=ノイズ=価値が負。
 *
 * ■ 判定: 過去の記録(flashed/blind)は【行(速報)】に残す。画面に出すのは
 *   「いま現に中身が無い」場合だけ。両者は目的が違う(記録 vs 通知)。
 *
 * @param {{ ok?: boolean, cause?: string }|null|undefined} verdict 今回の判定
 * @param {any} sample 今回の生サンプル(独自判定には使わない・将来の拡張用)
 * @returns {boolean} true=いま黒い(オーバーレイを出す)
 */
function isBlackRightNow(verdict, sample) {
  if (!verdict || verdict.ok === true) return false;
  const cause = String(verdict.cause || '');
  // 未レイアウト(窓0x0)は Chrome の滑り出し中=拡張からは塗れない。異常と呼ばない。
  if (cause.startsWith('未レイアウト')) return false;
  /*
   * ★v0.1.1374 の実測で分かったこと: bodyKids だけでは判定できない。
   *   about:blank(=中身が読めていない最悪の状態)でも body の子要素は存在しうる
   *   ＝「kids>0 なら正常」とすると【本物の異常で警告が出なくなる】。実際そうなった。
   *   ★判定は verdict.cause(判定済みの名指し)に委ねる。ここで独自の閾値を作らない
   *     ([[measure-the-region-you-claim-2026-08-10]]: 決め打ちの計器は別物を測る)。
   *
   * ★verdict.ok=false かつ未レイアウトでない＝いま現に「黒くなりうる」状態。
   *   これが表示条件。累積値(blindMs)は使わない=正常に戻れば次の測定で消える。
   */
  void sample;
  return true;
}

/**
 * ★v0.1.1372: 「いま黒い/中身が出ていない」を【パネル自身の画面】に出す。
 *
 * ■ 設計の掟(どれも実機の失敗から来ている)
 *   1. 異常のときだけ出す。正常なら要素ごと消す=通常利用を1px も邪魔しない。
 *   2. 色は自前で完結させる(CSS変数や親の色に依存しない)。
 *      ★黒画面の状況では「地の色が出ない」こと自体が症状なので、
 *        var(--nl-bg) 等に頼ると【症状のときだけ読めない表示】になる。
 *   3. iframe の【外】(sidepanel.html 側)に置く。中の popup が死んでいても出る。
 *   4. pointer-events:none=操作を一切奪わない(閉じるボタンも作らない=押させない)。
 *
 * @param {{ ok: boolean, line: string }} v 判定結果
 */
function renderSelfDiagOverlay(v) {
  const doc = document;
  if (!doc || !doc.body) return;
  const existing = doc.getElementById(SELF_DIAG_OVERLAY_ID);
  // 正常なら出さない(既に出ていれば下ろす)。
  if (v.ok) {
    if (existing) existing.remove();
    return;
  }
  const el = existing || doc.createElement('div');
  if (!existing) {
    el.id = SELF_DIAG_OVERLAY_ID;
    /*
     * ★色は固定値でベタ書きする(理由は上の掟2)。
     *   薄い黄色地＋濃い文字＝黒背景でも白背景でも読める組み合わせ。
     */
    el.style.cssText = [
      'position:fixed',
      'left:8px',
      'right:8px',
      'bottom:8px',
      'z-index:2147483647',
      'padding:10px 12px',
      'border-radius:8px',
      'border:1px solid #b45309',
      'background:#fffbeb',
      'color:#7c2d12',
      'font:12px/1.55 system-ui,sans-serif',
      'white-space:pre-wrap',
      'word-break:break-word',
      'box-shadow:0 4px 16px rgba(0,0,0,.35)',
      'pointer-events:none'
    ].join(';');
    doc.body.appendChild(el);
  }
  /*
   * ★1行目は「ユーザーが次に何をすればいいか」。判定文字列(開発者向け)はその下。
   *   計器の価値は【読んで直せたか】で測る([[instrument-value-is-measured-by-fixes]])ので、
   *   専門用語だけの行は出さない。
   */
  el.textContent =
    '⚠ パネルの中身が出ていません（この表示は異常時だけ出ます）\n' +
    'まず: このパネルを一度閉じて開き直してください。直らなければ下の行をコピーして伝えてください。\n' +
    v.line;
}

/**
 * @param {string} phase どの瞬間の測定か('load'=描画直後 / 'settled'=落ち着いた後)
 * @param {number|null} [schedMs] この測定の【予定時刻】(起動からのms)。
 *   タイマー格子の点だけが持つ。イベント起点(load/visible/reload)は予定が無いので null。
 *   ★実発火時刻との差が「イベントループが止まっていた長さ」になる。
 */
function collectAndPublish(phase, schedMs = null) {
  // ★v0.1.1382: 測るたびに最新値を取りに行く(記録中は値が動く)。
  //   await しない=この読みが遅くても観測そのものは止まらない。
  refreshCommentWriteModeDiag();
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
                : '',
            /*
             * ★v0.1.1364: 初回ロードシェード(nlInitialLoadShade)を観測する。
             *
             * ■ なぜこれが盲点だったか(2026-08-12 ユーザー実機)
             *   自己診断は【幕(cloak)】だけを見ており、シェードを1度も見ていなかった。
             *   ところが画面を覆っている時間はシェードの方が長い:
             *     - JS: 実データが乗るまで最大 10秒(INLINE_SHADE_DATA_FALLBACK_MS)
             *     - CSS の保険: 15秒
             *   ＝「パネルが開いているのに中身が出ない」の主因になりうるのに、
             *   速報には1文字も出ていなかった(計器の無い欠落は永久に出ない)。
             *   ★シェード自体はクリーム色なので「黒」ではない。だが中身を隠す時間は
             *     幕より長いので、黒/空の切り分けにはこの観測が要る。
             */
            shade: (() => {
              try {
                const el = innerDoc && innerDoc.getElementById
                  ? innerDoc.getElementById('nlInitialLoadShade')
                  : null;
                if (!el) return 'none';
                if (el.classList && el.classList.contains('nl-init-shade--done')) return 'done';
                const cs = innerDoc.defaultView
                  ? innerDoc.defaultView.getComputedStyle(el)
                  : null;
                if (!cs) return 'unknown';
                if (cs.display === 'none') return 'hidden';
                // opacity が 0 に近ければ実質見えていない(フェード中)。
                return Number(cs.opacity) < 0.05 ? 'fading' : 'covering';
              } catch {
                return 'unknown';
              }
            })()
          }
        : null
    };

    const verdict = judgeSidepanelBlack(sample);
    _samples += 1;
    // ★v0.1.1302: 窓/iframe サイズを系列として残す(継続時間を測る唯一の材料)。
    _sizeSeries.push({
      t: Math.max(0, Date.now() - _bootAt),
      /*
       * ★v0.1.1381: 予定時刻を残す(実発火 t との差=イベントループの停止時間)。
       *   これが無かったせいで7版のあいだ「窓0x0が長い」としか読めず、
       *   第一現象が【メインスレッド停止】であることに気づけなかった。
       *   予定を持たない点(load/visible/reload)は null＝遅延を計算しない。
       */
      /*
       * ★v0.1.1383(実機が嘘の値を出して発覚): `Number(null)` は **0(finite!)** なので、
       *   `Number.isFinite(Number(schedMs))` では null を弾けない。
       *   その結果 late/visible/reload(予定なし)が全部「予定0msの点」として記録され、
       *   パネルを3時間半開いたままにしただけで
       *   「最大タイマー遅延=12,750,002ms 🔴イベントループ停止」という**巨大な嘘**を報告した。
       *   ★私は同じ罠を eventLoopStallSummary.js 側では正しく塞いでいた(null を先に落とす)のに、
       *     **その手前のここで 0 に潰していた**＝下流の防御を上流が無効化していた。
       *   [[instrument-value-is-measured-by-fixes-2026-08-12]]: 誤誘導する計器は価値が【負】。
       */
      sched: schedMs == null || !Number.isFinite(Number(schedMs))
        ? null
        : Math.max(0, Math.round(Number(schedMs))),
      w: Math.max(0, Math.round(Number(sample.panelW) || 0)),
      h: Math.max(0, Math.round(Number(sample.panelH) || 0)),
      iw: Math.max(0, Math.round(Number(sample.iframe?.w) || 0)),
      ih: Math.max(0, Math.round(Number(sample.iframe?.h) || 0))
    });
    /*
     * ★v0.1.1383: 系列を有界にする(実機で観測447点=3時間半ぶんが溜まっていた)。
     *   late 観測は30秒ごとに永久に走るので、パネルを開きっぱなしにすると
     *   配列が無限に伸び、要約のたびに全件を舐める＝**計器自身が重くなる**。
     *   起動直後の格子(19点)は黒の判定に必須なので【先頭は必ず残し】、
     *   古い late 点だけを間引く。
     */
    trimObservationSeries(_sizeSeries);
    trimObservationSeries(_cloakSeries);
    const zeroArea = summarizeZeroAreaWindow(_sizeSeries);
    const stall = summarizeEventLoopStall(_sizeSeries);
    // ★v0.1.1307: 幕の観測列を積む(iframe を読めない間は測れないので記録しない=
    //   「読めない」を「外れている」と誤読しないため)。
    if (sample.inner) {
      _cloakSeries.push({
        t: Math.max(0, Date.now() - _bootAt),
        cloak: String(sample.inner.cloak || '')
      });
      // ★v0.1.1364: シェードが覆っていた最後の時刻を残す(幕より長く中身を隠す)。
      if (String(sample.inner.shade || '') === 'covering') {
        _shadeCoveringLastT = Math.max(0, Date.now() - _bootAt);
        _shadeCoveringSamples += 1;
      }
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
    /*
     * ★v0.1.1364: シェードが中身を覆っていた時間を出す。
     *   幕(cloak)は数百ms〜1.5秒だが、シェードは実データが乗るまで最大10秒(CSS保険15秒)
     *   覆い続ける。「パネルは開いているのに中身が出ない」の主因になりうるのに、
     *   これまで速報に1文字も出ていなかった=計器の無い欠落は永久に出ない。
     */
    const shadeNote = _shadeCoveringLastT >= 0
      ? ` / 初回シェード t+${_shadeCoveringLastT}ms まで中身を覆っていた(観測${_shadeCoveringSamples}点)`
      : '';
    /*
     * ★v0.1.1370: 幕とシェードを【合算】して体感を1つの数字で言う。
     *   旧実装は両者を別々に計算して連結するだけで、誰も足し合わせていなかった。
     *   その結果「黒く見えていた=601ms」と出しながら、実際に中身が出ないのは
     *   シェード込みで 1204ms だった=計器が過小申告し、私を cloak 追跡へ誤誘導した。
     */
    const blind = summarizeContentBlindTime(cloakDuration.visibleBlackMs, _shadeCoveringLastT);
    const blindNote = blind.line ? ` / ${blind.line}` : '';
    const lateNote = _lateBlack
      ? ` / ★あとから黒くなった(起動${Math.round(_lateBlack.sinceBootMs / 1000)}秒後の${_lateBlack.phase}で検知・${_lateBlack.count}回・原因=${_lateBlack.verdict.cause || '不明'})`
      : '';
    /*
     * ★v0.1.1373: 【中身が見えなかった時間】そのものを異常として扱う。
     *
     * ■ 実機がこう出した(2026-08-12・ユーザーの黒いパネル):
     *     サイドパネル自己診断: ✅正常 ... ★中身が見えなかった合計=12773ms 主因=初回シェード
     *   ★12.7秒も中身が出ていないのに【✅正常】。ユーザーには黒く見えているのに、
     *     計器は「正常」と言い張っていた=判定の穴。
     *
     * ■ なぜ漏れたか
     *   judgeSidepanelBlack は【その瞬間のサンプル】(塗り主・層の色)だけを見る。
     *   「誰かが塗っているか」は満たすが、シェードが上に乗って中身を隠している時間は
     *   評価に入っていなかった。合算値(summarizeContentBlindTime)は v0.1.1370 で
     *   作ったのに、【判定には配線していなかった】
     *   ([[unwired-judgement-is-systemic-2026-08-12]] を私がまた踏んだ)。
     *
     * ■ 判定: 人が気づく長さ(200ms)を大きく超えて中身が出ないなら、それは正常ではない。
     *   ここでは体感に直結する 1秒 を境にする(瞬きでは見逃せない長さ)。
     */
    const blindTooLong = blind.blindMs >= CONTENT_BLIND_ALERT_MS;
    const blindVerdictNote = blindTooLong
      ? ` 🔴この間ユーザーには中身が出ていません(${Math.round(blind.blindMs / 100) / 10}秒)`
      : '';
    /*
     * ★v0.1.1381: タイマー遅延を1項目足す(会議 Q1(b)・この版の中核)。
     *
     * ■ なぜこの1項目が要るか
     *   黒画面に7版を費やして直らなかったのは、幕・シェード・窓0x0という【下流】を
     *   直し続けていたから。第一現象は「メインスレッドが止まっていた」ことだった。
     *   ★この行は次の一手を分岐させる: 遅延が小さいなら描画側を詰める価値があり、
     *     大きいなら描画側をいくら直しても消えない(＝版を重ねない)。
     *   [[stalled-event-loop-masquerades-as-paint-bug-2026-08-12]]
     *
     * ■ 常に出す(異常時だけにしない)
     *   これは「異常の通知」ではなく【どちらのレジームで合否を判定するか】を決める値。
     *   ✅のときに消えると、健全レジームだったことが速報から読めなくなる
     *   ＝合否そのものが判定できない。
     */
    const stallNote = stall.observed > 0 ? ` / ${stall.line}` : '';
    /*
     * ★v0.1.1382: 記録エンジンの書き込みモードを【パネル自身の速報行】に混ぜる。
     *
     * ■ なぜパネル側に出すのか(status に出すだけでは足りない)
     *   現症状は「パネルが黒く、**状態速報ページも開かない**」。
     *   status にしか出さない情報は、status を開けない人には無いのと同じ
     *   ([[symptom-owner-must-be-told-2026-08-12]]・2回言われて2回忘れた宿題)。
     *
     * ■ なぜこれが要るのか(会議で「真犯人が計器の死角にいる」と確定)
     *   chunkMode=false の配信は畳み込みのたびに巨大配列を丸ごと書き戻す
     *   (実測: 停止410ms vs チャンク63ms=6.8倍)。同一メインスレッドなので
     *   その重さがそのままパネルの凍結として出る。
     *   ★それなのに chunkMode の状態は速報に1文字も出ていなかった。
     */
    const writeMode = buildCommentWriteModeDiagLine(_commentWriteModeDiag, Date.now());
    // ★未観測(⚪)のときは行に出さない=「測っていない」を「正常」と誤読させない。
    const writeModeNote = _commentWriteModeDiag ? ` / ${writeMode.line}` : '';
    const line = flashed
      ? `${worst.verdict.line} ★出た直後だけ黒い(${worst.phase}時点で検知・今は${verdict.ok ? '正常' : '黒いまま'})${paintNote}${zeroNote}${cloakNote}${shadeNote}${blindNote}${blindVerdictNote}${stallNote}${writeModeNote}${lateNote}`
      : `${verdict.line}${paintNote}${zeroNote}${cloakNote}${shadeNote}${blindNote}${blindVerdictNote}${stallNote}${writeModeNote}${lateNote}`;

    /*
     * ★v0.1.1372: 判定結果を【このパネル自身の画面】に出す。
     *
     * ■ なぜ要るか(2026-08-12 ユーザー指摘・私が忘れていた宿題)
     *   「診断ページなくても理解できる仕組みをつくる、というのも忘れられた」
     *   従来この判定は storage に書くだけで、読むのは status ページ【だけ】だった。
     *   ＝パネルが黒いとき、当のパネルには何も出ない。ユーザーは別ページを開いて
     *   コピーしないと何も分からない。そしてその status が重い/白紙だと詰む
     *   (実際 2026-08-12 に詰んだ=「どうやってこれで伝えるの」)。
     *   ★[[screen-only-info-never-reaches-the-report]] の【逆】: 報告にしか出ない情報は、
     *     報告を開けない人には無いのと同じ。
     *
     * ■ 掟: 黒いときだけ出す(正常時は1px も足さない=通常利用の邪魔をしない)。
     *   描画には関与せず、最前面に小さく重ねるだけ。失敗してもパネルは動く。
     */
    // ★v0.1.1373: 「中身が長時間出ていない」を ok の条件に含める(記録用の総合判定)。
    const overallOk = verdict.ok && !flashed && !_lateBlack && !blindTooLong;
    try {
      /*
       * ★v0.1.1374: 画面に出すのは【いま現に中身が無い】ときだけ。
       *   overallOk は「この起動で一度でも異常があったか」の記録用なので、
       *   これを表示条件にすると正常に戻っても警告が居座る(実機で実際にそうなった)。
       */
      renderSelfDiagOverlay({ ok: !isBlackRightNow(verdict, sample), line });
    } catch {
      /* best-effort: 表示に失敗しても診断の保存は続ける */
    }

    void chrome?.storage?.local?.set({
      [KEY_SIDEPANEL_SELF_DIAG]: {
        at: Date.now(),
        // ok は「この起動で一度も黒くなかった」を意味する(瞬間の黒も見逃さない)。
        // ★未レイアウトは黒として数えない(偽陽性を永久保持しない)。
        // ★v0.1.1351: あとから黒くなった場合も ok=false。ここを入れ忘れると、行には
        //   「★あとから黒くなった」と出るのに ok=true のままになり、判定と表示が食い違う。
        // ★v0.1.1373: blindTooLong(中身が長時間出ない)も異常に含める=表示と同じ判断。
        ok: overallOk,
        cause: flashed
          ? worst.verdict.cause
          : _lateBlack
            ? _lateBlack.verdict.cause
            : blindTooLong
              ? `中身が${Math.round(blind.blindMs / 100) / 10}秒出ていない(主因=${blind.dominant === 'shade' ? '初回シェード' : '幕(cloak)'})`
              : verdict.cause,
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
        /*
         * ★v0.1.1381: イベントループの停止(=この版の合否をどちらのレジームで
         *   判定するかを決める値)。stalled=true なら幕/シェードは下流なので、
         *   黒が残っても「この版が外れ」とは呼ばない。
         */
        eventLoopStall: stall,
        /*
         * ★v0.1.1382: 記録エンジンの書き込みモード(真犯人候補)。
         *   whole=巨大配列の丸ごと書き戻し＝O(N)。chunk=追記だけ＝件数非依存。
         */
        commentWriteMode: _commentWriteModeDiag,
        // ★v0.1.1351: 30秒より後に黒くなった事実(null=起きていない)。
        //   起動直後の一瞬(flashed)とは別物として読むこと。
        lateBlack: _lateBlack,
        // ★v0.1.1364: 初回シェードが中身を覆っていた最後の時刻(-1=覆っていない)。
        shadeCoveringLastT: _shadeCoveringLastT,
        shadeCoveringSamples: _shadeCoveringSamples,
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
  // ★予定時刻(ms)を渡す=実発火との差でイベントループの停止を測る唯一の材料。
  setTimeout(() => collectAndPublish(ms === 0 ? 'immediate' : `t+${ms}ms`, ms), ms);
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
/*
 * ★v0.1.1382: 記録エンジンが書いた「コメント書き込みモード」を定期的に読む。
 *
 * ■ 掟(過去に踏んだ地雷を避ける)
 *   1. **1キーだけ**読む(`get([1キー])`=数ms)。全件読みは絶対にしない
 *      ＝この計器自身が症状(スレッド凍結)の原因になっては本末転倒。
 *   2. **await を boot の直列経路に置かない**(fire-and-forget)。
 *      [[unbounded-await-at-boot-makes-page-blank-2026-08-12]]:
 *      boot の無界awaitは1箇所でもページを永久に白紙にする。
 *   3. 失敗しても黙って諦める(値は null のまま=「未観測」と正しく表示される)。
 */
function refreshCommentWriteModeDiag() {
  try {
    const p = chrome?.storage?.local?.get?.(KEY_COMMENT_WRITE_MODE_DIAG);
    if (!p || typeof p.then !== 'function') return;
    p.then((bag) => {
      const v = bag && bag[KEY_COMMENT_WRITE_MODE_DIAG];
      if (v && typeof v === 'object') _commentWriteModeDiag = v;
    }).catch(() => {
      /* no-op: 読めなければ未観測のまま(嘘の✅を出さない) */
    });
  } catch {
    /* no-op */
  }
}

// 初回 + 以後は観測のたびに更新する(記録中は値が動くので最新を出す)。
refreshCommentWriteModeDiag();

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
