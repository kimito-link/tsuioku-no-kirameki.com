/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】会場のアイコン読み込み実績を1行にする / 診断が届いていない事実を名指しする
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】会場アイコンの速報行はこのファイルのみ
 *
 * ★なぜ要るか(2026-08-12・ユーザー報告「サムネイルが会場モードででてない。これも計器に入ってないの?」)
 *   実機スクリーンショット: 会場の席は【全員グレーの丸】なのに、
 *   同じ人がサイドパネルには【アイコン付きで出ている】=データはあるのに会場だけ描けていない。
 *
 *   ★そして指摘のとおり【計器に入っていなかった】:
 *     速報の avatarLoadDiag は **popup の数字だけ**。会場は別バンドル(venueBar.js)で
 *     独自の guard を持ち、その実績は venueSeatsDiag.avatarProbe に載る。
 *     ところが実測では venueSeatsDiag: null で、会場の成否が速報に1文字も出なかった。
 *
 *   さらに既存の会場行は `if (line) push` の形なので、
 *   **診断が届いていないときほど行ごと消える**(異常時に診断が消える逆立ち)。
 *   → 「会場は開いているのに診断が来ていない」こと自体を名指しする行が要る。
 *
 * @module venueAvatarReport
 */

/** 失敗率がこれを超えたら注意扱いにする(%)。 */
export const VENUE_AVATAR_FAIL_WARN_PCT = 30;

/**
 * 会場のアイコン読み込み実績を1行にする。
 *
 * @param {{ usericonSucceeded?: unknown, usericonFailed?: unknown, retriedTotal?: unknown,
 *           failedTimeout?: unknown, failedError?: unknown }|null|undefined} probe
 *   venueSeatsDiag.avatarProbe(会場の guard.getDiagnostics() の戻り)
 * @returns {string} 出す行(観測ゼロなら '')
 */
export function formatVenueAvatarLine(probe) {
  const p = probe && typeof probe === 'object' ? probe : null;
  if (!p) return '';
  /** @param {unknown} v */
  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
  };
  const ok = n(p.usericonSucceeded);
  const ng = n(p.usericonFailed);
  const total = ok + ng;
  if (total === 0) return '';

  const failPct = Math.round((ng / total) * 100);
  const retried = n(p.retriedTotal);
  const timeout = n(p.failedTimeout);
  const err = n(p.failedError);

  const mark = failPct >= VENUE_AVATAR_FAIL_WARN_PCT ? '🔴' : '✅';
  const breakdown = ng > 0 ? `(内訳 timeout${timeout}/error${err})` : '';
  // ★再試行が0なら「一度も取り直していない」ことを明示する(popup で実際に踏んだ穴)。
  const retryNote = ng > 0
    ? (retried > 0 ? ` / 再取得${retried}回` : ' / ★再取得0回(一度も取り直していない)')
    : '';
  return `会場のアイコン ${mark} 成功${ok} 失敗${ng}(${failPct}%)${breakdown}${retryNote}`;
}

/**
 * 会場の診断そのものが届いているかを判定する。
 *
 * ★「会場は開いているのに診断が無い」を名指しするための行。
 *   届いていないときに黙ると、会場の異常が構造的に見えなくなる。
 *
 * @param {{ venueOpen?: unknown, venueSeatsDiag?: unknown, diagAgeMs?: unknown }} input
 * @returns {string} 出す行(正常なら '')
 */
export function formatVenueDiagReachLine(input) {
  const venueOpen = input?.venueOpen === true;
  const diag = input?.venueSeatsDiag;
  const hasDiag = !!(diag && typeof diag === 'object');
  if (!venueOpen) return ''; // 会場を開いていないなら黙る(普段の速報を汚さない)
  if (!hasDiag) {
    return '会場の診断 🔴 会場は開いているのに診断が届いていません(会場側の書き出しが止まっている疑い)';
  }
  const ageRaw = Number(input?.diagAgeMs);
  const age = Number.isFinite(ageRaw) && ageRaw >= 0 ? Math.floor(ageRaw) : -1;
  // 3秒 min-gap で書かれるので、60秒超は「更新が止まっている」とみなす。
  if (age > 60_000) {
    return `会場の診断 ⚠ ${Math.round(age / 1000)}秒前の値のまま(会場側の更新が止まっている疑い)`;
  }
  return '';
}
