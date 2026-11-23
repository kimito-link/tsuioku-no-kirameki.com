import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COMMISSION_SOURCE,
  REFERRAL_TTL_MS,
  commissionPlan,
  invoiceSubscriptionId,
  isSelfReferral,
  normalizeReferralCode,
  readRememberedReferralCode,
  refundPlan,
  rememberReferralCode,
  resolveReferralCode,
  subscriptionMetadata,
  supporterHrefWithRef
} from './referralAttribution.js';

const DAY = 24 * 60 * 60 * 1000;

function mem() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); }
  };
}

function invoice(over = {}) {
  return {
    id: 'in_abc123',
    currency: 'jpy',
    amount_paid: 980,
    created: 1_763_600_000,
    ...over
  };
}

describe('referralAttribution', () => {
  it('ブラウザ用のコピーは中身が同じ', () => {
    const lib = readFileSync(new URL('./referralAttribution.js', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../../app/referral-attribution.js', import.meta.url), 'utf8');
    expect(app).toBe(lib);
  });

  it('紹介コードは台帳と同じ形だけ通す', () => {
    expect(normalizeReferralCode(' RH-1234 ')).toBe('RH-1234');
    expect(normalizeReferralCode('rh_1')).toBe('rh_1');
    expect(normalizeReferralCode('')).toBeNull();
    expect(normalizeReferralCode('コード')).toBeNull();
    expect(normalizeReferralCode('a'.repeat(33))).toBeNull();
  });

  it('最後に踏んだリンクを90日覚え、期限と未来の時刻は捨てる', () => {
    const storage = mem();
    const now = Date.UTC(2026, 10, 20);
    expect(rememberReferralCode(storage, 'RH-1', now)).toBe('RH-1');
    expect(readRememberedReferralCode(storage, now + 90 * DAY)).toBe('RH-1');
    expect(readRememberedReferralCode(storage, now + REFERRAL_TTL_MS + 1)).toBeNull();
    rememberReferralCode(storage, 'RH-2', now);
    expect(readRememberedReferralCode(storage, now - 61_000)).toBeNull();
  });

  it('URL のコードが正しければ保存を上書きし、壊れていれば保存を使う', () => {
    const storage = mem();
    resolveReferralCode(storage, 'RH-OLD', 1);
    expect(resolveReferralCode(storage, 'not a code', 2)).toBe('RH-OLD');
    expect(resolveReferralCode(storage, 'RH-NEW', 3)).toBe('RH-NEW');
    expect(readRememberedReferralCode(storage, 3)).toBe('RH-NEW');
  });

  it('サポーターページの https リンクだけに ref を足す', () => {
    const next = supporterHrefWithRef('https://app.tsuioku-no-kirameki.com/supporter', 'RH-1');
    expect(next).toBe('https://app.tsuioku-no-kirameki.com/supporter?ref=RH-1');
    expect(supporterHrefWithRef('https://app.tsuioku-no-kirameki.com/supporter/?ref=KEEP', 'RH-1')).toBeNull();
    expect(supporterHrefWithRef('http://app.tsuioku-no-kirameki.com/supporter', 'RH-1')).toBeNull();
    expect(supporterHrefWithRef('https://example.com/supporter', 'RH-1')).toBeNull();
    expect(supporterHrefWithRef('https://app.tsuioku-no-kirameki.com/', 'RH-1')).toBeNull();
  });

  it('Subscription の metadata に source と ref を載せ、client 用の別枠は作らない', () => {
    expect(subscriptionMetadata('RH-1')).toEqual({ source: COMMISSION_SOURCE, ref: 'RH-1' });
    expect(subscriptionMetadata('???')).toEqual({ source: COMMISSION_SOURCE });
  });

  it('新しい請求の subscription も古い形の subscription も読む', () => {
    expect(invoiceSubscriptionId({ subscription: 'sub_old' })).toBe('sub_old');
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_new' } } })).toBe('sub_new');
  });

  it('送る支払いは台帳の項目だけ', () => {
    const plan = commissionPlan({
      invoice: invoice(),
      metadata: { source: 'tsuioku', ref: 'RH-9' }
    });
    expect(plan.action).toBe('send');
    expect(Object.keys(plan.body).sort()).toEqual(['amountYen', 'eventId', 'kind', 'occurredAt', 'referralCode', 'source']);
    expect(plan.body).toEqual({
      eventId: 'in_abc123',
      source: 'tsuioku',
      referralCode: 'RH-9',
      kind: 'recurring',
      amountYen: 980,
      occurredAt: new Date(1_763_600_000 * 1000).toISOString()
    });
    expect(JSON.stringify(plan.body)).not.toMatch(/email|name|line|customer/i);
  });

  it('0円・紹介なし・他サービス・自己紹介は送らない', () => {
    const meta = { source: 'tsuioku', ref: 'RH-9' };
    expect(commissionPlan({ invoice: invoice({ amount_paid: 0 }), metadata: meta }).reason).toBe('zero');
    expect(commissionPlan({ invoice: invoice(), metadata: { source: 'tsuioku' } }).reason).toBe('no_ref');
    expect(commissionPlan({ invoice: invoice(), metadata: { source: 'other', ref: 'RH-9' } }).reason).toBe('source');
    expect(commissionPlan({
      invoice: invoice({ customer_email: 'Fan@Example.com' }),
      metadata: meta,
      ownerEmail: 'fan@example.com'
    }).reason).toBe('self');
    expect(commissionPlan({ invoice: invoice(), metadata: meta, ownerEmail: null }).action).toBe('send');
    expect(commissionPlan({ invoice: invoice({ currency: 'usd' }), metadata: meta }).action).toBe('bad_currency');
  });

  it('自己紹介は両方のメールが同じときだけ', () => {
    expect(isSelfReferral('A@b.co', 'a@b.co')).toBe(true);
    expect(isSelfReferral('a@b.co', 'c@b.co')).toBe(false);
    expect(isSelfReferral('a@b.co', null)).toBe(false);
  });

  it('返金は元の支払いのあとに累計額を送る。0円の返金は返金側を送らない', () => {
    const paid = refundPlan({ invoice: invoice(), metadata: { source: 'tsuioku', ref: 'RH-9' }, refundedAmountYen: 100 });
    expect(paid.refund).toEqual({ eventId: 'in_abc123', source: 'tsuioku', refundedAmountYen: 100, reason: 'refund' });
    const none = refundPlan({ invoice: invoice(), metadata: { source: 'tsuioku', ref: 'RH-9' }, refundedAmountYen: 0 });
    expect(none.refund).toBeNull();
    expect(refundPlan({ invoice: invoice({ amount_paid: 0 }), metadata: { source: 'tsuioku', ref: 'RH-9' }, refundedAmountYen: 100 }).reason).toBe('zero');
  });
});
