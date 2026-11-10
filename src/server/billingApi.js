// @ts-nocheck
/* global process, Buffer -- サーバー(Vercel 関数)専用の部品。api/ と同じく env を読む */
/**
 * サポーター(有料=マーケ HTML)の「権利の台帳」(v0.1.1893・課金 第2段)。
 *   設計書: https://claude.ai/artifact/QeyGHyBALbVdn4bERUFhN4
 *
 * ★100年後も安心のための約束(この箱の形を決めている):
 *   - 「誰がいつまでサポーターか」は自分の台帳(Upstash)が正本。Stripe は台帳を更新する入口の1つ
 *     (provider: 'stripe')。決済会社を足す・替えるときは入口を足すだけで、拡張と証明書は変えない。
 *   - 台帳には TTL を付けない(解約しても記録は残す=再開・返金・問い合わせに答えられる)。
 *   - 本人の目印は「サポーターのコード」(支払い直後に1回だけ見せる)。サーバーにはハッシュだけ残す。
 *     メールアドレスは取り戻し(第3段以降)のために台帳に残す。カード番号は Stripe だけが持つ。
 *   - Stripe からの通知(webhook)は何度来ても結果が同じ(冪等)。状態は通知の中身ではなく、
 *     そのつど Stripe に聞き直した最新の契約から決める(順番が入れ替わっても壊れない)。
 *   - 決済会社への通信は SDK を使わず REST(依存を増やさない=何年たってもビルドが壊れにくい)。
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  DEVICE_RESET_INTERVAL_MS,
  FEATURE_MARKETING,
  LICENSE_TTL_MS,
  bytesToBase64url,
  deviceTagFor,
  encodeLicenseBody,
  isValidDeviceId,
  isValidSupporterCode
} from '../lib/supporterLicense.js';

/** 台帳のキー名(Upstash)。 */
export const billingKeys = Object.freeze({
  account: (acctId) => `billing:acct:${acctId}`,
  code: (codeHash) => `billing:code:${codeHash}`,
  customer: (provider, customerId) => `billing:cust:${provider}:${customerId}`,
  sessionCode: (sessionId) => `billing:sescode:${sessionId}`,
  event: (eventId) => `billing:evt:${eventId}`
});

/** 使える契約の状態(Stripe の subscription.status)。past_due は再請求中なので止めない。 */
const ENTITLED_STATUSES = new Set(['active', 'trialing', 'past_due']);

/** 同じ通知を受け取ったと覚えておく期間(Stripe の再送は最長3日)。 */
const EVENT_SEEN_TTL_SECONDS = 7 * 24 * 60 * 60;
/** 支払い直後の画面を読み直したときに同じコードを見せる期間。 */
const SESSION_CODE_TTL_SECONDS = 24 * 60 * 60;
/** webhook の時刻のずれの許容(Stripe の既定と同じ5分)。 */
const WEBHOOK_TOLERANCE_SEC = 300;

export function sha256Hex(s) {
  return createHash('sha256').update(String(s)).digest('hex');
}

export function newSupporterCode() {
  return randomBytes(32).toString('base64url');
}

/**
 * @typedef {{
 *   acctId: string, provider: string, customerId: string, subscriptionId: string,
 *   status: string, plan: string, priceId: string, currentPeriodEndMs: number,
 *   email: string, createdAtMs: number, updatedAtMs: number, codeHash: string
 * }} BillingAccount
 */

/** 台帳の1件を読む(形が壊れていたら null)。 */
export function parseAccount(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const a = JSON.parse(raw);
    if (!a || typeof a.acctId !== 'string' || !a.acctId) return null;
    return a;
  } catch {
    return null;
  }
}

/** 契約の状態から「今サポーターか」。 */
//   期末を過ぎても Stripe が active のまま(更新の通知待ち)なら止めない=期限の判定は Stripe の status に任せ、
//   拡張側は証明書の期限+GRACE_MS で守る。
export function isAccountEntitled(acct) {
  return Boolean(acct) && ENTITLED_STATUSES.has(String(acct.status));
}

/** Stripe の価格 ID → 自分の呼び名。知らない価格は 'supporter'。 */
export function planFromPriceId(priceId, env = process.env) {
  if (priceId && priceId === env.STRIPE_PRICE_YEARLY) return 'yearly';
  if (priceId && priceId === env.STRIPE_PRICE_MONTHLY) return 'monthly';
  return 'supporter';
}

/**
 * Stripe-Signature を確かめる(t=…,v1=…)。
 * @param {{ rawBody: string, header: string, secret: string, nowSec: number }} p
 */
