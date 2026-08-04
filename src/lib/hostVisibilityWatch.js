/**
 * パネルが「実際に見えなくなった瞬間」を、原因の種類を問わず捕らえる見張り(純関数群)。
 *
 * ★v0.1.1253 の動機(2026-08-04・ユーザー実機で症状が継続):
 *   これまでの計器は【なぜ消えたか】を先に決めて、その経路だけを数えていた。
 *     - hostMoveDiag        : 親を変える移設だけ
 *     - scrollWhiteoutDiag  : scroll イベント中だけ
 *     - hostFlipCensus      : style.display の書き換えだけ
 *   どれも「作った人が想定した原因」しか見ないので、想定外の消え方は 0回 と出る。
 *   実際、録画で観測したのは【幅 920px → 11px】であり display ではなかった。
 *   → 原因を先に決めず、【結果(見えているか)】だけを毎フレーム測る。
 *
 * ■ 何を「消えた」とみなすか
 *   実測の矩形(getBoundingClientRect)が、直前フレームでは十分大きかったのに
 *   今フレームで極端に小さい/ゼロになった、という遷移。display/visibility/幅潰れ/
 *   親ごと外れる、のどれでも同じように引っかかる。
 *
 * ■ 何を記録するか(犯人を名指しするため)
 *   - 消えた瞬間の寸法(prev→now)と、どの軸が潰れたか(幅だけ/高さだけ/両方)
 *   - 何フレーム続いたか(1フレームなら「ちらつき」、続くなら「消えたまま」)
 *   - 間隔が一定かどうか(=タイマー由来かの判定)
 *   - そのときの computed な見え方(display/visibility/opacity)と親の有無
 *     ★これが「原因の候補」を絞る材料になる。ここで初めて原因の話をする。
 *
 * ■ 設計の掟(過去の事故から)
 *   - 0 の意味を区別する: 観測フレーム数を必ず併記する
 *     ([[zero-count-may-mean-unmeasured-2026-08-04]])
 *   - paint 毎の DOM 走査は禁止(v0.1.1201 で自分が拡張全体を重くした)。
 *     → 走査はせず、既に持っている host 参照1つの矩形だけを読む。O(1)。
 *   - サンプルはリング cap。速報(lite)に載せても軽いこと。
 */

/** 「見えている」とみなす最小の寸法(px)。これ未満は実質不可視。 */
export const HOST_VISIBLE_MIN_W = 40;
export const HOST_VISIBLE_MIN_H = 24;
/** 保持するサンプル上限(速報を膨らませない)。 */
export const HOST_WATCH_SAMPLE_MAX = 8;
/** 周期判定に必要な最小の消失回数。 */
export const HOST_WATCH_PERIOD_MIN_SAMPLES = 3;

/**
 * 消失1件の記録。原因の候補を絞る材料をここに全部入れる。
 * @typedef {{
 *   atMs: number, prevW: number, prevH: number, nowW: number, nowH: number,
 *   axis: 'width'|'height'|'both'|'none',
 *   display: string, visibility: string, opacity: string,
 *   connected: boolean, parentTag: string
 * }} HostVanishSample
 */

/**
 * @returns {{
 *   frames: number, vanishCount: number, oneFrameVanishCount: number,
 *   currentlyHidden: boolean, hiddenFrames: number, maxHiddenFrames: number,
 *   samples: HostVanishSample[], lastVanishAtMs: number|null, gapsMs: number[],
 *   prev: { w: number, h: number, visible: boolean }|null
 * }}
 */
export function createHostVisibilityWatch() {
  return {
    frames: 0,
    vanishCount: 0,
    oneFrameVanishCount: 0,
    currentlyHidden: false,
    hiddenFrames: 0,
    maxHiddenFrames: 0,
    samples: [],
    lastVanishAtMs: null,
    gapsMs: [],
    prev: null
  };
}

/**
 * 実測が「見えている」か。寸法が閾値以上あることだけで判定する
 * (display/visibility を見ない=どんな消え方でも同じ扱いにするため)。
 * @param {{ w?: number, h?: number }|null|undefined} rect
 */
