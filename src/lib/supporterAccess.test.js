import { describe, expect, it, vi } from 'vitest';
import {
  KEY_SUPPORTER_CODE,
  KEY_SUPPORTER_DEVICE,
  KEY_SUPPORTER_FIRST_SEEN_AT,
  KEY_SUPPORTER_LICENSE,
  checkCreditBadge,
  checkMarketingAccess,
  saveSupporterCode
} from './supporterAccess.js';
import { TRIAL_MS, bytesToBase64url, deviceTagFor, encodeLicenseBody } from './supporterLicense.js';

const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 6);
const CODE = 'c'.repeat(43);

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    get: async (keys) => Object.fromEntries(keys.filter((k) => m.has(k)).map((k) => [k, m.get(k)])),
    set: async (items) => { for (const [k, v] of Object.entries(items)) m.set(k, v); },
    remove: async (keys) => { for (const k of keys) m.delete(k); }
  };
}

async function signer() {
  const k = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const x = /** @type {string} */ ((await crypto.subtle.exportKey('jwk', k.publicKey)).x);
  const make = async (exp, dev) => {
    const body = encodeLicenseBody({ kid: 'k1', sub: 'a', plan: 'yearly', feat: ['marketing'], iat: T0, exp, ...(dev ? { dev } : {}) });
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, k.privateKey, new TextEncoder().encode(body)));
    return `${body}.${bytesToBase64url(sig)}`;
  };
  return { keys: { k1: x }, make };
}

const okFetch = (license, active = true) =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, active, license }) }));

describe('supporterAccess', () => {
  it('関所が開いている版(既定)は何も聞かずに開ける・初めての日だけ記録する', async () => {
    const st = memStorage();
    const f = vi.fn();
    const r = await checkMarketingAccess({ storage: st, nowMs: T0, fetchImpl: f });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('gate_open');
    expect(st.m.get(KEY_SUPPORTER_FIRST_SEEN_AT)).toBe(T0);
    expect(f).not.toHaveBeenCalled();
  });

  it('関所を閉めると: お試し中は開く・過ぎたら閉じる(初めての日は上書きしない)', async () => {
    const st = memStorage({ [KEY_SUPPORTER_FIRST_SEEN_AT]: T0 });
    expect((await checkMarketingAccess({ storage: st, nowMs: T0 + DAY, enforced: true })).reason).toBe('trial');
    expect((await checkMarketingAccess({ storage: st, nowMs: T0 + TRIAL_MS + 1, enforced: true })).allowed).toBe(false);
    expect(st.m.get(KEY_SUPPORTER_FIRST_SEEN_AT)).toBe(T0);
  });

  it('コードがあり証明書が無ければ取りに行き、保存して開ける', async () => {
    const s = await signer();
    const lic = await s.make(T0 + 35 * DAY);
    const st = memStorage({ [KEY_SUPPORTER_FIRST_SEEN_AT]: T0 - 100 * DAY, [KEY_SUPPORTER_CODE]: CODE });
    const f = okFetch(lic);
    const r = await checkMarketingAccess({ storage: st, nowMs: T0, enforced: true, fetchImpl: f, publicKeys: s.keys });
    expect(r.reason).toBe('licensed');
    expect(st.m.get(KEY_SUPPORTER_LICENSE)).toBe(lic);
    expect(f.mock.calls[0][1].headers['x-supporter-code']).toBe(CODE);
  });

  it('サーバーに届かなくても、期限+7日の手元の証明書で開ける', async () => {
    const s = await signer();
    const lic = await s.make(T0 - 2 * DAY);
    const st = memStorage({ [KEY_SUPPORTER_FIRST_SEEN_AT]: T0 - 100 * DAY, [KEY_SUPPORTER_CODE]: CODE, [KEY_SUPPORTER_LICENSE]: lic });
    const f = vi.fn(async () => { throw new Error('offline'); });
    const r = await checkMarketingAccess({ storage: st, nowMs: T0, enforced: true, fetchImpl: f, publicKeys: s.keys });
    expect(r.reason).toBe('grace');
    expect(st.m.get(KEY_SUPPORTER_LICENSE)).toBe(lic);
  });

  it('解約済み(サーバーが active=false)なら手元の証明書を消す', async () => {
    const s = await signer();
    const lic = await s.make(T0 + 2 * DAY);
    const st = memStorage({ [KEY_SUPPORTER_FIRST_SEEN_AT]: T0 - 100 * DAY, [KEY_SUPPORTER_CODE]: CODE, [KEY_SUPPORTER_LICENSE]: lic });
    const r = await checkMarketingAccess({ storage: st, nowMs: T0, enforced: true, fetchImpl: okFetch(null, false), publicKeys: s.keys });
    expect(r.allowed).toBe(false);
    expect(st.m.has(KEY_SUPPORTER_LICENSE)).toBe(false);
  });

  it('コードの保存: 形違い・知らないコード・届かない・有効', async () => {
    const st = memStorage();
    expect(await saveSupporterCode({ storage: st, code: 'x' })).toBe('bad_format');
    const nf = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    expect(await saveSupporterCode({ storage: st, code: CODE, fetchImpl: nf })).toBe('unknown');
    expect(st.m.has(KEY_SUPPORTER_CODE)).toBe(false);
    const off = vi.fn(async () => { throw new Error('x'); });
    expect(await saveSupporterCode({ storage: st, code: CODE, fetchImpl: off })).toBe('offline');
    expect(st.m.get(KEY_SUPPORTER_CODE)).toBe(CODE);
    expect(await saveSupporterCode({ storage: st, code: ` ${CODE} `, fetchImpl: okFetch('lic') })).toBe('ok');
    expect(st.m.get(KEY_SUPPORTER_LICENSE)).toBe('lic');
  });
});

