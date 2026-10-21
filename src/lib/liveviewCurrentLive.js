/**
 * 【層】L0 判定層(純粋関数)
 * 【この箱に入るもの】スマホの WEB版(app/live-view)が「いま映している1配信」をまとめ(jsonBlob)から決める判定
 * 【この箱に入らないもの】DOM・fetch・ページの再読み込み(app/live-view.js が行う)
 *
 * ★なぜ(2026-10-21・スマホは1配信だけ・2026-10-21 りんくさん確定):
 *   PC の拡張は複数配信を同時に開けるので、まとめの lives[] には複数の配信が入る。
 *   WEB版は配信者カードを lives[0] で描いていたため、応援レーン(鏡)が映している配信と
 *   配信者カードが別の配信になることがあった。映す配信は【鏡が指している配信】
 *   (= PC で最後に操作していた配信)に揃える。
 *   また配信が切り替わっても URL の lv が起動時のままで、受動ビューが古い配信のままになっていた。
 * @module liveviewCurrentLive
 */

/** @param {unknown} v @returns {string} 正規化した lv(不正なら '') */
function normLv(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return /^lv\d{1,15}$/.test(s) ? s : '';
}

/**
 * 映している配信の lv。鏡(northStar → lane → statCards)を優先し、鏡が無いときだけ lives[0]。
 * @param {any} jsonBlob
 * @returns {string}
 */
export function pickSnapshotLiveId(jsonBlob) {
  const b = jsonBlob && typeof jsonBlob === 'object' ? jsonBlob : {};
  const fromMirror =
    normLv(b.northStarMirror?.liveId) || normLv(b.laneMirror?.liveId) || normLv(b.statCardsMirror?.liveId);
  if (fromMirror) return fromMirror;
  const first = Array.isArray(b.lives) ? b.lives[0] : null;
  return normLv(first?.liveId) || normLv(first?.lv);
}

/**
 * 配信者カードに使う lives の1件。映している配信と同じものを選び、見つからなければ lives[0]。
 * @param {any} jsonBlob
 * @returns {any|null}
 */
export function pickLiveForCard(jsonBlob) {
  const lives = Array.isArray(jsonBlob?.lives) ? jsonBlob.lives : [];
  if (!lives.length) return null;
  const want = pickSnapshotLiveId(jsonBlob);
  if (want) {
    const hit = lives.find((/** @type {any} */ l) => normLv(l?.liveId) === want || normLv(l?.lv) === want);
    if (hit) return hit;
  }
  return lives[0] || null;
}

/**
 * 映している配信が切り替わったか(どちらも有効な lv で、違うときだけ true)。
 *   片方が分からないときは切り替えない(取り直しを繰り返さない)。
 * @param {unknown} prevLv
 * @param {unknown} nextLv
 * @returns {boolean}
 */
export function isLiveSwitched(prevLv, nextLv) {
  const a = normLv(prevLv);
  const b = normLv(nextLv);
  return Boolean(a && b && a !== b);
}
