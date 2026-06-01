/**
 * 開発用ホットリロードのシグナル判定（純関数）。
 *
 * 目的（手動 reload 卒業・2026-06-01）:
 *   `npm run build:watch` がリビルドのたびに `extension/dist/dev-reload-id.txt` へ
 *   新しい id（ビルド時刻 ms）を書き出す。content script（dev ビルドのみ）が定期的に
 *   その id を読み、前回観測値から変わっていたら SW にリロードを依頼する。
 *
 * この純関数は「観測した raw 文字列」と「前回ベースライン」から、リロードすべきかと
 * 次のベースラインだけを返す。fetch・タイマー・chrome API には一切触れない（テスト可能）。
 *
 * 状態機械:
 *   - baselineId === null（初回観測）→ ベースラインに採用するだけ。リロードしない。
 *     （拡張ロード直後に既存ファイルを読んで即リロードする無限ループを防ぐ）
 *   - id が baselineId と異なる → リロードする。ベースラインを id に更新。
 *   - id が baselineId と同じ → 何もしない。
 *   - id が空/不正 → 何もしない（ファイル未生成・読み取り失敗は無視）。
 *
 * @module devReloadSignal
 */

/**
 * @typedef {{ baselineId: string|null }} DevReloadState
 */

/** @returns {DevReloadState} 初期状態（まだ何も観測していない）。 */
export function createDevReloadState() {
  return { baselineId: null };
}

/**
 * raw シグナル文字列を正規化して id を取り出す。空白除去後、空なら null。
 * @param {unknown} raw
 * @returns {string|null}
 */
export function parseDevReloadId(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // 想定は数値 ms 文字列だが、将来の hash 等にも備え英数記号のみ・長すぎは弾く。
  if (s.length > 128) return null;
  if (!/^[\w.:-]+$/.test(s)) return null;
  return s;
}

/**
 * 観測した raw シグナルを適用し、次状態とリロード要否を返す（純関数）。
 * @param {DevReloadState} state
 * @param {unknown} raw 直近に読み取った dev-reload-id.txt の中身。
 * @returns {{ state: DevReloadState, shouldReload: boolean, id: string|null }}
 */
export function applyDevReloadSignal(state, raw) {
  const prev = state && typeof state === 'object' ? state : createDevReloadState();
  const id = parseDevReloadId(raw);
  if (id == null) {
    return { state: { baselineId: prev.baselineId ?? null }, shouldReload: false, id: null };
  }
  if (prev.baselineId == null) {
    // 初回観測: ベースラインに採用するだけ（即リロードしない）。
    return { state: { baselineId: id }, shouldReload: false, id };
  }
  if (id !== prev.baselineId) {
    return { state: { baselineId: id }, shouldReload: true, id };
  }
  return { state: { baselineId: prev.baselineId }, shouldReload: false, id };
}
