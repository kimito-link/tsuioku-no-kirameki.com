import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stampSwScript, SW_STAMP_PREFIX } from './swScriptStamp.js';

describe('stampSwScript', () => {
  const base = '/**\n * MV3\n */\n\nimportScripts("a.js");\n';
  it('説明コメントの直後に1行入れる', () => {
    const out = stampSwScript(base, 'abc123');
    expect(out).toContain(`*/\n${SW_STAMP_PREFIX}abc123\n`);
    expect(out).toContain('importScripts("a.js");');
  });
  it('2回目は同じ行を書き換える(増えない)', () => {
    const once = stampSwScript(base, 'abc123');
    const twice = stampSwScript(once, 'def456');
    expect(twice.split(SW_STAMP_PREFIX).length).toBe(2);
    expect(twice).toContain(`${SW_STAMP_PREFIX}def456`);
  });
  it('同じ指紋なら中身は変わらない', () => {
    const once = stampSwScript(base, 'abc123');
    expect(stampSwScript(once, 'abc123')).toBe(once);
  });
  it('空の指紋なら触らない', () => {
    expect(stampSwScript(base, '')).toBe(base);
  });
  it('本体に刻まれていて、build が刻む配線がある', () => {
    const sw = readFileSync(new URL('../../extension/background.js', import.meta.url), 'utf8');
    expect(sw).toMatch(/^\/\/ nls-sw-fingerprint: [0-9a-f]{12}$/m);
    const build = readFileSync(new URL('../../scripts/build.mjs', import.meta.url), 'utf8');
    expect(build).toContain('stampSwScript(');
  });
  it('刻まれた指紋が今の dist の指紋と一致する(build し忘れの検出)', () => {
    const sw = readFileSync(new URL('../../extension/background.js', import.meta.url), 'utf8');
    const fp = JSON.parse(readFileSync(new URL('../../.dist-fingerprint.json', import.meta.url), 'utf8')).fingerprint;
    expect(sw).toContain(`${SW_STAMP_PREFIX}${String(fp).slice(0, 12)}`);
  });
});