export function isRectVisible(rect) {
  const w = Number(rect?.w) || 0;
  const h = Number(rect?.h) || 0;
  return w >= HOST_VISIBLE_MIN_W && h >= HOST_VISIBLE_MIN_H;
}

/**
 * どの軸が潰れたかを名指しする。
 * @param {{w:number,h:number}} prev
 * @param {{w:number,h:number}} now
 * @returns {'width'|'height'|'both'|'none'}
 */
export function classifyCollapse(prev, now) {
  const wLost = (Number(now?.w) || 0) < HOST_VISIBLE_MIN_W && (Number(prev?.w) || 0) >= HOST_VISIBLE_MIN_W;
  const hLost = (Number(now?.h) || 0) < HOST_VISIBLE_MIN_H && (Number(prev?.h) || 0) >= HOST_VISIBLE_MIN_H;
  if (wLost && hLost) return 'both';
  if (wLost) return 'width';
  if (hLost) return 'height';
  return 'none';
}

/**
 * 1フレーム分の観測を記録する。呼び出し側は host の矩形と computed 値を渡すだけ。
 *
 * @param {ReturnType<typeof createHostVisibilityWatch>} watch
 * @param {{
 *   nowMs: number,
 *   rect: { w: number, h: number },
 *   display?: string, visibility?: string, opacity?: string,
 *   connected?: boolean, parentTag?: string
 * }} obs
 */
export function noteHostFrame(watch, obs) {
  if (!watch || typeof watch !== 'object') return;
  const now = { w: Number(obs?.rect?.w) || 0, h: Number(obs?.rect?.h) || 0 };
  const visibleNow = isRectVisible(now);
  watch.frames = (Number(watch.frames) || 0) + 1;

  const prev = watch.prev;
  // 初回は比較対象が無いので状態だけ覚える。
  if (!prev) {
    watch.prev = { w: now.w, h: now.h, visible: visibleNow };
    watch.currentlyHidden = !visibleNow;
    return;
  }

  if (!visibleNow) {
    watch.hiddenFrames = (Number(watch.hiddenFrames) || 0) + 1;
    if (watch.hiddenFrames > watch.maxHiddenFrames) watch.maxHiddenFrames = watch.hiddenFrames;
  }

  // ★消えた瞬間(見えていた → 見えない)だけを1件として数える。
  if (prev.visible && !visibleNow) {
    watch.vanishCount = (Number(watch.vanishCount) || 0) + 1;
    const at = Number(obs?.nowMs) || 0;
    if (watch.lastVanishAtMs != null) {
      const gap = at - watch.lastVanishAtMs;
      if (gap > 0) watch.gapsMs.push(gap);
      if (watch.gapsMs.length > 32) watch.gapsMs.shift();
    }
    watch.lastVanishAtMs = at;
    watch.hiddenFrames = 1;
    if (watch.samples.length < HOST_WATCH_SAMPLE_MAX) {
      watch.samples.push({
        atMs: at,
        prevW: Math.round(prev.w), prevH: Math.round(prev.h),
        nowW: Math.round(now.w), nowH: Math.round(now.h),
        axis: classifyCollapse(prev, now),
        display: String(obs?.display || ''),
        visibility: String(obs?.visibility || ''),
        opacity: String(obs?.opacity || ''),
        connected: obs?.connected !== false,
        parentTag: String(obs?.parentTag || '')
      });
    }
  }

  // 復帰(見えない → 見えた)。1フレームだけの消失は「ちらつき」として別に数える。
  if (!prev.visible && visibleNow) {
    if (watch.hiddenFrames === 1) watch.oneFrameVanishCount = (Number(watch.oneFrameVanishCount) || 0) + 1;
    watch.hiddenFrames = 0;
  }

  watch.prev = { w: now.w, h: now.h, visible: visibleNow };
  watch.currentlyHidden = !visibleNow;
}

/**
 * 消失の間隔が一定か(=タイマー由来か)を判定する。
 * ばらつく場合は周期と呼ばない(誤報しないため)。
 * @param {number[]} gapsMs
 * @returns {{ periodic: boolean, periodMs: number, cv: number }}
 */
