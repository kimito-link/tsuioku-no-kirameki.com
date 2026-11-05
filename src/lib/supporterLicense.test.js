import { describe, expect, it } from 'vitest';
import {
  GRACE_MS,
  TRIAL_MS,
  bytesToBase64url,
  decideFeatureAccess,
  deviceTagFor,
  encodeLicenseBody,
  isValidDeviceId,
  isValidSupporterCode,
  parseLicenseToken,
  shouldRefreshLicense,
  shouldShowCreditBadge,
  verifyLicenseToken
} from './supporterLicense.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 6);

async function keyPair() {
  const k = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', k.publicKey);
  return { k, x: /** @type {string} */ (pub.x) };
}

async function makeToken(k, payload) {
  const body = encodeLicenseBody(payload);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, k.privateKey, new TextEncoder().encode(body)));
  return `${body}.${bytesToBase64url(sig)}`;
}

const basePayload = { kid: 'k1', sub: 'acct1', plan: 'yearly', feat: ['marketing'], iat: T0, exp: T0 + 30 * DAY };

describe('supporterLicense: 証明書の形と署名', () => {
  it('正しい署名は valid・期限後7日は expired_grace・その後は expired', async () => {
    const { k, x } = await keyPair();
    const tok = await makeToken(k, basePayload);
    const keys = { k1: x };
    expect((await verifyLicenseToken(tok, { nowMs: T0 + DAY, publicKeys: keys })).status).toBe('valid');
    expect((await verifyLicenseToken(tok, { nowMs: T0 + 30 * DAY + GRACE_MS - 1, publicKeys: keys })).status).toBe('expired_grace');
    expect((await verifyLicenseToken(tok, { nowMs: T0 + 30 * DAY + GRACE_MS + 1, publicKeys: keys })).status).toBe('expired');
  });

  it('中身を書き換えると bad_signature(期限を延ばした偽物は通らない)', async () => {
    const { k, x } = await keyPair();
    const tok = await makeToken(k, basePayload);
    const forgedBody = encodeLicenseBody({ ...basePayload, exp: T0 + 9999 * DAY });
    const forged = `${forgedBody}.${tok.split('.')[1]}`;
    expect((await verifyLicenseToken(forged, { nowMs: T0, publicKeys: { k1: x } })).status).toBe('bad_signature');
  });

  it('別の鍵で署名したものは bad_signature・知らない鍵番号は unknown_key', async () => {
    const a = await keyPair();
    const b = await keyPair();
    const tok = await makeToken(b.k, basePayload);
    expect((await verifyLicenseToken(tok, { nowMs: T0, publicKeys: { k1: a.x } })).status).toBe('bad_signature');
    expect((await verifyLicenseToken(tok, { nowMs: T0, publicKeys: { k2: a.x } })).status).toBe('unknown_key');
  });

  it('鍵を替えても古い鍵番号の証明書は有効(公開鍵を残す運用)', async () => {
    const old = await keyPair();
    const neu = await keyPair();
    const tok = await makeToken(old.k, basePayload);
    expect((await verifyLicenseToken(tok, { nowMs: T0, publicKeys: { k1: old.x, k2: neu.x } })).status).toBe('valid');
  });

  it('Ed25519 が使えない環境は unverifiable(使える側に倒すための印)', async () => {
    const { k, x } = await keyPair();
    const tok = await makeToken(k, basePayload);
    expect((await verifyLicenseToken(tok, { nowMs: T0, publicKeys: { k1: x }, subtle: null })).status).toBe('unverifiable');
  });

  it('形が壊れたものは malformed・知らないフィールドが増えても読める', async () => {
    expect(parseLicenseToken('abc')).toBeNull();
    expect(parseLicenseToken(null)).toBeNull();
    expect(parseLicenseToken('e30.xx')).toBeNull(); // {}
    const body = bytesToBase64url(new TextEncoder().encode(JSON.stringify({ ...basePayload, v: 1, future: { a: 1 } })));
    expect(parseLicenseToken(`${body}.sig`)?.payload.sub).toBe('acct1');
    expect((await verifyLicenseToken('x.y', { nowMs: T0 })).status).toBe('malformed');
  });
});

