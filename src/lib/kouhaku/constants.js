/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】紅白歌枠合戦2026の公式順位を、いつ・どこから読んでよいかの定数
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】取得してよい公式URLと、1日2回までの時刻はこのファイルのみ
 *
 * constants.js — 紅白の公式イベントランキング(15106)だけを出典にする。
 */

/** 取得してよい公式ページはこれ1本。紅組・白組の順位表が両方入っている。 */
export const OFFICIAL_RANKING_URL = 'https://blog.nicovideo.jp/niconews/15106';

export const OFFICIAL_AKA_URL = 'https://blog.nicovideo.jp/niconews/15102';
export const OFFICIAL_SHIRO_URL = 'https://blog.nicovideo.jp/niconews/15104';

/** 公開サイト。www なし・https。User-Agent の連絡先はパスも付けない。 */
export const PUBLIC_SITE_URL = 'https://tsuioku-no-kirameki.com';

export const SERVICE_NAME = 'KouhakuOuen';
export const SERVICE_VERSION = '1.0';

/** 集計期間。公式本文の表記に合わせる。 */
export const EVENT_PERIOD_LABEL = '2026年11月16日 0:00 〜 11月29日 23:59（日本時間）';

/** この日より前は取得しない。集計自体は 11月16日 0:00 から。 */
export const EVENT_FETCH_START = '2026-11-16';

/**
 * 集計終了は 2026-11-29 23:59 JST。
 * 最終日分が翌日の更新に載ることがあるので、取得は 12月2日まで許す。
 * それ以降は定期実行が残っていても公式ページへはアクセスしない。
 */
export const EVENT_FETCH_UNTIL = '2026-12-02';

/** 1日に公式へ出してよい GET の上限。成功も失敗も、304 も 1回に数える。 */
export const MAX_FETCHES_PER_JST_DAY = 2;

/** 16:30 JST。これより前の呼び出しは取得しない。 */
export const PRIMARY_FETCH_MINUTE = 16 * 60 + 30;

/**
 * 指数バックオフの初項。失敗回数 n の待ちは BASE * 2^n。
 * n=1 のとき 2時間。再試行は 19:30 JST（16:30 の 3時間後）。
 */
export const BACKOFF_BASE_MS = 60 * 60 * 1000;

/** 定期実行の起動が数分ずれたとき、待ちの端で取りこぼさないための猶予。 */
export const BACKOFF_GRACE_MS = 10 * 60 * 1000;

export const FETCH_TIMEOUT_MS = 15000;
export const HTML_MAX_BYTES = 2000000;

/** 日中の推定は作らない。フラグを true にしても取得処理は無い。 */
export const FEATURES = Object.freeze({
  daytimeEstimate: false
});

/**
 * @param {string} team
 * @returns {string}
 */
export function teamLabel(team) {
  return team === 'aka' ? '紅組' : '白組';
}

/**
 * @param {'aka'|'shiro'} team
 * @returns {string}
 */
export function officialEventUrl(team) {
  return team === 'aka' ? OFFICIAL_AKA_URL : OFFICIAL_SHIRO_URL;
}

/**
 * 連絡先はサイトのオリジンだけ。メールアドレスも /about/ も付けない。
 * @param {string} siteUrl
 * @returns {string}
 */
export function buildUserAgent(siteUrl) {
  const origin = String(siteUrl || '').replace(/\/$/, '');
  return `${SERVICE_NAME}/${SERVICE_VERSION} (+${origin}/)`;
}