export function verifyStripeSignature({ rawBody, header, secret, nowSec }) {
  if (!header || !secret) return false;
  const parts = String(header).split(',').map((s) => s.trim());
  const t = Number(parts.find((s) => s.startsWith('t='))?.slice(2));
  const sigs = parts.filter((s) => s.startsWith('v1=')).map((s) => s.slice(3));
  if (!Number.isFinite(t) || sigs.length === 0) return false;
  if (Math.abs(nowSec - t) > WEBHOOK_TOLERANCE_SEC) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const eb = Buffer.from(expected, 'hex');
  return sigs.some((s) => {
    try {
      const sb = Buffer.from(s, 'hex');
      return sb.length === eb.length && timingSafeEqual(sb, eb);
    } catch {
      return false;
    }
  });
}

/** Stripe REST(form エンコード)。 */
export function stripeForm(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v == null) continue;
    if (typeof v === 'object') stripeForm(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

/**
 * @param {{ fetchImpl?: typeof fetch, env?: Record<string, string|undefined> }} deps
 */
export function createStripeClient({ fetchImpl = fetch, env = process.env } = {}) {
  const key = env.STRIPE_SECRET_KEY;
  async function call(method, path, params) {
    if (!key) throw new Error('stripe_not_configured');
    const init = {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Stripe-Version': '2024-06-20' }
    };
    let url = `https://api.stripe.com/v1/${path}`;
    if (params && method === 'GET') url += `?${stripeForm(params).toString()}`;
    else if (params) {
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      init.body = stripeForm(params).toString();
    }
    const res = await fetchImpl(url, init);
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) throw new Error(`stripe_${res.status}`);
    return json;
  }
  return {
    configured: Boolean(key),
    createCheckout: (params) => call('POST', 'checkout/sessions', params),
    getCheckout: (id) => call('GET', `checkout/sessions/${encodeURIComponent(id)}`, { expand: ['subscription'] }),
    getSubscription: (id) => call('GET', `subscriptions/${encodeURIComponent(id)}`),
    getEvent: (id) => call('GET', `events/${encodeURIComponent(id)}`),
    createPortal: (params) => call('POST', 'billing_portal/sessions', params)
  };
}

/**
 * 証明書に署名する(Ed25519・秘密鍵は env の JWK)。
 *   dev = その PC の印(v0.1.1896・1コード1台)。拡張は自分の印と違う証明書を使わない。
 * @param {{ sub: string, plan: string, nowMs: number, dev?: string, env?: Record<string, string|undefined>, subtle?: SubtleCrypto }} p
 */
export async function signLicense({ sub, plan, nowMs, dev, env = process.env, subtle = globalThis.crypto.subtle }) {
  const jwkText = env.LICENSE_SIGNING_JWK;
  const kid = env.LICENSE_SIGNING_KID;
  if (!jwkText || !kid) throw new Error('license_key_not_configured');
  const jwk = JSON.parse(jwkText);
  const key = await subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', d: jwk.d, x: jwk.x }, { name: 'Ed25519' }, false, ['sign']);
  const body = encodeLicenseBody({
    kid,
    sub,
    plan,
    feat: [FEATURE_MARKETING],
    iat: nowMs,
    exp: nowMs + LICENSE_TTL_MS,
    ...(dev ? { dev } : {})
  });
  const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, key, new TextEncoder().encode(body)));
  return `${body}.${bytesToBase64url(sig)}`;
}

/**
 * 台帳の操作一式。deps を差し替えて試験する。
 * @param {{
 *   upstash: (cmd: any[]) => Promise<any>,
 *   stripe: ReturnType<typeof createStripeClient>,
 *   nowMs?: () => number,
 *   newCode?: () => string,
 *   sign?: (p: { sub: string, plan: string, nowMs: number, dev?: string }) => Promise<string>,
 *   env?: Record<string, string|undefined>
 * }} deps
 */