describe('supporterLicense: マーケ HTML を開けるか', () => {
  const base = { enforced: true, licenseStatus: null, firstSeenAtMs: T0, nowMs: T0 };
  it('関所が開いているあいだは誰でも開ける(既定)', () => {
    expect(decideFeatureAccess({ ...base, enforced: false, nowMs: T0 + 999 * DAY })).toMatchObject({ allowed: true, reason: 'gate_open' });
  });
  it('お試し14日のあいだは開ける・過ぎたら閉じる', () => {
    expect(decideFeatureAccess({ ...base, nowMs: T0 + 13 * DAY })).toMatchObject({ allowed: true, reason: 'trial', trialDaysLeft: 1 });
    expect(decideFeatureAccess({ ...base, nowMs: T0 + TRIAL_MS + 1 })).toMatchObject({ allowed: false, reason: 'locked' });
  });
  it('有効な証明書・猶予中は開ける。期限切れ・偽物は閉じる', () => {
    const later = { ...base, nowMs: T0 + 100 * DAY };
    expect(decideFeatureAccess({ ...later, licenseStatus: 'valid' }).reason).toBe('licensed');
    expect(decideFeatureAccess({ ...later, licenseStatus: 'expired_grace' }).reason).toBe('grace');
    expect(decideFeatureAccess({ ...later, licenseStatus: 'expired' }).allowed).toBe(false);
    expect(decideFeatureAccess({ ...later, licenseStatus: 'bad_signature' }).allowed).toBe(false);
    expect(decideFeatureAccess({ ...later, licenseStatus: 'unknown_key' }).allowed).toBe(false);
    expect(decideFeatureAccess({ ...later, licenseStatus: 'unverifiable' }).allowed).toBe(true);
  });
  it('証明書にマーケが入っていなければ閉じる', () => {
    expect(decideFeatureAccess({ ...base, nowMs: T0 + 100 * DAY, licenseStatus: 'valid', licenseFeatures: ['other'] }).allowed).toBe(false);
  });
  it('初めて使った日が分からないときはお試しを丸ごと残す', () => {
    expect(decideFeatureAccess({ ...base, firstSeenAtMs: null }).trialDaysLeft).toBe(14);
  });
});

describe('supporterLicense: 取り直しとコードの形', () => {
  it('期限まで10日を切ったら取り直す・コードが無ければ取らない', () => {
    const payload = { ...basePayload, v: 1 };
    expect(shouldRefreshLicense({ hasCode: true, payload, nowMs: T0 })).toBe(false);
    expect(shouldRefreshLicense({ hasCode: true, payload, nowMs: T0 + 21 * DAY })).toBe(true);
    expect(shouldRefreshLicense({ hasCode: true, payload: null, nowMs: T0 })).toBe(true);
    expect(shouldRefreshLicense({ hasCode: false, payload: null, nowMs: T0 })).toBe(false);
  });
  it('コードの形', () => {
    expect(isValidSupporterCode('a'.repeat(43))).toBe(true);
    expect(isValidSupporterCode(' ' + 'a'.repeat(43) + ' ')).toBe(true);
    expect(isValidSupporterCode('short')).toBe(false);
    expect(isValidSupporterCode('a'.repeat(42) + '!')).toBe(false);
    expect(isValidSupporterCode(123)).toBe(false);
  });
});

describe('supporterLicense: コメビュの隅の印', () => {
  it('関所が開いているあいだは誰にも出さない', () => {
    expect(shouldShowCreditBadge({ enforced: false, licenseStatus: null })).toBe(false);
  });
  it('無料・期限切れ・偽物には出す/サポーターには出さない', () => {
    expect(shouldShowCreditBadge({ enforced: true, licenseStatus: null })).toBe(true);
    expect(shouldShowCreditBadge({ enforced: true, licenseStatus: 'expired' })).toBe(true);
    expect(shouldShowCreditBadge({ enforced: true, licenseStatus: 'bad_signature' })).toBe(true);
    expect(shouldShowCreditBadge({ enforced: true, licenseStatus: 'valid' })).toBe(false);
    expect(shouldShowCreditBadge({ enforced: true, licenseStatus: 'expired_grace' })).toBe(false);
    expect(shouldShowCreditBadge({ enforced: true, licenseStatus: 'unverifiable' })).toBe(false);
  });
});

describe('supporterLicense: PC の印(1コード1台)', () => {
  it('印の形・同じ印は同じ dev・違う印は違う dev・作れない環境は null', async () => {
    expect(isValidDeviceId('a'.repeat(24))).toBe(true);
    expect(isValidDeviceId('short')).toBe(false);
    expect(isValidDeviceId('a b'.repeat(10))).toBe(false);
    const a = await deviceTagFor('a'.repeat(24));
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(await deviceTagFor('a'.repeat(24))).toBe(a);
    expect(await deviceTagFor('b'.repeat(24))).not.toBe(a);
    expect(await deviceTagFor('a'.repeat(24), null)).toBeNull();
    expect(await deviceTagFor('bad')).toBeNull();
  });
  it('証明書の dev は読み取りで残り、無い証明書も読める(後方互換)', () => {
    const withDev = encodeLicenseBody({ kid: 'k', sub: 's', plan: 'yearly', feat: [], iat: 1, exp: 2, dev: 'abc' });
    expect(parseLicenseToken(`${withDev}.x`)?.payload.dev).toBe('abc');
    const noDev = encodeLicenseBody({ kid: 'k', sub: 's', plan: 'yearly', feat: [], iat: 1, exp: 2 });
    expect(parseLicenseToken(`${noDev}.x`)?.payload.dev).toBeUndefined();
  });
});

describe('supporterLicense: 本番の公開鍵', () => {
  it('k2026a は Ed25519 の公開鍵として読める(32バイト)', async () => {
    const { LICENSE_PUBLIC_KEYS } = await import('./supporterLicense.js');
    const x = LICENSE_PUBLIC_KEYS.k2026a;
    expect(base64urlToBytesForTest(x).length).toBe(32);
    await expect(
      crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x }, { name: 'Ed25519' }, false, ['verify'])
    ).resolves.toBeTruthy();
  });
});

/** @param {string} s */
function base64urlToBytesForTest(s) {
  return Uint8Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}
