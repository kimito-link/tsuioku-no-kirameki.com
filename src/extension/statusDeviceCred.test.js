import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://app.example';
const ISSUED = { ok: true, deviceId: 'd'.repeat(22), writeKey: 'w'.repeat(43), viewToken: 'v'.repeat(32) };
const flush = () => new Promise((r) => setTimeout(r, 5));

describe('statusDeviceCred(拡張側の利用者ごとの鍵・v0.1.1731)', () => {
  let store; let fetchMock; let mod;
  beforeEach(async () => {
    vi.resetModules();
    store = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (k) => ({ [k]: store[k] }),
          set: async (o) => { Object.assign(store, o); },
          remove: async (k) => { delete store[k]; }
        }
      }
    });
    fetchMock = vi.fn(async (_url, init) => {
      if (init.method === 'POST') return { ok: true, status: 200, json: async () => ISSUED };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    mod = await import('./statusDeviceCred.js');
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('★同意していなければ鍵をもらいに行かない(通信もしない)', async () => {
    mod.maybeRegisterDevice({ optedIn: false, uploadCfg: { appOrigin: ORIGIN } });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mod.getPublishCredentials({ appOrigin: ORIGIN })).toBeNull();
  });

  it('★共有キーがあれば鍵をもらいに行かない', async () => {
    mod.maybeRegisterDevice({ optedIn: true, uploadCfg: { ingestKey: 'k', viewToken: 'tok', appOrigin: ORIGIN } });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('★同意 ON・鍵なしなら1回だけもらって保存し、その鍵で送れる', async () => {
    mod.maybeRegisterDevice({ optedIn: true, uploadCfg: { appOrigin: ORIGIN } });
    mod.maybeRegisterDevice({ optedIn: true, uploadCfg: { appOrigin: ORIGIN } }); // 取得中=二重に行かない
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${ORIGIN}/api/device`);
    expect(store.nls_status_device_cred_v1).toMatchObject({ deviceId: ISSUED.deviceId, appOrigin: ORIGIN });
    expect(mod.getPublishCredentials({ appOrigin: ORIGIN })?.mode).toBe('device');
  });

  it('別の画面が先に鍵を保存していれば、それを使う(発行しない)', async () => {
    store.nls_status_device_cred_v1 = { deviceId: ISSUED.deviceId, writeKey: ISSUED.writeKey, viewToken: ISSUED.viewToken, appOrigin: ORIGIN };
    mod.maybeRegisterDevice({ optedIn: true, uploadCfg: { appOrigin: ORIGIN } });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mod.getPublishCredentials({ appOrigin: ORIGIN })?.viewToken).toBe(ISSUED.viewToken);
  });

  it('★同意 OFF: サーバーへ DELETE してから鍵を消す', async () => {
    store.nls_status_device_cred_v1 = { deviceId: ISSUED.deviceId, writeKey: ISSUED.writeKey, viewToken: ISSUED.viewToken, appOrigin: ORIGIN };
    await mod.refreshDeviceCredCache(ORIGIN);
    expect(await mod.deleteDeviceOnServer(ORIGIN)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ORIGIN}/api/device`);
    expect(init).toMatchObject({ method: 'DELETE', headers: { 'x-device-id': ISSUED.deviceId, 'x-write-key': ISSUED.writeKey } });
    expect(store.nls_status_device_cred_v1).toBeUndefined();
    expect(mod.getPublishCredentials({ appOrigin: ORIGIN })).toBeNull();
  });

  it('同意 OFF で削除が失敗しても、鍵は消す(以後は送らない)', async () => {
    store.nls_status_device_cred_v1 = { deviceId: ISSUED.deviceId, writeKey: ISSUED.writeKey, viewToken: ISSUED.viewToken, appOrigin: ORIGIN };
    fetchMock.mockImplementation(async () => { throw new Error('offline'); });
    expect(await mod.deleteDeviceOnServer(ORIGIN)).toBe(false);
    expect(store.nls_status_device_cred_v1).toBeUndefined();
  });

  it('鍵が無いときの同意 OFF は何も通信しない', async () => {
    expect(await mod.deleteDeviceOnServer(ORIGIN)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
