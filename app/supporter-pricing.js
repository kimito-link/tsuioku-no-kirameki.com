/**
 * サポーター申し込みページの料金表示用の純関数。
 * 金額は SUPPORTER_PRICE_YEN（Stripe / tokushoho と同じ 月額 980 / 年額 9,800）。
 * お試しの長さは src/lib/supporterLicense.js の TRIAL_MS と同じ値（ずれはテストが見る）。
 * 数え始めは「初めてマーケ HTML を開いた日」。このページでは拡張の記録を読めないので、
 * firstSeenAtMs が無いときは「今日開いた場合」として nowMs を開始にする
 * （decideFeatureAccess が firstSeenAtMs 未記録のとき TRIAL_MS 残すのと同じ）。
 */
export const SUPPORTER_PRICE_YEN = Object.freeze({ monthly: 980, yearly: 9800 });

/** src/lib/supporterLicense.js の TRIAL_MS と同じ。 */
export const SUPPORTER_PAGE_TRIAL_MS = 14 * 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TZ = 'Asia/Tokyo';

export function trialDaysFromMs(trialMs = SUPPORTER_PAGE_TRIAL_MS) {
  return Math.round(Number(trialMs) / DAY_MS);
}

/**
 * お試しが終わる瞬間（この瞬間以降は decideFeatureAccess が trial では通さない）。
 * @param {number | null | undefined} firstSeenAtMs
 * @param {number} nowMs
 * @param {number} [trialMs]
 */
export function trialEndMs(firstSeenAtMs, nowMs, trialMs = SUPPORTER_PAGE_TRIAL_MS) {
  const start = firstSeenAtMs != null && Number.isFinite(firstSeenAtMs) ? firstSeenAtMs : nowMs;
  return start + trialMs;
}

/** @param {number} yen */
export function formatYen(yen) {
  return `${Number(yen).toLocaleString('ja-JP')}円`;
}

/** @param {'monthly' | 'yearly'} plan */
export function formatPriceLabel(plan) {
  if (plan === 'yearly') return `年額 ${formatYen(SUPPORTER_PRICE_YEN.yearly)}（税込）`;
  return `月額 ${formatYen(SUPPORTER_PRICE_YEN.monthly)}（税込）`;
}

/** @param {number} ms @param {string} [timeZone] */
export function formatJpDate(ms, timeZone = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(ms));
}

/**
 * お試しの終わりと、そのあと続けるときの料金。Stripe に trial は付いていないので、
 * 「申し込みのときに選んだプランの料金がかかる」と書く（試用終了日に自動課金されるとは書かない）。
 * @param {{
 *   firstSeenAtMs?: number | null,
 *   nowMs: number,
 *   trialMs?: number,
 *   timeZone?: string
 * }} input
 */
export function formatTrialBillingNotice(input) {
  const trialMs = input.trialMs ?? SUPPORTER_PAGE_TRIAL_MS;
  const days = trialDaysFromMs(trialMs);
  const end = trialEndMs(input.firstSeenAtMs, input.nowMs, trialMs);
  const date = formatJpDate(end, input.timeZone ?? DEFAULT_TZ);
  const yearly = formatPriceLabel('yearly');
  const monthly = formatPriceLabel('monthly');
  const knownStart = input.firstSeenAtMs != null && Number.isFinite(input.firstSeenAtMs);
  const when = knownStart ? `お試しは${date}までです。` : `今日初めて開いた場合、お試しは${date}までです。`;
  return `マーケ分析レポートは、初めて開いた日から${days}日間、お試しで見られます。${when}そのあと続けるときの料金は、${monthly}、または${yearly}です。支払いは、サポーターを申し込んだときです。`;
}
