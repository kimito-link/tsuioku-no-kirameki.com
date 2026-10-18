/**
 * 広告(ニコニ広告)の「いつ増えたか」を、拡張が【気づいた時刻】として残す(純関数)。v0.1.1665。
 *
 * ■ なぜ要るか(2026-10-18 ユーザー「広告の時刻ない」)
 *   公式のニコニ広告 API は人ごとの【合計pt】しか返さず、1回ごとの記録・時刻は無い(実測 2026-08-18・
 *   adMessageLines.js)。ギフトの履歴 API(koken /histories)のような公開時刻は取れない。
 *   だが拡張は約25秒ごとに合計を取っているので、「前回より増えていた」ことには気づける。
 *   これは公式の時刻ではなく【拡張が気づいた時刻】(最大約25秒の誤差・拡張を開く前の分は分からない)。
 *   そのことを必ず画面に書く(公式の時刻と誤読させない)。
 * ■ 守ること
 *   - 結びつけは数値uid(userPageUrl 由来)だけ。名前では引かない(同名・「名無し」で別人が混ざる)。
 *   - 最初の観測はベースライン=「初めて検知」だけ残し、増分は作らない。途中から上位に入った人も増分を推測しない。
 *   - 合計が減った(取り直し・順位変動)は増分にしない。0を捏造しない。
 *   - 件数は上限つき(無制限に増やさない)。
 */

/** 保存キーの固定 prefix(prune 側が import して使う=キー文字列の正本はここ1箇所)。 */
export const AD_OBS_STORAGE_PREFIX = 'nls_ad_obs_';

/** 保存する最大人数(超えたら firstAt の古い順に捨てる)。 */
export const AD_OBS_MAX_UIDS = 200;

/** @typedef {{ firstAt: number, firstTotal: number, lastAt: number, lastDelta: number, lastTotal: number, n: number }} AdObsEntry */

/** @param {unknown} liveId @returns {string} */
export function adObservationStorageKey(liveId) {
  return AD_OBS_STORAGE_PREFIX + String(liveId == null ? '' : liveId).trim().toLowerCase();
}

/**
 * 広告ランキング行から数値uidを取る。取れなければ ''(誰にも付けない)。
 * @param {unknown} row
 * @returns {string}
 */
export function adRowUid(row) {
  if (!row || typeof row !== 'object') return '';
  const url = String(/** @type {Record<string, any>} */ (row).userPageUrl || '');
  const m = /\/user\/([1-9]\d{0,17})(?:[/?#]|$)/.exec(url);
  return m ? m[1] : '';
}

/** @param {unknown} v @returns {number} 0以上の整数(不正は -1) */
function pt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : -1;
}

/**
 * 前回と今回のランキングを比べて、観測記録を更新して返す(入力は変更しない)。
 * @param {Record<string, AdObsEntry>|null|undefined} log 既存の記録
 * @param {unknown[]|null|undefined} prevRows 前回のランキング行(無ければベースライン)
 * @param {unknown[]|null|undefined} nextRows 今回のランキング行
 * @param {number} atMs 今回の標本の時刻
 * @returns {Record<string, AdObsEntry>}
 */
export function observeAdRanking(log, prevRows, nextRows, atMs) {
  /** @type {Record<string, AdObsEntry>} */
  const out = {};
  if (log && typeof log === 'object') for (const [k, v] of Object.entries(log)) out[k] = { ...v };
  if (!Array.isArray(nextRows) || nextRows.length === 0) return out;
  /** @type {Map<string, number>} */
  const prevByUid = new Map();
  for (const r of Array.isArray(prevRows) ? prevRows : []) {
    const uid = adRowUid(r);
    const total = pt(/** @type {any} */ (r)?.contribution);
    if (uid && total >= 0) prevByUid.set(uid, total);
  }
  for (const r of nextRows) {
    const uid = adRowUid(r);
    const total = pt(/** @type {any} */ (r)?.contribution);
    if (!uid || total < 0) continue;
    const ex = out[uid];
    if (!ex) {
      // 初めて見た人。途中から上位に入った人の増分は推測しない。
      out[uid] = { firstAt: atMs, firstTotal: total, lastAt: 0, lastDelta: 0, lastTotal: total, n: 0 };
      continue;
    }
    // 前回の標本にこの人がいるときだけ増分を数える(このページで最初の標本・途中から上位に入った人は基準を置くだけ=開く前の分を「今増えた」と言わない)。
    const before = prevByUid.has(uid) ? /** @type {number} */ (prevByUid.get(uid)) : -1;
    if (before >= 0 && total > before) {
      ex.lastAt = atMs;
      ex.lastDelta = total - before;
      ex.n += 1;
    }
    ex.lastTotal = total;
  }
  const keys = Object.keys(out);
  if (keys.length > AD_OBS_MAX_UIDS) {
    keys.sort((a, b) => out[a].firstAt - out[b].firstAt);
    for (const k of keys.slice(0, keys.length - AD_OBS_MAX_UIDS)) delete out[k];
  }
  return out;
}

/** @param {number} ms @param {number} nowMs */
function rel(ms, nowMs) {
  const d = nowMs - ms;
  if (!(ms > 0) || !Number.isFinite(d)) return '';
  if (d < 60_000) return 'たった今';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}分前`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}時間前`;
  return '';
}

/** @param {number} ms */
function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** @param {number} n */
const ja = (n) => Math.floor(n).toLocaleString('en-US');

/**
 * パネルに出す文(プレーン)。記録が無ければ ''。
 * @param {AdObsEntry|null|undefined} e
 * @param {number} nowMs
 * @returns {string}
 */
export function adObservationNote(e, nowMs) {
  if (!e || !(e.firstAt > 0)) return '';
  const first = `初めて検知 ${clock(e.firstAt)}${rel(e.firstAt, nowMs) ? `(${rel(e.firstAt, nowMs)})` : ''}・そのとき ${ja(e.firstTotal)}pt`;
  const last =
    e.lastAt > 0
      ? `最後に増えたのを検知 ${clock(e.lastAt)}${rel(e.lastAt, nowMs) ? `(${rel(e.lastAt, nowMs)})` : ''}・+${ja(e.lastDelta)}pt`
      : '増えたのは未検知';
  return `${first} ／ ${last}。※拡張が気づいた時刻(最大約25秒の誤差・開く前の分は分かりません)`;
}
