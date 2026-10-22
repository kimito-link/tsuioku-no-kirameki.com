import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildPublishInit, gzipText } from './gzipBody.js';

describe('gzipBody: 送信本文を縮める(v0.1.1735)', () => {
  const json = JSON.stringify({ rows: Array.from({ length: 200 }, (_, i) => ({ name: 'りんく', text: 'わこつ', at: i })) });

  it('★縮めた本文は元の JSON に戻せて、ずっと小さい', async () => {
    const z = await gzipText(json);
    expect(z).toBeInstanceOf(Uint8Array);
    expect(gunzipSync(/** @type {Uint8Array} */ (z)).toString('utf8')).toBe(json);
    expect(/** @type {Uint8Array} */ (z).length).toBeLessThan(new TextEncoder().encode(json).length / 5);
  });

  it('★gzip のときは octet-stream + x-nls-body: gzip。認証ヘッダは残す', async () => {
    const { init, gzip } = await buildPublishInit({ 'Content-Type': 'application/json', 'x-share-key': 'k' }, json);
    expect(gzip).toBe(true);
    expect(init.headers).toEqual({ 'Content-Type': 'application/octet-stream', 'x-share-key': 'k', 'x-nls-body': 'gzip' });
  });

  it('縮めない指定(受け口が解けなかった後)は従来どおり JSON のまま', async () => {
    const { init, gzip } = await buildPublishInit({ 'Content-Type': 'application/json' }, json, { allowGzip: false });
    expect(gzip).toBe(false);
    expect(init.body).toBe(json);
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});
