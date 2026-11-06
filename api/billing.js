// @ts-nocheck
/**
 * サポーター(有料=マーケ HTML)の受け口(v0.1.1893・課金 第2段)。中身は src/server/billingApi.js。
 *
 *   POST /api/billing?action=checkout  { plan: 'monthly'|'yearly' }  → { url }(Stripe の申し込み画面)
 *   POST /api/billing?action=claim     { sessionId }                  → { code }(支払い直後に1回・証明書は拡張がコードで取る)
 *   POST /api/billing?action=license   x-supporter-code + x-supporter-device → { active, license }(拡張が取り直す・1コード1台=ほかの PC は 409)
 *   POST /api/billing?action=devices_reset x-supporter-code          → { ok }(この PC に移す・30日に1回)
 *   POST /api/billing?action=portal    x-supporter-code               → { url }(解約・一時停止・カード変更)
 *   POST /api/billing?action=webhook   Stripe-Signature + 生の本文     → Stripe からの通知
 *
 *   ★Stripe の鍵(STRIPE_SECRET_KEY など)が無いあいだは 503 を返すだけ=今の利用者に影響なし。
 */

import { createBillingService, createStripeClient } from '../src/server/billingApi.js';
import { upstash } from '../src/server/deviceStore.js';

/** webhook の署名は生の本文で確かめる(Vercel の自動 JSON 解析を止める)。 */
export const config = { api: { bodyParser: false } };

export async function readRawBody(req) {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
  // ★req.body より先に生の流れを読む。Vercel の req.body は触った瞬間に JSON を解析する作りで、
  //   そこから JSON.stringify し直すと Stripe の整形済み本文と1文字でも違い、署名が必ず合わない
  //   (2026-11-06 本番の初回決済で webhook が全件失敗した)。
  if (typeof req.on === 'function' && req.readable !== false && !req.readableEnded) {
    const chunks = [];
    for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  }
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

/** 結果だけ記録する(コード・証明書・メールは書かない)。 */
export function logBilling(action, status) {
  try {
    console.log(JSON.stringify({ m: 'billing', action, status }));
  } catch {
    /* 記録の失敗で受け口を止めない */
  }
}

export default async function handler(req, res, deps = {}) {
  res.setHeader('Cache-Control', 'no-store');
  const action = String(req.query?.action || '');
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method' });
      return;
    }
    const stripe = deps.stripe || createStripeClient();
    if (!stripe.configured) {
      logBilling(action, 503);
      res.status(503).json({ ok: false, error: 'billing_not_configured' });
      return;
    }
    const svc = createBillingService({ upstash: deps.upstash || upstash, stripe, ...deps.service });
    const raw = await readRawBody(req);
    let r;
    if (action === 'webhook') {
      r = await svc.webhook({ rawBody: raw, signature: String(req.headers?.['stripe-signature'] || '') });
    } else {
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = {};
      }
      const code = String(req.headers?.['x-supporter-code'] || body.code || '');
      if (action === 'checkout') r = await svc.checkout({ plan: body.plan === 'monthly' ? 'monthly' : 'yearly' });
      else if (action === 'claim') r = await svc.claim({ sessionId: body.sessionId });
      else if (action === 'license') r = await svc.license({ code, device: String(req.headers?.['x-supporter-device'] || '') });
      else if (action === 'devices_reset') r = await svc.devicesReset({ code });
      else if (action === 'portal') r = await svc.portal({ code });
      else r = { status: 404, body: { ok: false, error: 'unknown_action' } };
    }
    logBilling(action, r.status);
    res.status(r.status).json(r.body);
  } catch (e) {
    logBilling(action, 500);
    res.status(500).json({ ok: false, error: String(e?.message || 'error').slice(0, 60) });
  }
}
