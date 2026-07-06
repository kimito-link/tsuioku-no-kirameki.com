/**
 * 配信採点「発表演出」用のハイライト台帳(council/broadcast-scoring-SYNTHESIS.md §2.2・SC2)。
 *
 * ★裁定(設計書§2.2): `playCuedEffectSound` は avCue 系WIP(別件・中断中・触らない)のため未実装。
 *   代わりに、現行で実際に発火が確定している演出だけを記録する:
 *     - ギフト/広告の効果音(`playEffectSound` 系が戻り値 `'played'` を返した瞬間。
 *       tier が gift_large 以上(gift_large/gift_mega)・milestone_hard 以上
 *       (milestone_hard/milestone_jackpot)のみ)
 *     - フェーズ遷移(リーチ/突破/大当たり到達。bgmPhaseDiag と同じ判定=`result.changed && !result.silent`)
 *   「実際に画面/音に出た演出だけを記録する」= 見てない演出が結果に出る構造を防止(HANDOFF既決)。
 *
 * 1行 = `{ at: number, kind: string, label: string }`。label は決定論テンプレ固定文字列のみ
 *   (コメント本文・ユーザー名は一切含めない・軽量制約)。
 *
 * @typedef {{ at: number, kind: string, label: string }} HighlightRow
 * @typedef {{ liveId: string, rows: HighlightRow[], capturedAt: number }} HighlightLedger
 */

/** 台帳の上限件数(古い順に切り詰める・appendTrendSample と同型のcap)。 */
export const HIGHLIGHT_LEDGER_CAP = 50;

/** 発表演出「3選」で選ぶ件数。 */
export const HIGHLIGHT_PICK_COUNT = 3;

/** 記録対象の kind → 表示ラベルの決定論テンプレ(乱数選択禁止・固定辞書)。 */
export const HIGHLIGHT_KIND_LABEL = Object.freeze({
  gift_large: 'ギフト大波(large)',
  gift_mega: 'ギフト大波(mega)',
  milestone_hard: 'コメント節目(500件)',
  milestone_jackpot: 'コメント節目 大当たり(1000件以上)',
  phase_reach: 'リーチ到達',
  phase_breakthrough: '突破到達',
  phase_jackpot: '大当たり到達'
});

/**
 * 台帳に記録してよい kind か(§2.2: gift_large以上/breakthrough/jackpot/milestone_hard以上+
 *   フェーズ遷移のみ)。
 * @param {string} kind
 * @returns {boolean}
 */
export function isHighlightWorthyKind(kind) {
  return Object.prototype.hasOwnProperty.call(HIGHLIGHT_KIND_LABEL, String(kind || ''));
}

/** @param {unknown} x @returns {number} */
function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * raw(storage由来)を安全に HighlightLedger へ正規化する(壊れた値は捨てる)。
 * @param {unknown} raw
 * @returns {HighlightLedger}
 */
function normalizeLedger(raw) {
  const r = raw && typeof raw === 'object' ? /** @type {any} */ (raw) : {};
  const rowsSrc = Array.isArray(r.rows) ? r.rows : [];
  /** @type {HighlightRow[]} */
  const rows = [];
  for (const it of rowsSrc) {
    if (!it || typeof it !== 'object') continue;
    const at = num(it.at);
    const kind = String(it.kind || '');
    const label = String(it.label || '');
    if (at <= 0 || !kind || !label) continue;
    rows.push({ at, kind, label });
  }
  return { liveId: String(r.liveId || ''), rows, capturedAt: num(r.capturedAt) };
}

/**
 * 初期(空)台帳。
 * @param {string} [liveId]
 * @returns {HighlightLedger}
 */
export function makeInitialHighlightLedger(liveId = '') {
  return { liveId: String(liveId || ''), rows: [], capturedAt: 0 };
}

