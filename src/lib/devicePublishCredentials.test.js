import { describe, expect, it } from 'vitest';
import {
  DEVICE_REGISTER_RETRY_MS,
  buildPublishBody,
  deviceApiUrl,
  parseDeviceCred,
  resolvePublishCredentials,
  shouldForgetDeviceCred,
  shouldRegisterDevice
} from './devicePublishCredentials.js';

const ORIGIN = 'https://app.example';
const CRED = { deviceId: 'd'.repeat(22), writeKey: 'w'.repeat(43), viewToken: 'v'.repeat(32), appOrigin: ORIGIN };

describe('devicePublishCredentials(スマホ版の利用者ごとの鍵・v0.1.1731)', () => {
  it('壊れた鍵は null・送信先が無ければ既定の送信先', () => {
    expect(parseDeviceCred(CRED, 'x')).toEqual(CRED);
    expect(parseDeviceCred({ ...CRED, appOrigin: '' }, ORIGIN)?.appOrigin).toBe(ORIGIN);
    expect(parseDeviceCred({ ...CRED, writeKey: 'short' }, ORIGIN)).toBeNull();
    expect(parseDeviceCred({ ...CRED, viewToken: 'bad token' }, ORIGIN)).toBeNull();
    expect(parseDeviceCred(null, ORIGIN)).toBeNull();
  });
  it('★共有キーが揃っていれば必ず共有キー(開発者の送信は不変)', () => {
    const c = resolvePublishCredentials({ ingestKey: 'k', viewToken: 'tok', appOrigin: ORIGIN }, CRED);
    expect(c).toEqual({ mode: 'shared', viewToken: 'tok', appOrigin: ORIGIN, headers: { 'Content-Type': 'application/json', 'x-share-key': 'k' } });
  });
  it('★共有キーが無ければ利用者の鍵(共有キーのヘッダは付けない)・どちらも無ければ null', () => {
    const c = resolvePublishCredentials({ ingestKey: '', viewToken: '', appOrigin: ORIGIN }, CRED);
    expect(c?.mode).toBe('device');
    expect(c?.viewToken).toBe(CRED.viewToken);
    expect(c?.headers).toEqual({ 'Content-Type': 'application/json', 'x-device-id': CRED.deviceId, 'x-write-key': CRED.writeKey });
    expect(resolvePublishCredentials({ ingestKey: 'k' }, null)).toBeNull();
    expect(resolvePublishCredentials(undefined, null)).toBeNull();
  });
  it('★同意していなければ鍵をもらいに行かない。鍵がある・取得中なら行かない。失敗後は15分あける', () => {
    expect(shouldRegisterDevice({ optedIn: false })).toBe(false);
    expect(shouldRegisterDevice({ optedIn: true })).toBe(true);
    expect(shouldRegisterDevice({ optedIn: true, hasCredentials: true })).toBe(false);
    expect(shouldRegisterDevice({ optedIn: true, inFlight: true })).toBe(false);
    expect(shouldRegisterDevice({ optedIn: true, lastAttemptAtMs: 1000, nowMs: 1000 + DEVICE_REGISTER_RETRY_MS - 1 })).toBe(false);
    expect(shouldRegisterDevice({ optedIn: true, lastAttemptAtMs: 1000, nowMs: 1000 + DEVICE_REGISTER_RETRY_MS })).toBe(true);
  });
  it('鍵を捨てるのは利用者の鍵で 401 のときだけ', () => {
    expect(shouldForgetDeviceCred('device', 401)).toBe(true);
    expect(shouldForgetDeviceCred('device', 429)).toBe(false);
    expect(shouldForgetDeviceCred('shared', 401)).toBe(false);
  });
  it('本文: 共有キーは v を載せ、利用者の鍵では載せない', () => {
    const shared = resolvePublishCredentials({ ingestKey: 'k', viewToken: 'tok' }, null);
    const device = resolvePublishCredentials({}, CRED);
    expect(buildPublishBody(/** @type {any} */ (shared), { a: 1 })).toEqual({ a: 1, v: 'tok' });
    expect(buildPublishBody(/** @type {any} */ (device), { a: 1 })).toEqual({ a: 1 });
  });
  it('送信先 URL は末尾のスラッシュを落とす', () => {
    expect(deviceApiUrl('https://a.example/')).toBe('https://a.example/api/device');
  });
});
