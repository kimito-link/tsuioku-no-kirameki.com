/**
 * storyUserLaneClickAffordanceParity.js — ①POP応援レーンの「クリック不能な手カーソル」実害確定計器
 *   (診断先行アプローチ)。
 *
 * 背景: ユーザー実機報告「広告列(名無し・あ・おにぎりどろぼう)がマウスオーバーで手のマークになるのに
 *   クリックできない」。タイル本体(personTileDom.js の buildPersonTileEl)は数値ID かつ
 *   nicoUserPageUrl が非空のときだけ <a class="nl-story-userlane-cell--linkable">(cursor:pointer)を
 *   生成し、それ以外は <span>(cursor指定なし)になる設計で、コード上は矛盾がない。
 *
 *   本モジュールは「直す」のではなく「実害の有無・頻度を数える」ことだけが目的(観測のみ)。
 *   掟(venueYukkuriNamedCensus.js と同じ): 数えるだけ・DOM/データを一切触らない。
 *
 * 制約: 呼び出し元(renderStoryUserLaneDom.js の fillLaneTier)は diff-skip(前回と同一 items なら
 *   buildPersonTileEl を呼ばずタイルを温存する最適化)を持つため、本モジュールが観測できるのは
 *   「そのpaintで新規生成されたタイル」のみ。diff-skipで温存された既存タイルは対象外(=実際の不一致
 *   件数より少なく出る可能性がある)。
 *
 * @module storyUserLaneClickAffordanceParity
 */

/**
 * @returns {{ checked: number, mismatched: number, lastSample: null | { tag: string, cursor: string, title: string } }}
 */
export function createStoryUserLaneClickAffordanceParityState() {
  return { checked: 0, mismatched: 0, lastSample: null };
}

/**
 * ①POP応援レーンの1タイル(buildPersonTileEl の戻り要素)を観測する。呼び出し側は
 * fillLaneTier のタイル生成ループ内で、生成済み tileEl と item をそのまま渡す(新規計算なし)。
 * 対象は SPAN/TD(応援レーンのタイル本体・投げ一覧テーブルのセル)。A/BUTTON はクリックハンドラを
 * 自前で持つ実体なので対象外(cursor:pointerが付いていて正常)。
 * @param {ReturnType<typeof createStoryUserLaneClickAffordanceParityState>|null|undefined} state
 * @param {{ tileEl?: Element|null, title?: unknown }} obs
 */
export function observeStoryUserLaneClickAffordance(state, obs) {
  if (!state || typeof state !== 'object' || !obs || typeof obs !== 'object') return;
  const el = obs.tileEl;
  if (!el || typeof el !== 'object' || typeof el.tagName !== 'string') return;
  const tag = el.tagName.toUpperCase();
  if (tag !== 'SPAN' && tag !== 'TD') return;

  let cursor = '';
  try {
    const view = el.ownerDocument && el.ownerDocument.defaultView;
    if (view && typeof view.getComputedStyle === 'function') {
      cursor = String(view.getComputedStyle(el).cursor || '').trim();
    }
  } catch {
    return; // 計測不能(jsdom等)は数えない=誤報しない
  }
  if (!cursor) return; // 計測できていない(未対応環境)は対象外

  state.checked += 1;
  if (cursor !== 'pointer') return; // 実体どおり=正常

  state.mismatched += 1;
  state.lastSample = { tag, cursor, title: String(obs.title || '').trim().slice(0, 40) };
}

/**
 * 状態速報1行を作る。checked=0(未観測)は⚪(誤報しない)。
 * @param {ReturnType<typeof createStoryUserLaneClickAffordanceParityState>|null|undefined} state
 * @returns {{ line: string, checked: number, mismatched: number,
 *   lastSample: null | { tag: string, cursor: string, title: string } } | null}
 */
export function toStoryUserLaneClickAffordanceParityDiag(state) {
  if (!state || typeof state !== 'object') return null;
  let line;
  if (state.checked <= 0) {
    line = 'クリック不能カーソル ⚪ 未観測';
  } else if (state.mismatched === 0) {
    line = `クリック不能カーソル ✅ 検${state.checked}`;
  } else {
    const s = state.lastSample;
    line =
      `クリック不能カーソル 🔴 ${state.mismatched}件 / 検${state.checked}` +
      (s ? ` / 直近{${s.title || '(名称無)'} tag=${s.tag} cursor=${s.cursor}}` : '');
  }
  return {
    line,
    checked: state.checked,
    mismatched: state.mismatched,
    lastSample: state.lastSample ? { ...state.lastSample } : null
  };
}
