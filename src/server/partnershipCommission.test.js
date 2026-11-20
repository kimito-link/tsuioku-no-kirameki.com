import { describe, expect, it, vi } from 'vitest';
import { COMMISSION_EVENTS_PATH, COMMISSION_REFUND_PATH } from '../lib/referralAttribution.js';
import { reportPaidInvoice, reportRefundedCharge } from './partnershipCommission.js';

const ENV = {
  PARTNERSHIP_COMMISSION_URL: 'https://partner.example.test/',
  PARTNERSHIP_COMMISSION_SECRET: 'secret-tsuioku'
};

function invoice(over = {}) {
  return {
    id: 'in_abc123',
    currency: 'jpy',
    amount_paid: 9800,
    created: 1_763_600_000,
    subscription: 'sub_1',
    parent: { subscription_details: { metadata: { source: 'tsuioku', ref: 'RH-1234' } } },
    ...over
  };
}

function fetchOk(body = { ok: true }) {
  const calls = [];
  const fetchImpl = vi.fn(async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => body };
  });
  return { fetchImpl, calls };
}

describe('partnershipCommission', () => {
  it('支払いを台帳の URL へ Bearer で1回送る', async () => {
    const { fetchImpl, calls } = fetchOk();
    const r = await reportPaidInvoice(invoice(), { stripe: {}, env: ENV, fetchImpl });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://partner.example.test${COMMISSION_EVENTS_PATH}`);
    expect(calls[0].init.headers.authorization).toBe('Bearer secret-tsuioku');
    expect(calls[0].body.referralCode).toBe('RH-1234');
    expect(calls[0].body.amountYen).toBe(9800);
    expect(calls[0].body.stripeCustomerId).toBeUndefined();
  });

  it('請求に metadata が無ければ Subscription を聞き直す', async () => {
    const { fetchImpl, calls } = fetchOk();
    const stripe = {
      getSubscription: vi.fn(async () => ({ metadata: { source: 'tsuioku', ref: 'RH-9' } }))
    };
    await reportPaidInvoice(invoice({ parent: undefined }), { stripe, env: ENV, fetchImpl });
    expect(stripe.getSubscription).toHaveBeenCalledWith('sub_1');
    expect(calls[0].body.referralCode).toBe('RH-9');
  });

  it('紹介が無い・0円・他サービスは送らず、秘密が無くても落とさない', async () => {
    const { fetchImpl } = fetchOk();
    expect((await reportPaidInvoice(invoice({ amount_paid: 0 }), { stripe: {}, env: {}, fetchImpl })).reason).toBe('zero');
    expect((await reportPaidInvoice(invoice({
      parent: { subscription_details: { metadata: { source: 'tsuioku' } } }
    }), { stripe: {}, env: {}, fetchImpl })).reason).toBe('no_ref');
    expect((await reportPaidInvoice(invoice({
      parent: { subscription_details: { metadata: { source: 'kimitolink', ref: 'RH-1' } } }
    }), { stripe: {}, env: {}, fetchImpl })).reason).toBe('source');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('紹介があるのに URL か秘密が無いときは Stripe に再送させる', async () => {
    await expect(reportPaidInvoice(invoice(), { stripe: {}, env: {}, fetchImpl: fetch })).rejects.toThrow('commission_not_configured');
  });

  it('知らないコードは打ち切り、サーバエラーは再送', async () => {
    const unknown = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'referral_not_found' }) }));
    const skipped = await reportPaidInvoice(invoice(), { stripe: {}, env: ENV, fetchImpl: unknown });
    expect(skipped.skipped).toBe('unknown_code');
    const down = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ ok: false }) }));
    await expect(reportPaidInvoice(invoice(), { stripe: {}, env: ENV, fetchImpl: down })).rejects.toThrow('commission_http_503');
  });

  it('持ち主のメールが同じときは送らない。不明なら送る', async () => {
    const { fetchImpl } = fetchOk();
    const bill = invoice({ customer_email: 'fan@example.com' });
    const skipped = await reportPaidInvoice(bill, {
      stripe: {}, env: ENV, fetchImpl, ownerEmail: async () => 'Fan@Example.com'
    });
    expect(skipped.reason).toBe('self');
    expect(fetchImpl).not.toHaveBeenCalled();
    await reportPaidInvoice(bill, { stripe: {}, env: ENV, fetchImpl, ownerEmail: async () => null });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('返金は支払いのあと累計額を送る。0円の返金は返金側を送らない', async () => {
    const { fetchImpl, calls } = fetchOk();
    const stripe = { getInvoice: vi.fn(async () => invoice()) };
    await reportRefundedCharge({ invoice: 'in_abc123', amount_refunded: 1000 }, { stripe, env: ENV, fetchImpl });
    expect(calls.map((c) => c.url)).toEqual([
      `https://partner.example.test${COMMISSION_EVENTS_PATH}`,
      `https://partner.example.test${COMMISSION_REFUND_PATH}`
    ]);
    expect(calls[1].body).toEqual({ eventId: 'in_abc123', source: 'tsuioku', refundedAmountYen: 1000, reason: 'refund' });

    const zero = fetchOk();
    await reportRefundedCharge({ invoice: 'in_abc123', amount_refunded: 0 }, { stripe, env: ENV, fetchImpl: zero.fetchImpl });
    expect(zero.calls).toHaveLength(1);
  });

  it('知らないコードの返金は返金側を送らない', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: 'referral_not_found' }) }));
    const stripe = { getInvoice: vi.fn(async () => invoice()) };
    const r = await reportRefundedCharge({ invoice: 'in_abc123', amount_refunded: 9800 }, { stripe, env: ENV, fetchImpl });
    expect(r.skipped).toBe('unknown_code');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('請求 ID が charge に無いときは InvoicePayment が1件のときだけ使う', async () => {
    const { fetchImpl, calls } = fetchOk();
    const stripe = {
      getInvoice: vi.fn(async (id) => invoice({ id })),
      listInvoicePayments: vi.fn(async () => ({ data: [{ invoice: 'in_frompi' }] }))
    };
    await reportRefundedCharge({ payment_intent: 'pi_1', amount_refunded: 500 }, { stripe, env: ENV, fetchImpl });
    expect(stripe.getInvoice).toHaveBeenCalledWith('in_frompi');
    expect(calls[1].body.eventId).toBe('in_frompi');

    stripe.listInvoicePayments.mockResolvedValueOnce({ data: [{ invoice: 'in_a' }, { invoice: 'in_b' }] });
    await expect(reportRefundedCharge(
      { payment_intent: 'pi_2', amount_refunded: 500 },
      { stripe, env: ENV, fetchImpl }
    )).rejects.toThrow('commission_ambiguous_refund');
  });
});
