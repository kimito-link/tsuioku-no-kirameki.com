import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import billingHandler from '../../api/billing.js';
import { verifyLicenseToken } from '../lib/supporterLicense.js';
import {
  billingKeys,
  createBillingService,
  signLicense,
  stripeForm,
  verifyStripeSignature
} from './billingApi.js';

const NOW = Date.UTC(2026, 10, 6, 12);
const WH_SECRET = 'whsec_test';

function memUpstash() {
  const store = new Map();
  const fn = vi.fn(async ([op, key, ...rest]) => {
    if (op === 'GET') return store.has(key) ? store.get(key) : null;
    if (op === 'SET') {
      if (rest.includes('NX') && store.has(key)) return null;
      store.set(key, rest[0]);
      return 'OK';
    }
    if (op === 'DEL') return store.delete(key) ? 1 : 0;
    throw new Error(`op ${op}`);
  });
  return { fn, store };
}

function sub(status, over = {}) {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status,
    current_period_end: Math.floor(NOW / 1000) + 365 * 86400,
    items: { data: [{ price: { id: 'price_y' } }] },
    ...over
  };
}

function fakeStripe(state) {
  return {
    configured: true,
    createCheckout: vi.fn(async (p) => ({ id: 'cs_test_abcdefgh', url: 'https://checkout.stripe.test/x', p })),
    getCheckout: vi.fn(async () => ({
      status: 'complete',
      payment_status: 'paid',
      subscription: state.sub,
      customer_details: { email: 'fan@example.com' }
    })),
    getSubscription: vi.fn(async () => state.sub),
    createPortal: vi.fn(async (p) => ({ url: `https://portal.stripe.test/${p.customer}` }))
  };
}

async function keyEnv() {
  const k = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', k.privateKey);
  return {
    env: {
      LICENSE_SIGNING_JWK: JSON.stringify({ d: jwk.d, x: jwk.x }),
      LICENSE_SIGNING_KID: 'k1',
      STRIPE_PRICE_MONTHLY: 'price_m',
      STRIPE_PRICE_YEARLY: 'price_y',
      STRIPE_WEBHOOK_SECRET: WH_SECRET
    },
    x: /** @type {string} */ (jwk.x)
  };
}

