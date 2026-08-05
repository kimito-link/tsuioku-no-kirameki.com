/**
 * パネルの style 書き換えを「経路を問わず」捕らえ、呼び出し元を名指しする計器(純関数)。
 *
 * ★v0.1.1261 の動機(2026-08-05・実測が矛盾を示した):
 *   hostVisWatch(rAF実測)は 8回の消失を検知しているのに、
 *   hostHideReason は autoshow_off 4回しか記録していない。
 *   さらに v0.1.1260 で取りこぼしを塞いだのに `display:*` の記録が【1件も出ない】。
 *
 *   = hidePageFrameOverlay が呼ばれた時点で【既に display:none】だった。
 *     つまり消しているのは別の何かで、hidePageFrameOverlay は後追いで念押ししているだけ。
 *
 * ■ 既存計器がここを測れない理由(構造)
 *   hostHideReason は setInlineHostDisplay / hidePageFrameOverlay を【通った場合だけ】数える。
 *   関数を通らない書き換え(CSSクラス付け外し・cssText一括代入・
 *   別モジュールからの直接代入・ページ側スクリプト)は原理的に見えない。
 *   ([[zero-count-may-mean-unmeasured-2026-08-04]] の再演)
 *
 * ■ この計器の方針
 *   「誰が呼んだか」を関数の内側で数えるのをやめ、
 *   【DOM の属性が変わった事実】そのものを MutationObserver で捕らえる。
 *   変化を検知した時点で Error().stack を採ると、経路を問わず呼び出し元が分かる。
 *
 * ■ 設計の掟
 *   - 0 の意味を区別する: 観測した変化の総数を必ず併記する
 *   - サンプルはリング cap。stack は先頭数行だけ(速報を膨らませない)
 *   - stack 取得は「見えている→消えた」の遷移時だけ(毎回だと重い)
 */

/** 保持するサンプル上限。 */
export const STYLE_TRACE_SAMPLE_MAX = 6;
/** stack から拾う行数(先頭は Error 自身なので落とす)。 */
export const STYLE_TRACE_STACK_LINES = 4;

/**
 * @returns {{ total: number, hideCount: number, samples: Array<object>, lastAtMs: number|null }}
 */
export function createHostStyleMutationTrace() {
  return { total: 0, hideCount: 0, samples: [], lastAtMs: null };
}

/**
 * スタック文字列から「呼び出し元らしい行」を抜き出す。
 * 拡張のファイル名だけ残し、ノイズ(Error / この計器自身)は落とす。
 *
 * @param {unknown} stack
 * @returns {string[]}
 */
export function extractCallerFrames(stack) {
  const raw = String(stack ?? '');
  if (!raw) return [];
  return raw
    .split('\n')
    .map((ln) => ln.trim())
    .filter((ln) => ln.startsWith('at '))
    // この計器自身のフレームは犯人ではないので落とす。
    .filter((ln) => !/hostStyleMutationTrace|noteHostStyleMutation|extractCallerFrames/.test(ln))
    .slice(0, STYLE_TRACE_STACK_LINES)
    // chrome-extension://<id>/ を落として読みやすくする(IDは環境ごとに違い比較の邪魔)。
    .map((ln) => ln.replace(/chrome-extension:\/\/[a-z]+\//gi, ''));
}

/**
 * 1件の style 変化を記録する。
 *
 * @param {ReturnType<typeof createHostStyleMutationTrace>} trace
 * @param {{
 *   nowMs: number,
 *   becameHidden: boolean,
 *   display?: string, opacity?: string, visibility?: string,
 *   width?: number, height?: number,
 *   stack?: unknown
 * }} obs
 */
export function noteHostStyleMutation(trace, obs) {
  if (!trace || typeof trace !== 'object') return;
  trace.total = (Number(trace.total) || 0) + 1;
  trace.lastAtMs = Number(obs?.nowMs) || 0;
  if (obs?.becameHidden !== true) return;

  trace.hideCount = (Number(trace.hideCount) || 0) + 1;
  if (trace.samples.length >= STYLE_TRACE_SAMPLE_MAX) return;
  trace.samples.push({
    atMs: Number(obs?.nowMs) || 0,
    display: String(obs?.display || ''),
    opacity: String(obs?.opacity || ''),
    visibility: String(obs?.visibility || ''),
    w: Math.round(Number(obs?.width) || 0),
    h: Math.round(Number(obs?.height) || 0),
    callers: extractCallerFrames(obs?.stack)
  });
}

/**
 * 速報用スナップショット。
 * @param {ReturnType<typeof createHostStyleMutationTrace>} trace
 */
export function snapshotHostStyleMutationTrace(trace) {
  const t = trace && typeof trace === 'object' ? trace : null;
  if (!t) return null;
  return {
    total: Number(t.total) || 0,
    hideCount: Number(t.hideCount) || 0,
    samples: Array.isArray(t.samples) ? t.samples.slice(0, STYLE_TRACE_SAMPLE_MAX) : []
  };
}

/**
 * 状態速報の行。★0 の意味を区別し、犯人(呼び出し元)を名指しする。
 * @param {{ total?: number, hideCount?: number, samples?: Array<any> }|null|undefined} snap
 * @returns {string}
 */
export function formatHostStyleMutationLine(snap) {
  const s = snap && typeof snap === 'object' ? snap : null;
  if (!s) return '';
  const total = Number(s.total) || 0;
  if (total <= 0) {
    return 'パネルの書き換え ⚪ 未計測(style の変化を0回観測=まだ判定できません)';
  }
  const hide = Number(s.hideCount) || 0;
  if (hide <= 0) {
    return `パネルの書き換え ✅ 消す変更なし(style変化を${total}回観測=判定済み)`;
  }
  const lines = [`パネルの書き換え ⚠ ${hide}回消えました(style変化${total}回を観測)`];
  const first = Array.isArray(s.samples) && s.samples.length ? s.samples[0] : null;
  if (first) {
    lines.push(
      `  → 消えた瞬間: ${first.w}x${first.h}` +
      ` / display:${first.display || '-'} opacity:${first.opacity || '-'} visibility:${first.visibility || '-'}`
    );
    const callers = Array.isArray(first.callers) ? first.callers : [];
    if (callers.length) {
      lines.push('  → ★書き換えた場所:');
      for (const c of callers) lines.push(`     ${c}`);
    } else {
      lines.push('  → 呼び出し元を取得できませんでした(CSS/外部スクリプト由来の可能性)');
    }
  }
  return lines.join('\n');
}