export function createBillingService(deps) {
  const env = deps.env || process.env;
  const now = deps.nowMs || (() => Date.now());
  const newCode = deps.newCode || newSupporterCode;
  const sign = deps.sign || ((p) => signLicense({ ...p, env }));
  const { upstash, stripe } = deps;
  const appBase = String(env.SUPPORTER_APP_BASE || 'https://app.tsuioku-no-kirameki.com').replace(/\/$/, '');

  async function loadAccount(acctId) {
    return parseAccount(await upstash(['GET', billingKeys.account(acctId)]));
  }
  async function saveAccount(acct) {
    await upstash(['SET', billingKeys.account(acct.acctId), JSON.stringify(acct)]);
  }
  async function accountByCode(code) {
    if (!isValidSupporterCode(code)) return null;
    const acctId = await upstash(['GET', billingKeys.code(sha256Hex(String(code).trim()))]);
    return acctId ? loadAccount(acctId) : null;
  }

  /** Stripe の契約の中身を台帳へ写す(顧客 ID で1件にまとめる)。 */
  async function upsertFromSubscription(sub, extra = {}) {
    // ★同じ Stripe アカウントには別サービスの商品もある。追憶の価格を含まない契約は台帳に入れない
    //   (入れると、別サービスの購入者がサポーターになったり、同じ顧客の別契約で状態が上書きされる)。
    const ourItem = (sub?.items?.data || []).find((it) => planFromPriceId(it?.price?.id, env) !== 'supporter');
    if (!ourItem) return null;
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    if (!customerId) return null;
    const custKey = billingKeys.customer('stripe', customerId);
    let acctId = await upstash(['GET', custKey]);
    let acct = acctId ? await loadAccount(acctId) : null;
    const t = now();
    if (!acct) {
      acctId = sha256Hex(`stripe:${customerId}`).slice(0, 32);
      acct = { acctId, provider: 'stripe', customerId, createdAtMs: t, codeHash: '', email: '' };
      await upstash(['SET', custKey, acctId]);
    }
    const priceId = ourItem.price.id;
    const periodEnd = sub.current_period_end ?? ourItem.current_period_end;
    acct = {
      ...acct,
      subscriptionId: sub.id || acct.subscriptionId || '',
      status: String(sub.status || acct.status || ''),
      priceId,
      plan: planFromPriceId(priceId, env),
      currentPeriodEndMs: Number.isFinite(periodEnd) ? periodEnd * 1000 : acct.currentPeriodEndMs || 0,
      email: extra.email || acct.email || '',
      updatedAtMs: t
    };
    await saveAccount(acct);
    return acct;
  }

  async function licenseFor(acct, dev) {
    if (!isAccountEntitled(acct)) return null;
    return sign({ sub: acct.acctId, plan: acct.plan, nowMs: now(), dev });
  }

  return {
    /** 申し込み画面(Stripe Checkout)の URL を作る。 */
    async checkout({ plan }) {
      const price = plan === 'monthly' ? env.STRIPE_PRICE_MONTHLY : env.STRIPE_PRICE_YEARLY;
      if (!price) return { status: 503, body: { ok: false, error: 'price_not_configured' } };
      const s = await stripe.createCheckout({
        mode: 'subscription',
        line_items: [{ price, quantity: 1 }],
        success_url: `${appBase}/supporter?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appBase}/supporter?canceled=1`,
        allow_promotion_codes: 'true',
        locale: 'ja'
      });
      return { status: 200, body: { ok: true, url: s.url } };
    },

    /** 支払い直後: 契約を台帳に入れ、コードを返す(24時間は読み直しても同じコード・その後は出さない)。 */
    async claim({ sessionId }) {
      if (typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]{8,200}$/.test(sessionId)) {
        return { status: 400, body: { ok: false, error: 'bad_session' } };
      }
      const s = await stripe.getCheckout(sessionId);
      const paid = s.status === 'complete' && (s.payment_status === 'paid' || s.payment_status === 'no_payment_required');
      if (!paid || !s.subscription) return { status: 402, body: { ok: false, error: 'not_paid' } };
      const sub = typeof s.subscription === 'string' ? await stripe.getSubscription(s.subscription) : s.subscription;
      const acct = await upsertFromSubscription(sub, { email: s.customer_details?.email || '' });
      if (!acct) return { status: 404, body: { ok: false, error: 'not_supporter' } };
      let code = await upstash(['GET', billingKeys.sessionCode(sessionId)]);
      if (!code) {
        // ★コードを出すのは1つの契約につき1回だけ。見せ直しの期間(24時間)が過ぎた後に同じ URL を
        //   開き直しても作り直さない(作り直すと拡張に入れてあるコードが無効になり、URL を知る人が
        //   新しいコードを受け取れてしまう)。
        if (acct.codeHash) return { status: 409, body: { ok: false, error: 'code_already_issued' } };
        code = newCode();
        const codeHash = sha256Hex(code);
        await upstash(['SET', billingKeys.code(codeHash), acct.acctId]);
        await saveAccount({ ...acct, codeHash });
        await upstash(['SET', billingKeys.sessionCode(sessionId), code, 'EX', String(SESSION_CODE_TTL_SECONDS)]);
      }
      // ★証明書はここでは出さない(PC の印が無い証明書はどの PC でも使えてしまう)。拡張がコードで取りに来る。
      return { status: 200, body: { ok: true, code, plan: acct.plan } };
    },

    /**
     * 拡張が証明書を取り直す。1つのコードは1台だけ(最初に取りに来た PC を覚える)。
     *   ほかの PC からは 409 device_limit(サポーターページの「この PC に移す」で入れ替える)。
     */
    async license({ code, device }) {
      const acct = await accountByCode(code);
      if (!acct) return { status: 404, body: { ok: false, error: 'unknown_code' } };
      if (!isValidDeviceId(device)) return { status: 400, body: { ok: false, error: 'bad_device' } };
      const tag = await deviceTagFor(device);
      if (!tag) return { status: 500, body: { ok: false, error: 'device_tag' } };
      if (!isAccountEntitled(acct)) {
        return { status: 200, body: { ok: true, active: false, license: null, plan: acct.plan, status: acct.status } };
      }
      if (acct.deviceTag && acct.deviceTag !== tag) {
        return { status: 409, body: { ok: false, error: 'device_limit' } };
      }
      if (!acct.deviceTag) await saveAccount({ ...acct, deviceTag: tag, deviceBoundAtMs: now() });
      const license = await licenseFor(acct, tag);
      return { status: 200, body: { ok: true, active: Boolean(license), license, plan: acct.plan, status: acct.status } };
    },

    /**
     * 「この PC に移す」: 覚えている PC を忘れる(次に取りに来た PC が新しい1台になる)。30日に1回まで。
     *   ★前の PC の手元の証明書は期限(+猶予)まで残る。使い回しを繰り返せないよう間隔で抑える。
     */
    async devicesReset({ code }) {
      const acct = await accountByCode(code);
      if (!acct) return { status: 404, body: { ok: false, error: 'unknown_code' } };
      if (!acct.deviceTag) return { status: 200, body: { ok: true } };
      const t = now();
      const last = Number(acct.deviceResetAtMs) || 0;
      if (last && t - last < DEVICE_RESET_INTERVAL_MS) {
        return { status: 429, body: { ok: false, error: 'reset_too_soon', nextAtMs: last + DEVICE_RESET_INTERVAL_MS } };
      }
      await saveAccount({ ...acct, deviceTag: '', deviceBoundAtMs: 0, deviceResetAtMs: t });
      return { status: 200, body: { ok: true } };
    },

    /** 解約・一時停止・カード変更(Stripe の顧客ポータル)。 */
    async portal({ code }) {
      const acct = await accountByCode(code);
      if (!acct) return { status: 404, body: { ok: false, error: 'unknown_code' } };
      const p = await stripe.createPortal({ customer: acct.customerId, return_url: `${appBase}/supporter` });
      return { status: 200, body: { ok: true, url: p.url } };
    },

    /** Stripe の通知。署名を確かめ、契約を聞き直して台帳を更新する(何度来ても同じ結果)。 */
    async webhook({ rawBody, signature }) {
      const ok = verifyStripeSignature({
        rawBody,
        header: signature,
        secret: env.STRIPE_WEBHOOK_SECRET || '',
        nowSec: Math.floor(now() / 1000)
      });
      let ev;
      try {
        ev = JSON.parse(rawBody);
      } catch {
        return { status: 400, body: { ok: false, error: 'bad_json' } };
      }
      if (!ev?.id) return { status: 400, body: { ok: false, error: 'bad_event' } };
      if (!ok) {
        // ★署名が合わないとき(実行環境が本文を解析し直して生の本文が失われた等)は、
        //   届いた中身を信じずに Stripe へイベント ID で聞き直し、その中身だけを使う。
        //   偽の通知は Stripe に存在しないので 400 のまま。
        if (typeof ev.id !== 'string' || !/^evt_[A-Za-z0-9_]{8,200}$/.test(ev.id) || !stripe.getEvent) {
          return { status: 400, body: { ok: false, error: 'bad_signature' } };
        }
        let fetched = null;
        try {
          fetched = await stripe.getEvent(ev.id);
        } catch {
          fetched = null;
        }
        if (!fetched?.id || fetched.id !== ev.id) return { status: 400, body: { ok: false, error: 'bad_signature' } };
        ev = fetched;
      }
      const seen = await upstash(['SET', billingKeys.event(ev.id), '1', 'NX', 'EX', String(EVENT_SEEN_TTL_SECONDS)]);
      if (seen === null) return { status: 200, body: { ok: true, duplicate: true } };
      const obj = ev.data?.object || {};
      try {
        if (String(ev.type).startsWith('customer.subscription.') && obj.id) {
          await upsertFromSubscription(await stripe.getSubscription(obj.id));
        } else if (ev.type === 'checkout.session.completed' && obj.subscription) {
          const subId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id;
          await upsertFromSubscription(await stripe.getSubscription(subId), { email: obj.customer_details?.email || '' });
        } else if (String(ev.type).startsWith('invoice.') && obj.subscription) {
          const subId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id;
          await upsertFromSubscription(await stripe.getSubscription(subId));
        }
      } catch (e) {
        // 失敗したら「受け取った」印を消して Stripe に再送させる。
        await upstash(['DEL', billingKeys.event(ev.id)]);
        throw e;
      }
      return { status: 200, body: { ok: true } };
    }
  };
}
