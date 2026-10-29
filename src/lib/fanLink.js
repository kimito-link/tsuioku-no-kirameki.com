/**
 * 【層】L0 判定層(純粋関数)
 * 【この箱に入るもの】配信者中継の「ファン用リンク」の形・Redis のキー名・リアルタイムの上限の判定
 * 【この箱に入らないもの】乱数・Redis への通信(src/server/fanLinkApi.js)
 *
 * ★なぜ(v0.1.1823・拡張なしでもスマホで使える 第2段=配信者中継):
 *   配信者が自分の PC の拡張で「👥 ファンにも公開」を押すと、ファン用の【読むだけ】のリンクが出る。
 *   ファンは拡張なしで、その配信のコメント・応援をスマホで見られる。
 *   ・ファンのリンクは配信者の閲覧トークンとは別の文字列(fan_…)。知っても配信者の URL・鍵は分からない。
 *   ・ファンが見ても配信者の PC の動き(声づくり・送る間隔)は変えない。
 *   ・Ably は届けた数で費用がかかる=ファンのリアルタイムは「1配信1時間あたりの人数」と「月の総数」で止め、
 *     超えたら15秒ごとの取得(CDN でまとめる)に落とす。
 *   計画書: /mnt/project-files/smartphone/plan-6-no-extension.md ②
 * @module fanLink
 */

/** ファン用リンクの形(fan_ + 16バイトの base64url=22文字)。閲覧トークンの形(8〜128字)にも合う=?v= でそのまま開ける。 */
export const FAN_TOKEN_RE = /^fan_[A-Za-z0-9_-]{22}$/;
/** ファン用リンクの寿命(秒)。配信者が拡張の画面を開くたびに延びる。30日使わなければ消える。 */
export const FAN_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;
/** 1配信(配信者)あたり、1時間に出すリアルタイムの許可の数の既定(≒同時にリアルタイムで見られるファンの数)。env FAN_REALTIME_HOURLY_LIMIT。 */
export const DEFAULT_FAN_REALTIME_HOURLY_LIMIT = 30;
/**
 * 全体の月のリアルタイムの許可の数の既定(env FAN_REALTIME_MONTHLY_LIMIT)。
 *   1つの許可は1時間。3秒ごとのまとめが届き続けても1時間で最大1,200通=3,000 × 1,200 ≒ 360万通/月が天井。
 */
export const DEFAULT_FAN_REALTIME_MONTHLY_LIMIT = 3_000;
/** ファンの取得を CDN でまとめる秒数(同じ配信を何人が見ても、サーバーへの読み取りはこの間隔で1回)。 */
export const FAN_SNAPSHOT_CDN_SECONDS = 5;

/** @param {unknown} v */
export function isFanToken(v) {
  return typeof v === 'string' && FAN_TOKEN_RE.test(v);
}

/** Redis のキー名(ここだけで決める)。 */
export const fanKeys = {
  /** ファン用リンク → 配信者の閲覧トークン。 @param {string} fanToken */
  fan: (fanToken) => `fan:link:${fanToken}`,
  /** 配信者の閲覧トークン → いまのファン用リンク(作り直し・取り消し用)。 @param {string} token */
  owner: (token) => `fan:owner:${token}`,
  /** @param {string} token @param {string} hour YYYYMMDDHH */
  rtHour: (token, hour) => `fan:rt:${token}:${hour}`,
  /** @param {string} month YYYYMM */
  rtMonth: (month) => `fan:rtm:${month}`
};

/**
 * ファンにリアルタイムの許可を出してよいか(INCR した【後】の値で判定する)。
 * @param {{ hourCount: number, hourLimit?: number, monthCount: number, monthLimit?: number }} a
 * @returns {{ allow: boolean, reason: 'ok' | 'fan_hour_limit' | 'fan_month_limit' }}
 */
export function fanRealtimeVerdict(a) {
  const hourLimit = Number(a.hourLimit) > 0 ? Number(a.hourLimit) : DEFAULT_FAN_REALTIME_HOURLY_LIMIT;
  const monthLimit = Number(a.monthLimit) > 0 ? Number(a.monthLimit) : DEFAULT_FAN_REALTIME_MONTHLY_LIMIT;
  if ((Number(a.hourCount) || 0) > hourLimit) return { allow: false, reason: 'fan_hour_limit' };
  if ((Number(a.monthCount) || 0) > monthLimit) return { allow: false, reason: 'fan_month_limit' };
  return { allow: true, reason: 'ok' };
}

/**
 * ファン用の URL。
 * @param {string} appOrigin
 * @param {string} fanToken
 */
export function fanViewUrl(appOrigin, fanToken) {
  return `${String(appOrigin || '').replace(/\/+$/, '')}/live-view?v=${encodeURIComponent(fanToken)}`;
}
