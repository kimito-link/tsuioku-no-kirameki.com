/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】紹介コードの形・90日の記憶・Checkout の metadata・紹介料イベントの形
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし（呼び出し側が storage を渡す。キー名は REFERRAL_STORAGE_KEY）
 * 【正本宣言】追憶の紹介コード帰属と partnership へ送る最小ペイロードはこのファイルのみ
 *
 * referralAttribution.js — サポーター申し込みの紹介コードを90日覚え、
 * 支払い・返金を紹介料台帳へ報告するときの形を決める。
 * ブラウザからも同じファイルを /app/referral-attribution.js として読む（中身は同一）。
 */

export const REFERRAL_STORAGE_KEY = 'tnk_referral_v1';
/** 紹介リンクを踏んでから申し込みまで覚える期間。linebot の帰属窓と同じ90日。 */
export const REFERRAL_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const COMMISSION_SOURCE = 'tsuioku';
export const COMMISSION_EVENTS_PATH = '/api/referrals/commission-events';
export const COMMISSION_REFUND_PATH = '/api/referrals/commission-events/refund';

/** partnership の commission-events と同じ（英数字・ハイフン・アンダースコア、32文字まで）。 */
const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const FUTURE_SKEW_MS = 60_000;
const SUPPORTER_HOST = 'app.tsuioku-no-kirameki.com';

/**
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => void,
 *   removeItem?: (key: string) => void
 * }} ReferralStorage
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeReferralCode(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return REFERRAL_CODE_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeEmail(value) {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!s || s.length > 320 || !s.includes('@')) return null;
  return s;
}

/**
 * 支払者と紹介コードの持ち主が同じメールなら自己紹介。
 * どちらかが無いときは判定できないので false（ここでは止めない）。
 * @param {unknown} payerEmail
 * @param {unknown} ownerEmail
 */
export function isSelfReferral(payerEmail, ownerEmail) {
  const payer = normalizeEmail(payerEmail);
  const owner = normalizeEmail(ownerEmail);
  return Boolean(payer && owner && payer === owner);
}

/**
 * @param {ReferralStorage | null | undefined} storage
 * @param {unknown} ref
 * @param {number} [now]
 * @returns {string | null}
 */
export function rememberReferralCode(storage, ref, now = Date.now()) {
  const code = normalizeReferralCode(ref);
  if (!code || !storage) return code;
  try {
    storage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ ref: code, at: now }));
  } catch {
    /* 容量超過・プライベートモードでは覚えられない。URL のコードは使える */
  }
  return code;
}

/**
 * @param {ReferralStorage | null | undefined} storage
 * @param {number} [now]
 * @returns {string | null}
 */