export function analyzeVanishPeriod(gapsMs) {
  const gaps = Array.isArray(gapsMs) ? gapsMs.filter((g) => Number.isFinite(g) && g > 0) : [];
  if (gaps.length < HOST_WATCH_PERIOD_MIN_SAMPLES - 1) return { periodic: false, periodMs: 0, cv: -1 };
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (!(mean > 0)) return { periodic: false, periodMs: 0, cv: -1 };
  const variance = gaps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;
  // 変動係数 15% 未満なら「一定間隔」とみなす(録画で観測した 4.000秒 は cv≈0)。
  return { periodic: cv < 0.15, periodMs: Math.round(mean), cv: Math.round(cv * 1000) / 1000 };
}

/**
 * 速報用スナップショット(lite に載せる小さな形)。
 * @param {ReturnType<typeof createHostVisibilityWatch>} watch
 */
export function snapshotHostVisibilityWatch(watch) {
  const w = watch && typeof watch === 'object' ? watch : null;
  if (!w) return null;
  const period = analyzeVanishPeriod(w.gapsMs);
  return {
    frames: Number(w.frames) || 0,
    vanishCount: Number(w.vanishCount) || 0,
    oneFrameVanishCount: Number(w.oneFrameVanishCount) || 0,
    currentlyHidden: w.currentlyHidden === true,
    maxHiddenFrames: Number(w.maxHiddenFrames) || 0,
    periodic: period.periodic,
    periodMs: period.periodMs,
    cv: period.cv,
    samples: Array.isArray(w.samples) ? w.samples.slice(0, HOST_WATCH_SAMPLE_MAX) : []
  };
}

/**
 * 状態速報の1行(+根拠行)。★0 の意味を必ず区別する。
 * @param {{
 *   frames?: number, vanishCount?: number, oneFrameVanishCount?: number,
 *   currentlyHidden?: boolean, maxHiddenFrames?: number,
 *   periodic?: boolean, periodMs?: number, cv?: number,
 *   samples?: Partial<HostVanishSample>[]
 * }|null|undefined} snap
 * @returns {string}
 */
export function formatHostVisibilityWatchLine(snap) {
  const s = snap && typeof snap === 'object' ? snap : null;
  if (!s) return '';
  const frames = Number(s.frames) || 0;
  // ★観測フレームが少なすぎるうちは「異常なし」と言わない(起動直後の 0 を緑と誤読しない)。
  if (frames < 60) {
    return `パネル可視 ⚪ 未計測(観測${frames}フレーム=まだ判定できません。数十秒開いたまま置いてください)`;
  }
  const vanish = Number(s.vanishCount) || 0;
  if (vanish <= 0) {
    return `パネル可視 ✅ 消失なし(${frames}フレーム観測=判定済み)`;
  }
  const lines = [];
  const oneFrame = Number(s.oneFrameVanishCount) || 0;
  lines.push(
    `パネル可視 ⚠ ${vanish}回消失(うち一瞬だけ ${oneFrame}回) / ${frames}フレーム観測`
  );
  if (s.periodic && Number(s.periodMs) > 0) {
    lines.push(`  → ★${(Number(s.periodMs) / 1000).toFixed(1)}秒ちょうどの周期で消えています=タイマーが原因(誤差${s.cv})`);
  }
  const first = Array.isArray(s.samples) && s.samples.length ? s.samples[0] : null;
  if (first) {
    const axisJa = first.axis === 'width' ? '幅が潰れた'
      : first.axis === 'height' ? '高さが潰れた'
        : first.axis === 'both' ? '幅も高さも潰れた' : '寸法以外の理由';
    lines.push(
      `  → 消えた瞬間: ${first.prevW}x${first.prevH} → ${first.nowW}x${first.nowH}(${axisJa})` +
      ` / display:${first.display || '-'} visibility:${first.visibility || '-'} opacity:${first.opacity || '-'}` +
      ` / 親:${first.parentTag || '-'}${first.connected ? '' : ' ★DOMから外れています'}`
    );
  }
  if (s.currentlyHidden) lines.push('  → ★いまも見えていません(消えたまま)');
  return lines.join('\n');
}
