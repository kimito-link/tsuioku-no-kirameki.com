/**
 * currentLiveIdOrigin.js — 「いま視聴中の配信」を【鏡とは別の起点】から決める純関数。
 *
 * ■ 何が壊れていたか(2026-08-17 実機・ユーザー速報で確定)
 *   速報にこう出ていた:
 *     配信ごと: [lv351196729] やす      ← いま見ている配信
 *     対象配信: lv351196674             ← 鏡が焼かれた配信(別物)
 *     北極星 広告: 拡張1 / 鏡5  🔴不一致
 *
 *   status-entry.js:2169 は currentLiveId をこう決めていた:
 *     const currentLiveId = northStarMirror?.liveId || laneMirror?.liveId || ...
 *   ＝**「いま視聴中の配信」を鏡自身から取っていた**。
 *
 *   すると別配信を弾くガード(liveviewPublishSelfDiag.js:298 の lidMatch)は
 *     鏡.liveId === currentLiveId(=鏡.liveId)
 *   となり【常に一致】＝**恒真で一度も発動しない**。
 *   結果、前の配信の鏡(広告5件)と今の配信の実データ(1件)を突合して
 *   「コピー漏れ」と誤検知していた。
 *   ★[[comparison-needs-two-origins-2026-08-07]]:
 *     一致判定は【両辺の起点が別】でなければ恒真になる。まさにその型。
 *
 * ■ 直し方
 *   実際に開いている watch タブ(lvList/livesData)を第一の起点にする。
 *   これは鏡とは無関係に決まるので、鏡が古ければ「不一致」を正しく検出できる。
 *   ★鏡へのフォールバックは残す(watch タブが無いときは従来どおり)。
 *   ただしその場合は「鏡由来」と分かるようにして、突合を保留させる。
 *
 * 掟: storage も DOM も触らない(呼び出し側が渡す=テスト可能)。
 *
 * @module currentLiveIdOrigin
 */

/** @param {unknown} v @returns {string} 小文字化した lv(不正なら空) */
function normLv(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return /^lv\d{1,15}$/.test(s) ? s : '';
}

/**
 * 「いま視聴中の配信」を決める。
 *
 * @param {object} input
 * @param {ReadonlyArray<{ liveId?: unknown, endedAt?: unknown }>} [input.lives]
 *   実際に開いている watch タブ由来の配信一覧(livesData 相当)。★これが第一の起点。
 * @param {{ liveId?: unknown }|null} [input.northStarMirror] 鏡(フォールバック用)
 * @param {{ liveId?: unknown }|null} [input.laneMirror] 鏡(フォールバック用)
 * @param {{ liveId?: unknown }|null} [input.statCardsMirror] 鏡(フォールバック用)
 * @returns {{ liveId: string, origin: 'watch'|'mirror'|'none' }}
 *   origin='mirror' のとき、鏡との件数突合は【してはいけない】(恒真になるため)。
 */
export function resolveCurrentLiveId(input) {
  const lives = Array.isArray(input?.lives) ? input.lives : [];
  /*
   * ★終了した配信は選ばない。終わった配信を「いま視聴中」にすると、
   *   次の配信を開いても古い方を掴み続ける(同じ恒真の穴に戻る)。
   */
  for (const l of lives) {
    if (l && l.endedAt) continue;
    const lv = normLv(l?.liveId);
    if (lv) return { liveId: lv, origin: 'watch' };
  }
  // 終了済みしか無いなら、それでも watch 由来を優先する(鏡より確かなため)。
  for (const l of lives) {
    const lv = normLv(l?.liveId);
    if (lv) return { liveId: lv, origin: 'watch' };
  }

  const mirrorLv =
    normLv(input?.northStarMirror?.liveId) ||
    normLv(input?.laneMirror?.liveId) ||
    normLv(input?.statCardsMirror?.liveId);
  if (mirrorLv) return { liveId: mirrorLv, origin: 'mirror' };

  return { liveId: '', origin: 'none' };
}

/**
 * 件数突合をしてよいか。
 *
 * ★origin==='mirror' のときは【してはいけない】。
 *   比較の両辺が同じ鏡から来るため、一致しても不一致でも意味を持たない
 *   (一致すれば恒真・不一致は起こりえない)。
 *
 * @param {'watch'|'mirror'|'none'} origin
 * @returns {boolean}
 */
export function canCompareMirrorCounts(origin) {
  return origin === 'watch';
}
