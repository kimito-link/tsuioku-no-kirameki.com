// @ts-nocheck — 任意の jsonBlob を歩く動的判定
/**
 * 純Web応援ライブビューの「スナップショット丸ごと1枚の鮮度」判定（council/liveview-wholesale-root-SYNTHESIS.md 第1段）。
 *
 * 狙い = 純Web(app/live-view)が「全レーンが揃って出る」ようにする。これまで各鏡(laneMirror/statCardsMirror/
 *   northStarMirror)を【別々の capturedAt で個別に鮮度判定】していたため、1つでも古いとそのレーンだけ消え、
 *   結果「数字カードは17分前で鮮度切れ・北極星だけ出る…」のように永久に揃わなかった。
 *   → スナップショットは status が【1回の描画ループで全鏡をまとめて1枚の jsonBlob にして POST する】ので、
 *     その jsonBlob 全体が「いつ撮られたか」を1つの基準時刻(generatedAt or 各鏡 capturedAt の最大)で持つ。
 *     全セクションはこの【単一の鮮度判定】で一斉に出す/一斉に「古い」とする＝per-section ドロップを廃止する。
 *
 * ★制約: 純関数(chrome 非依存・副作用なし)。app/live-view.js が使う。
 *
 * @module liveviewSnapshotFreshness
 */

/** 既定の鮮度しきい値(3分)。app/live-view.js の MIRROR_FRESH_MS と同値。 */
export const SNAPSHOT_FRESH_MS = 3 * 60 * 1000;

/** epoch ms を数値化(取れなければ 0)。 */
function toEpochMs(v) {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  // ISO 文字列(generatedAt)も受ける。
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) && t > 0 ? t : 0;
}

/**
 * jsonBlob 全体の「基準時刻」を1つ決める。
 *   優先1 = 明示の snapshotMeta.capturedAt(将来 status が打つ統合タイムスタンプ)。
 *   優先2 = 各鏡 capturedAt の【最大】(=最も新しく publish された鏡の時刻。全鏡は同じ描画ループで束ねられる)。
 *   優先3 = generatedAt(jsonBlob 生成時刻の ISO)。
 * @param {object|null} jsonBlob
 * @returns {number} epoch ms(取れなければ 0)
 */
export function resolveSnapshotCapturedAt(jsonBlob) {
  const b = jsonBlob && typeof jsonBlob === 'object' ? jsonBlob : null;
  if (!b) return 0;
  const metaAt = toEpochMs(b.snapshotMeta && b.snapshotMeta.capturedAt);
  if (metaAt) return metaAt;
  const candidates = [
    b.laneMirror && b.laneMirror.capturedAt,
    b.statCardsMirror && b.statCardsMirror.capturedAt,
    b.northStarMirror && b.northStarMirror.capturedAt
  ].map(toEpochMs).filter((n) => n > 0);
  if (candidates.length) return Math.max(...candidates);
  return toEpochMs(b.generatedAt);
}

/**
 * スナップショット丸ごとの鮮度を1回だけ判定する。全セクションはこの結果で一斉に出す/一斉に「古い」とする。
 * @param {object|null} jsonBlob
 * @param {number} nowMs
 * @param {number} [freshMs]
 * @returns {{ capturedAt: number, ageMs: number|null, fresh: boolean, hasTimestamp: boolean }}
 */
export function evaluateSnapshotFreshness(jsonBlob, nowMs, freshMs = SNAPSHOT_FRESH_MS) {
  const capturedAt = resolveSnapshotCapturedAt(jsonBlob);
  const now = Number(nowMs) || 0;
  if (!capturedAt || !now) {
    // 時刻が取れない=鮮度判定不能。古いと断じて全部消すと「タイムスタンプ未実装の鏡で全消し」になるので、
    //   ここでは fresh=true(出す)に倒す(per-section ドロップ廃止の趣旨=揃えて出す)。hasTimestamp で識別可能。
    return { capturedAt: capturedAt || 0, ageMs: null, fresh: true, hasTimestamp: false };
  }
  const ageMs = Math.max(0, now - capturedAt);
  return { capturedAt, ageMs, fresh: ageMs <= freshMs, hasTimestamp: true };
}

/**
 * 「古い」ときに純Webへ出す1行バナーの文言(全レーンに散らさず1箇所で出す)。
 * @param {{ ageMs: number|null, fresh: boolean, hasTimestamp: boolean }} ev evaluateSnapshotFreshness の戻り
 * @returns {string} 鮮度OK or 判定不能なら ''(バナー不要)
 */
export function formatSnapshotStalenessBanner(ev) {
  const e = ev && typeof ev === 'object' ? ev : null;
  if (!e || e.fresh || !e.hasTimestamp || e.ageMs == null) return '';
  const sec = Math.round(e.ageMs / 1000);
  const ago = sec < 90 ? `${sec}秒前` : `${Math.round(sec / 60)}分前`;
  return `この画面は${ago}の状態です。最新にするには PC 側で「🌐このURLをWEBでも公開する」をもう一度押してください。`;
}