function signed(body, t = Math.floor(NOW / 1000)) {
  const v1 = createHmac('sha256', WH_SECRET).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

async function setup() {
  const { env, x } = await keyEnv();
  const up = memUpstash();
  const state = { sub: sub('active') };
  const stripe = fakeStripe(state);
  let n = 0;
  const svc = createBillingService({
    upstash: up.fn,
    stripe,
    env,
    nowMs: () => NOW,
    newCode: () => `code${String(++n).padStart(40, '0')}`,
    sign: (p) => signLicense({ ...p, env })
  });
  return { svc, up, state, stripe, x };
}

describe('billingApi: 申し込み→支払い直後→取り直し', () => {
  it('申し込みは年額を既定にし、戻り先は supporter 画面', async () => {
    const { svc, stripe } = await setup();
    const r = await svc.checkout({ plan: 'yearly' });
    expect(r.body.url).toContain('checkout.stripe.test');
    const p = stripe.createCheckout.mock.calls[0][0];
    expect(p.line_items[0].price).toBe('price_y');
    expect(p.success_url).toBe('https://app.tsuioku-no-kirameki.com/supporter?session_id={CHECKOUT_SESSION_ID}');
  });

  it('支払い直後にコードと有効な証明書が出る・読み直しても同じコード', async () => {
    const { svc, x, up } = await setup();
    const a = await svc.claim({ sessionId: 'cs_test_abcdefgh' });
    expect(a.status).toBe(200);
    const b = await svc.claim({ sessionId: 'cs_test_abcdefgh' });
    expect(b.body.code).toBe(a.body.code);
    const v = await verifyLicenseToken(a.body.license, { nowMs: NOW, publicKeys: { k1: x } });
    expect(v.status).toBe('valid');
    expect(v.payload?.feat).toEqual(['marketing']);
    // サーバーにはコードそのものは残らない(ハッシュだけ・支払い直後の24時間の見せ直し用を除く)
    const acct = JSON.parse([...up.store.entries()].find(([k]) => k.startsWith('billing:acct:'))[1]);
    expect(JSON.stringify(acct)).not.toContain(a.body.code);
    expect(acct.email).toBe('fan@example.com');
    expect(acct.plan).toBe('yearly');
  });

  it('未払いのセッションはコードを出さない・形の違う ID は 400', async () => {
    const { svc, stripe } = await setup();
    stripe.getCheckout.mockResolvedValueOnce({ status: 'open', payment_status: 'unpaid' });
    expect((await svc.claim({ sessionId: 'cs_test_abcdefgh' })).status).toBe(402);
    expect((await svc.claim({ sessionId: '../x' })).status).toBe(400);
  });

  it('コードで証明書を取り直せる・解約後は出ない・知らないコードは 404', async () => {
    const { svc, state } = await setup();
    const { code } = (await svc.claim({ sessionId: 'cs_test_abcdefgh' })).body;
    expect((await svc.license({ code })).body.active).toBe(true);
    state.sub = sub('canceled');
    const raw = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
    expect((await svc.webhook({ rawBody: raw, signature: signed(raw) })).status).toBe(200);
    const after = (await svc.license({ code })).body;
    expect(after.active).toBe(false);
    expect(after.license).toBeNull();
    expect((await svc.license({ code: 'z'.repeat(43) })).status).toBe(404);
  });

  it('再請求中(past_due)は止めない', async () => {
    const { svc, state } = await setup();
    state.sub = sub('past_due');
    const { code } = (await svc.claim({ sessionId: 'cs_test_abcdefgh' })).body;
    expect((await svc.license({ code })).body.active).toBe(true);
  });

  it('顧客ポータルの URL を返す', async () => {
    const { svc } = await setup();
    const { code } = (await svc.claim({ sessionId: 'cs_test_abcdefgh' })).body;
    expect((await svc.portal({ code })).body.url).toBe('https://portal.stripe.test/cus_1');
  });
});

describe('billingApi: Stripe の通知', () => {
  it('署名が違う・古い時刻は 400', async () => {
    const { svc } = await setup();
    const raw = JSON.stringify({ id: 'evt_x', type: 'invoice.paid', data: { object: {} } });
    expect((await svc.webhook({ rawBody: raw, signature: 't=1,v1=00' })).status).toBe(400);
    expect((await svc.webhook({ rawBody: raw, signature: signed(raw, Math.floor(NOW / 1000) - 3600) })).status).toBe(400);
  });

  it('同じ通知が2回来ても1回分しか処理しない(冪等)', async () => {
    const { svc, stripe } = await setup();
    const raw = JSON.stringify({ id: 'evt_2', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } });
    await svc.webhook({ rawBody: raw, signature: signed(raw) });
    const r = await svc.webhook({ rawBody: raw, signature: signed(raw) });
    expect(r.body.duplicate).toBe(true);
    expect(stripe.getSubscription).toHaveBeenCalledTimes(1);
  });

  it('処理に失敗したら印を消して Stripe に再送させる', async () => {
    const { svc, stripe, up } = await setup();
    stripe.getSubscription.mockRejectedValueOnce(new Error('stripe_500'));
    const raw = JSON.stringify({ id: 'evt_3', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } });
    await expect(svc.webhook({ rawBody: raw, signature: signed(raw) })).rejects.toThrow();
    expect(up.store.has(billingKeys.event('evt_3'))).toBe(false);
  });
});

describe('billingApi: 部品', () => {
  it('stripeForm は入れ子を Stripe の形にする', () => {
    expect(stripeForm({ a: 1, line_items: [{ price: 'p', quantity: 1 }], expand: ['subscription'] }).toString()).toBe(
      'a=1&line_items%5B0%5D%5Bprice%5D=p&line_items%5B0%5D%5Bquantity%5D=1&expand%5B0%5D=subscription'
    );
  });
  it('verifyStripeSignature は複数の v1 のどれかが合えば通す', () => {
    const raw = '{}';
    const good = signed(raw).split(',')[1];
    expect(verifyStripeSignature({ rawBody: raw, header: `t=${Math.floor(NOW / 1000)},v1=ab,${good}`, secret: WH_SECRET, nowSec: Math.floor(NOW / 1000) })).toBe(true);
  });
});

describe('api/billing: 受け口', () => {
  const mkRes = () => {
    const r = { code: 0, body: undefined, headers: {} };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.status = (c) => { r.code = c; return { json: (b) => { r.body = b; } }; };
    return r;
  };
  it('Stripe の鍵が無いあいだは 503(今の利用者に影響なし)', async () => {
    const res = mkRes();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await billingHandler({ method: 'POST', query: { action: 'license' }, headers: {}, body: {} }, res, { stripe: { configured: false } });
    log.mockRestore();
    expect(res.code).toBe(503);
  });
  it('GET は 405', async () => {
    const res = mkRes();
    await billingHandler({ method: 'GET', query: {}, headers: {} }, res);
    expect(res.code).toBe(405);
  });
});