/**
 * ハイライト1件を台帳に追記する純関数(append+cap)。liveId が既存台帳と異なる場合は
 *   新しい配信として台帳を置換する(resetVoiceGateStateForLiveIfChangedと同型・
 *   古い配信のハイライトを新しい配信へ持ち越さない)。記録対象外の kind は何もせず既存を返す
 *   (呼び出し側で isHighlightWorthyKind を通す前提だが、二重チェックとして安全側に倒す)。
 * @param {unknown} prevRaw 既存 HighlightLedger(storage由来)
 * @param {{ liveId: string, kind: string, atMs: number }} entry
 * @returns {HighlightLedger}
 */
export function appendHighlight(prevRaw, entry) {
  const liveId = String(entry?.liveId || '').trim().toLowerCase();
  const kind = String(entry?.kind || '');
  const atMs = num(entry?.atMs);
  if (!liveId || !kind || atMs <= 0 || !isHighlightWorthyKind(kind)) {
    return normalizeLedger(prevRaw);
  }
  const prev = normalizeLedger(prevRaw);
  const rows = prev.liveId === liveId ? prev.rows.slice() : [];
  rows.push({ at: atMs, kind, label: /** @type {Record<string, string>} */ (HIGHLIGHT_KIND_LABEL)[kind] });
  const capped = rows.length > HIGHLIGHT_LEDGER_CAP ? rows.slice(rows.length - HIGHLIGHT_LEDGER_CAP) : rows;
  return { liveId, rows: capped, capturedAt: atMs };
}

/** kind → 選抜時の重み(降順ソート用・大きいほど優先)。 @type {Readonly<Record<string, number>>} */
const HIGHLIGHT_TIER_WEIGHT = Object.freeze({
  phase_jackpot: 100,
  gift_mega: 90,
  milestone_jackpot: 85,
  phase_breakthrough: 70,
  gift_large: 60,
  milestone_hard: 50,
  phase_reach: 30
});

/**
 * ハイライト3選を選ぶ純関数(§2.2): tier重み降順 → 同点は早い順(at昇順) → kind重複は1件まで
 *   → 先頭 HIGHLIGHT_PICK_COUNT 件。乱数なし・決定論(同じ入力には常に同じ結果)。
 * @param {HighlightRow[]|null|undefined} rows
 * @returns {HighlightRow[]}
 */
export function pickTopHighlights(rows) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object' && isHighlightWorthyKind(r.kind)) : [];
  const sorted = list.slice().sort((a, b) => {
    const wa = HIGHLIGHT_TIER_WEIGHT[a.kind] || 0;
    const wb = HIGHLIGHT_TIER_WEIGHT[b.kind] || 0;
    if (wa !== wb) return wb - wa; // tier重み降順。
    return num(a.at) - num(b.at); // 同点は早い順。
  });
  /** @type {HighlightRow[]} */
  const picked = [];
  const seenKinds = new Set();
  for (const row of sorted) {
    if (seenKinds.has(row.kind)) continue; // kind重複は1件まで。
    seenKinds.add(row.kind);
    picked.push(row);
    if (picked.length >= HIGHLIGHT_PICK_COUNT) break;
  }
  return picked;
}

/**
 * 状態速報に出す行群を作る純関数(extras相乗り・bgmPhaseDiag.jsのbuildBgmPhaseDiagLinesと同型)。
 *   台帳が空(このセッションでハイライトが一度も記録されていない)なら空配列(ノイズにしない)。
 * @param {unknown} snap 台帳(storage由来のraw値でよい・内部でnormalizeする)
 * @param {number} nowMs 現在時刻(最終記録 ago の算出用)
 * @returns {string[]}
 */
export function buildHighlightLedgerDiagLines(snap, nowMs) {
  const ledger = normalizeLedger(snap);
  if (ledger.rows.length === 0) return [];
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const lastAt = ledger.rows[ledger.rows.length - 1].at;
  const agoText = now > 0 ? ` / 最終${Math.max(0, Math.round((now - lastAt) / 1000))}秒前` : '';
  const top = pickTopHighlights(ledger.rows);
  const topText = top.length ? ` / 上位: ${top.map((r) => r.label).join(' / ')}` : '';
  return [`配信採点ハイライト台帳: ${ledger.rows.length}件${agoText}${topText}`];
}
