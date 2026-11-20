/**
 * サポーターの支払い・返金を partnership の紹介料台帳へ送る。
 * 率（20% / 親 5%）は向こうが計算する。こちらは最小の事実だけ送る。
 *
 * 環境変数:
 *   PARTNERSHIP_COMMISSION_URL    台帳のオリジン（例: https://partner.example.com）。パスは付けない。
 *   PARTNERSHIP_COMMISSION_SECRET この source（tsuioku）専用の共有秘密。向こうは COMMISSION_SECRET_TSUIOKU。
 */

import {
  COMMISSION_EVENTS_PATH,
  COMMISSION_REFUND_PATH,
  commissionPlan,
  invoiceCustomerEmail,
  invoiceMetadata,
  invoiceSubscriptionId,
  refundPlan,
  stripeId
} from '../lib/referralAttribution.js';

function fallbackEnv() {
  const proc = /** @type {{ env?: Record<string, string | undefined> } | undefined} */ (
    /** @type {any} */ (globalThis).process
  );
  return proc?.env || {};
}

/**
 * 台帳が紹介コードの持ち主と比べる値。hex HMAC-SHA256。
 * 鍵は PARTNERSHIP_COMMISSION_SECRET。本文はメールを trim して小文字にしたもの。
 * メールそのものは送らない。
 * @param {string} secret
 * @param {unknown} email
 * @returns {Promise<string | null>}
 */
export async function buyerEmailHmac(secret, email) {
  const message = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const key = typeof secret === 'string' ? secret.trim() : '';
  if (!message || !key) return null;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 請求か、展開済みの顧客オブジェクトにあるメール。空なら null。
 * @param {Record<string, any> | null | undefined} invoice
 * @returns {string | null}
 */
function buyerEmail(invoice) {
  const customer = invoice?.customer;
  const raw = invoice?.customer_email
    || invoice?.customer_details?.email
    || (customer && typeof customer === 'object' ? customer.email : '');
  const message = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return message || null;
}

/**
 * @param {Record<string, unknown>} body
 * @param {Record<string, any> | null | undefined} invoice
 * @param {string} secret
 */
async function withBuyerEmailHmac(body, invoice, secret) {
  const hmac = await buyerEmailHmac(secret, buyerEmail(invoice));
  if (!hmac) return body;
  return { ...body, buyerEmailHmac: hmac };
}

/**
 * @param {Record<string, string | undefined>} [env]
 */
export function partnershipConfig(env) {
  const source = env || fallbackEnv();
  const base = String(source.PARTNERSHIP_COMMISSION_URL || '').trim().replace(/\/+$/, '');
  const secret = String(source.PARTNERSHIP_COMMISSION_SECRET || '').trim();
  return { base, secret, configured: Boolean(base && secret) };
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} body
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} deps
 */
export async function postCommission(path, body, deps) {
  const { base, secret } = partnershipConfig(deps.env);
  if (!base || !secret) throw new Error('commission_not_configured');
  const fetchImpl = deps.fetchImpl || fetch;
  let res;
  try {
    res = await fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new Error('commission_network');
  }
  /** @type {any} */
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  // 知らない紹介コード・壊れた本文は再送しても直らない。契約の更新は止めない。
  if (path === COMMISSION_EVENTS_PATH && res.status === 404 && json?.error === 'referral_not_found') {
    return { ok: true, skipped: 'unknown_code' };
  }
  if (path === COMMISSION_EVENTS_PATH && res.status === 400) {
    return { ok: true, skipped: 'bad_request' };
  }
  if (!res.ok || !json || json.ok !== true) throw new Error(`commission_http_${res.status}`);
  // selfReferral は台帳が本人のコードだと判定した成功。再送しない。
  return { ok: true, duplicate: json.duplicate === true, selfReferral: json.selfReferral === true };
}

/**
 * @param {Record<string, any>} invoice
 * @param {{ getSubscription?: (id: string) => Promise<any> }} stripe
 */
