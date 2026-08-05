import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentSrc = fs
  .readFileSync(path.join(root, 'extension/content-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function ensureHostBody() {
  const i = contentSrc.indexOf('function ensureInlinePopupHost()');
  if (i < 0) return '';
  const end = contentSrc.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10), i);
  return end < 0 ? contentSrc.slice(i) : contentSrc.slice(i, end + 2);
}

/**
 * ★v0.1.1264: パネルが「同じ1ミリ秒に3個」作られる問題の再発防止。
 *   実測(2026-08-05): host_created が 1785910801850/851/851 の3回。
 *   createElement した host は appendChild 前で DOM に無いため、
 *   再入すると pickPrimaryInlinePopupHostFromDom で見つからず作り直される。
 */
describe('パネルを二重に作らない配線', () => {
  it('★作った直後に singleton へ登録している(再入で作り直させない)', () => {
    const body = ensureHostBody();
    const create = body.indexOf("host = document.createElement('div')");
    const assign = body.indexOf('nlsInlinePopupHostSingleton = host;', create);
    const setDisplay = body.indexOf("setInlineHostDisplay(host, 'none', 'host_created')");
    expect(create).toBeGreaterThan(-1);
    expect(assign).toBeGreaterThan(-1);
    expect(setDisplay).toBeGreaterThan(-1);
    // ★display を触るより前に登録すること(触った時点で再入されうるため)。
    expect(assign).toBeLessThan(setDisplay);
  });

  it('★singleton による早期returnが残っている(登録が効く先)', () => {
    const body = ensureHostBody();
    expect(body).toMatch(/if \(\n?\s*nlsInlinePopupHostSingleton &&/);
    expect(body).toMatch(/return nlsInlinePopupHostSingleton;/);
  });

  it('★DOM からの取得を最優先のまま残している(既存の正しい経路を壊さない)', () => {
    const body = ensureHostBody();
    const pick = body.indexOf('pickPrimaryInlinePopupHostFromDom()');
    const create = body.indexOf("host = document.createElement('div')");
    expect(pick).toBeGreaterThan(-1);
    expect(pick).toBeLessThan(create);
  });

  it('★パネル本体の新規作成は1箇所だけ(作る場所を増やしていない)', () => {
    // 12981行にも createElement('div') はあるが、あちらは
    // DEEP_HARVEST_LOADING_HOST_ID(ローディング表示)で別物。
    // パネル本体は id を INLINE_POPUP_HOST_ID にする箇所で数える。
    const creates = contentSrc.match(/host\.id = INLINE_POPUP_HOST_ID;/g) || [];
    expect(creates.length).toBe(1);
  });

  it('host_created タグは1箇所のまま(計器の出所が散っていない)', () => {
    const tags = contentSrc.match(/'host_created'/g) || [];
    // setInlineHostDisplay と noteInlineHostMove の2箇所が正当。
    expect(tags.length).toBe(2);
  });
});