describe('supporterAccess: コメビュの隅の印', () => {
  it('既定(関所が開いている)は出さない・通信しない', async () => {
    expect(await checkCreditBadge({ storage: memStorage() })).toBe(false);
  });
  it('関所を閉めると無料の人に出し、有効な証明書があれば出さない', async () => {
    const s = await signer();
    const lic = await s.make(T0 + 30 * DAY);
    expect(await checkCreditBadge({ storage: memStorage(), enforced: true, nowMs: T0 })).toBe(true);
    expect(await checkCreditBadge({ storage: memStorage({ [KEY_SUPPORTER_LICENSE]: lic }), enforced: true, nowMs: T0, publicKeys: s.keys })).toBe(false);
  });
  it('読めないときは出さない側', async () => {
    const broken = { get: async () => { throw new Error('x'); }, set: async () => {} };
    expect(await checkCreditBadge({ storage: broken, enforced: true })).toBe(false);
  });
});

describe('supporterAccess: 1コード1台(v0.1.1896)', () => {
  const MY = 'm'.repeat(24);
  const OTHER = 'o'.repeat(24);

  it('この PC の印を1回だけ作って保存し、証明書の取り直しで送る', async () => {
    const st = memStorage({ [KEY_SUPPORTER_FIRST_SEEN_AT]: T0 - 100 * DAY, [KEY_SUPPORTER_CODE]: CODE });
    const f = okFetch(null, false);
    await checkMarketingAccess({ storage: st, nowMs: T0, enforced: true, fetchImpl: f });
    const id = st.m.get(KEY_SUPPORTER_DEVICE);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThanOrEqual(16);
    expect(f.mock.calls[0][1].headers['x-supporter-device']).toBe(id);
    await checkMarketingAccess({ storage: st, nowMs: T0, enforced: true, fetchImpl: f });
    expect(st.m.get(KEY_SUPPORTER_DEVICE)).toBe(id);
  });

  it('ほかの PC 用の証明書は使わない(コピーしても開かない)・この PC 用なら開く', async () => {
    const s = await signer();
    const mine = await s.make(T0 + 30 * DAY, await deviceTagFor(MY));
    const theirs = await s.make(T0 + 30 * DAY, await deviceTagFor(OTHER));
    const base = { [KEY_SUPPORTER_FIRST_SEEN_AT]: T0 - 100 * DAY, [KEY_SUPPORTER_DEVICE]: MY };
    const ok = await checkMarketingAccess({ storage: memStorage({ ...base, [KEY_SUPPORTER_LICENSE]: mine }), nowMs: T0, enforced: true, publicKeys: s.keys });
    expect(ok.reason).toBe('licensed');
    const ng = await checkMarketingAccess({ storage: memStorage({ ...base, [KEY_SUPPORTER_LICENSE]: theirs }), nowMs: T0, enforced: true, publicKeys: s.keys });
    expect(ng.allowed).toBe(false);
    expect(await checkCreditBadge({ storage: memStorage({ ...base, [KEY_SUPPORTER_LICENSE]: theirs }), enforced: true, nowMs: T0, publicKeys: s.keys })).toBe(true);
  });

  it('別の PC で使われているコードは device_limit(コードは保存する)', async () => {
    const st = memStorage();
    const busy = vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: 'device_limit' }) }));
    expect(await saveSupporterCode({ storage: st, code: CODE, fetchImpl: busy })).toBe('device_limit');
    expect(st.m.get(KEY_SUPPORTER_CODE)).toBe(CODE);
    expect(st.m.has(KEY_SUPPORTER_LICENSE)).toBe(false);
    const st2 = memStorage({ [KEY_SUPPORTER_FIRST_SEEN_AT]: T0 - 100 * DAY, [KEY_SUPPORTER_CODE]: CODE });
    const r = await checkMarketingAccess({ storage: st2, nowMs: T0, enforced: true, fetchImpl: busy });
    expect(r.deviceLimit).toBe(true);
    expect(r.allowed).toBe(false);
  });
});