async function metadataFor(invoice, stripe) {
  const inline = invoiceMetadata(invoice);
  if (inline && inline.source) return inline;
  const subId = invoiceSubscriptionId(invoice);
  if (!subId || !stripe?.getSubscription) return inline;
  const sub = await stripe.getSubscription(subId);
  return sub?.metadata || inline;
}

/**
 * @param {Record<string, any>} invoice
 * @param {{
 *   stripe: { getSubscription?: (id: string) => Promise<any> },
 *   env?: Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch,
 *   ownerEmail?: (ref: string) => Promise<string | null>
 * }} deps
 */
export async function reportPaidInvoice(invoice, deps) {
  const metadata = await metadataFor(invoice, deps.stripe);
  const plan = commissionPlan({
    invoice,
    metadata,
    payerEmail: invoiceCustomerEmail(invoice),
    ownerEmail: deps.ownerEmail && metadata?.ref ? await deps.ownerEmail(metadata.ref) : null
  });
  if (plan.action === 'skip') return plan;
  if (plan.action !== 'send') throw new Error(`commission_${plan.action}`);
  const { secret } = partnershipConfig(deps.env);
  return postCommission(COMMISSION_EVENTS_PATH, await withBuyerEmailHmac(plan.body, invoice, secret), deps);
}

/**
 * charge.invoice が無い新しい API 形は InvoicePayment から請求を1件に決める。
 * @param {Record<string, any>} charge
 * @param {{ getInvoice?: (id: string) => Promise<any>, listInvoicePayments?: (paymentIntent: string) => Promise<any> }} stripe
 */
async function invoiceForCharge(charge, stripe) {
  let invoiceId = stripeId(charge?.invoice);
  if (!invoiceId) {
    const paymentIntent = stripeId(charge?.payment_intent);
    if (!paymentIntent || !stripe?.listInvoicePayments) return null;
    const listed = await stripe.listInvoicePayments(paymentIntent);
    /** @type {any[]} */
    const rows = Array.isArray(listed?.data) ? listed.data : [];
    const ids = [...new Set(rows.map((/** @type {any} */ row) => stripeId(row?.invoice)).filter((id) => id !== ''))];
    if (ids.length > 1) throw new Error('commission_ambiguous_refund');
    invoiceId = ids[0] || '';
  }
  if (!invoiceId || !stripe?.getInvoice) return null;
  return stripe.getInvoice(invoiceId);
}

/**
 * @param {Record<string, any>} charge
 * @param {{
 *   stripe: { getSubscription?: (id: string) => Promise<any>, getInvoice?: (id: string) => Promise<any>, listInvoicePayments?: (paymentIntent: string) => Promise<any> },
 *   env?: Record<string, string | undefined>,
 *   fetchImpl?: typeof fetch,
 *   ownerEmail?: (ref: string) => Promise<string | null>
 * }} deps
 */
export async function reportRefundedCharge(charge, deps) {
  const invoice = await invoiceForCharge(charge, deps.stripe);
  if (!invoice) return { action: 'skip', reason: 'no_invoice' };
  const metadata = await metadataFor(invoice, deps.stripe);
  const plan = refundPlan({
    invoice,
    metadata,
    refundedAmountYen: charge?.amount_refunded,
    payerEmail: invoiceCustomerEmail(invoice),
    ownerEmail: deps.ownerEmail && metadata?.ref ? await deps.ownerEmail(metadata.ref) : null
  });
  if (plan.action === 'skip') return plan;
  if (plan.action !== 'send') throw new Error(`commission_${plan.action}`);
  const { secret } = partnershipConfig(deps.env);
  const sent = await postCommission(COMMISSION_EVENTS_PATH, await withBuyerEmailHmac(plan.body, invoice, secret), deps);
  // 元の支払いが台帳に無い、または自己紹介で行を作っていないときは、返金の突き合わせ先が無い。
  if (sent.skipped || sent.selfReferral || !plan.refund) return sent;
  await postCommission(COMMISSION_REFUND_PATH, plan.refund, deps);
  return sent;
}