export function readRememberedReferralCode(storage, now = Date.now()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(REFERRAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const code = parsed && typeof parsed.ref === 'string' ? normalizeReferralCode(parsed.ref) : null;
    const at = parsed && typeof parsed.at === 'number' ? parsed.at : NaN;
    if (!code || !Number.isFinite(at) || now - at > REFERRAL_TTL_MS || at - now > FUTURE_SKEW_MS) {
      storage.removeItem?.(REFERRAL_STORAGE_KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

/**
 * URL の ref が正しければそれを保存して使う（最後に踏んだリンクが優先）。
 * URL が空・不正なら、90日以内の保存を使う。
 * @param {ReferralStorage | null | undefined} storage
 * @param {unknown} urlRef
 * @param {number} [now]
 * @returns {string | null}
 */
export function resolveReferralCode(storage, urlRef, now = Date.now()) {
  const fromUrl = normalizeReferralCode(urlRef);
  if (fromUrl) {
    rememberReferralCode(storage, fromUrl, now);
    return fromUrl;
  }
  return readRememberedReferralCode(storage, now);
}

/**
 * LP からサポーターページへのリンクに ref を足す。
 * すでに ref があるリンクは変えない。対象外の URL は null。
 * @param {unknown} href
 * @param {unknown} ref
 * @returns {string | null}
 */
export function supporterHrefWithRef(href, ref) {
  const code = normalizeReferralCode(ref);
  if (!code || typeof href !== 'string' || !href.trim()) return null;
  let url;
  try {
    url = new URL(href, `https://${SUPPORTER_HOST}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== SUPPORTER_HOST) return null;
  if (url.pathname !== '/supporter' && url.pathname !== '/supporter/') return null;
  if (url.searchParams.has('ref')) return null;
  url.searchParams.set('ref', code);
  return url.toString();
}

/**
 * Stripe の Subscription metadata。client_reference_id は使わない。
 * ref が無い申し込みも source だけ付ける（直販と、他サービスの契約を区別する）。
 * @param {unknown} ref
 * @returns {{ source: string, ref?: string }}
 */
export function subscriptionMetadata(ref) {
  /** @type {{ source: string, ref?: string }} */
  const metadata = { source: COMMISSION_SOURCE };
  const code = normalizeReferralCode(ref);
  if (code) metadata.ref = code;
  return metadata;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function stripeId(value) {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && value.id) return value.id;
  return '';
}

/**
 * Stripe API 2024-06-20 の invoice.subscription と、新しい形の parent.subscription_details の両方。
 * @param {Record<string, any> | null | undefined} invoice
 */
export function invoiceSubscriptionId(invoice) {
  if (!invoice || typeof invoice !== 'object') return '';
  return stripeId(invoice.subscription) || stripeId(invoice.parent?.subscription_details?.subscription);
}

/**
 * @param {Record<string, any> | null | undefined} invoice
 * @returns {Record<string, string> | null}
 */
export function invoiceMetadata(invoice) {
  if (!invoice || typeof invoice !== 'object') return null;
  const meta = invoice.parent?.subscription_details?.metadata || invoice.subscription_details?.metadata || null;
  return meta && typeof meta === 'object' ? meta : null;
}

/**
 * @param {Record<string, any> | null | undefined} invoice
 * @returns {string | null}
 */
export function invoiceCustomerEmail(invoice) {
  if (!invoice || typeof invoice !== 'object') return null;
  return normalizeEmail(invoice.customer_email || invoice.customer_details?.email || '');
}

/**
 * @param {Record<string, any> | null | undefined} invoice
 * @returns {string | null}
 */
function occurredAtIso(invoice) {
  const sec = invoice?.created;
  if (!Number.isSafeInteger(sec) || sec <= 0) return null;
  const d = new Date(sec * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * @typedef {{
 *   eventId: string,
 *   source: string,
 *   referralCode: string,
 *   kind: 'recurring',
 *   amountYen: number,
 *   occurredAt: string
 * }} CommissionBody
 * @typedef {{ eventId: string, source: string, refundedAmountYen: number, reason: 'refund' }} RefundBody
 * @typedef {{ action: 'skip', reason: string }
 *   | { action: 'bad_currency' }
 *   | { action: 'bad_amount' }
 *   | { action: 'bad_time' }
 *   | { action: 'bad_refund' }
 *   | { action: 'send', body: CommissionBody, refund: RefundBody | null }} PlanResult
 */

/**
 * 紹介料を送るかどうか。送る body は台帳の契約にある項目だけ。
 * メール・名前・LINE ID・customer id は入れない。
 * @param {{
 *   invoice: Record<string, any> | null | undefined,
 *   metadata: { source?: string, ref?: string } | null | undefined,
 *   payerEmail?: string | null,
 *   ownerEmail?: string | null
 * }} p
 * @returns {PlanResult}
 */
export function commissionPlan(p) {
  const invoice = p?.invoice;
  if (!invoice || typeof invoice.id !== 'string' || !/^in_[A-Za-z0-9]+$/.test(invoice.id)) {
    return { action: 'skip', reason: 'invoice' };
  }
  if (!p.metadata || p.metadata.source !== COMMISSION_SOURCE) return { action: 'skip', reason: 'source' };
  const ref = normalizeReferralCode(p.metadata.ref);
  if (!ref) return { action: 'skip', reason: 'no_ref' };
  const payer = p.payerEmail === undefined ? invoiceCustomerEmail(invoice) : p.payerEmail;
  if (isSelfReferral(payer, p.ownerEmail)) return { action: 'skip', reason: 'self' };
  const currency = String(invoice.currency || '').toLowerCase();
  if (currency !== 'jpy') return { action: 'bad_currency' };
  const amount = invoice.amount_paid;
  if (!Number.isSafeInteger(amount) || amount < 0) return { action: 'bad_amount' };
  if (amount === 0) return { action: 'skip', reason: 'zero' };
  const occurredAt = occurredAtIso(invoice);
  if (!occurredAt) return { action: 'bad_time' };
  return {
    action: 'send',
    body: {
      eventId: invoice.id,
      source: COMMISSION_SOURCE,
      referralCode: ref,
      kind: 'recurring',
      amountYen: amount,
      occurredAt
    },
    refund: null
  };
}

/**
 * 返金は、先に元の支払いイベントを送ってから累計返金額を送る（返金が先に届いても台帳が揃う）。
 * 0円の請求は元イベントを作れないので送らない。
 * @param {{
 *   invoice: Record<string, any> | null | undefined,
 *   metadata: { source?: string, ref?: string } | null | undefined,
 *   refundedAmountYen: number,
 *   payerEmail?: string | null,
 *   ownerEmail?: string | null
 * }} p
 * @returns {PlanResult}
 */
export function refundPlan(p) {
  const base = commissionPlan(p);
  if (base.action !== 'send') return base;
  const refunded = p.refundedAmountYen;
  if (!Number.isSafeInteger(refunded) || refunded < 0) return { action: 'bad_refund' };
  if (refunded === 0) return { action: 'send', body: base.body, refund: null };
  return {
    action: 'send',
    body: base.body,
    refund: {
      eventId: base.body.eventId,
      source: COMMISSION_SOURCE,
      refundedAmountYen: refunded,
      reason: 'refund'
    }
  };
}
