import { describe, expect, it } from 'vitest';
import { parseShareKeysFile, shareKeysFingerprint } from './shareKeysFile.js';

describe('parseShareKeysFile', () => {
  it('★2つの鍵があれば取り出す(前後の空白は落とす・appOrigin は省略可)', () => {
    expect(parseShareKeysFile('{"ingestKey":" a ","viewToken":"b"}')).toEqual({ ok: true, ingestKey: 'a', viewToken: 'b', appOrigin: '', autoPublishConsent: false });
    expect(parseShareKeysFile('{"ingestKey":"a","viewToken":"b","appOrigin":"https://app.example.com"}')).toMatchObject({ ok: true, appOrigin: 'https://app.example.com' });
  });
  it('★どちらかが欠けたら拒否する', () => {
    expect(parseShareKeysFile('{"ingestKey":"a"}').ok).toBe(false);
    expect(parseShareKeysFile('{"viewToken":"b"}').ok).toBe(false);
    expect(parseShareKeysFile('{"ingestKey":"","viewToken":"b"}').ok).toBe(false);
  });
  it('★JSON でない・配列・数値の鍵は拒否する(落ちない)', () => {
    expect(parseShareKeysFile('not json').ok).toBe(false);
    expect(parseShareKeysFile('[1]').ok).toBe(false);
    expect(parseShareKeysFile('{"ingestKey":1,"viewToken":2}').ok).toBe(false);
    expect(parseShareKeysFile(undefined).ok).toBe(false);
  });
  it('★送信先は https のホスト名だけ許す(http・パス付き・他スキームは拒否)', () => {
    for (const bad of ['http://x.com', 'https://x.com/path', 'javascript:alert(1)', 'https://']) {
      expect(parseShareKeysFile(JSON.stringify({ ingestKey: 'a', viewToken: 'b', appOrigin: bad })).ok).toBe(false);
    }
  });
  it('★長すぎる値は拒否する', () => {
    expect(parseShareKeysFile(JSON.stringify({ ingestKey: 'a'.repeat(301), viewToken: 'b' })).ok).toBe(false);
  });
});

describe('parseShareKeysFile: 自動公開の同意', () => {
  const base = { ingestKey: 'a', viewToken: 'b' };
  it('★同意は true と明記されているときだけ(省略・"true"文字列・1 は同意なし)', () => {
    expect(parseShareKeysFile(JSON.stringify({ ...base, autoPublishConsent: true }))).toMatchObject({ ok: true, autoPublishConsent: true });
    for (const v of [undefined, 'true', 1, null, false]) {
      expect(parseShareKeysFile(JSON.stringify({ ...base, autoPublishConsent: v }))).toMatchObject({ ok: true, autoPublishConsent: false });
    }
  });
});

describe('shareKeysFingerprint', () => {
  const base = { ingestKey: 'a', viewToken: 'b', appOrigin: 'https://x.example', autoPublishConsent: true };
  it('★同じ内容なら同じ指紋・どれか1つでも変われば別の指紋', () => {
    const fp = shareKeysFingerprint(base);
    expect(shareKeysFingerprint({ ...base })).toBe(fp);
    for (const ch of [{ ingestKey: 'a2' }, { viewToken: 'b2' }, { appOrigin: 'https://y.example' }, { autoPublishConsent: false }]) {
      expect(shareKeysFingerprint({ ...base, ...ch })).not.toBe(fp);
    }
  });
  it('★指紋から鍵の値は読めない(値そのものを含まない)', () => {
    const fp = shareKeysFingerprint({ ...base, ingestKey: 'SECRET-KEY-VALUE', viewToken: 'SECRET-TOKEN-VALUE' });
    expect(fp).not.toContain('SECRET');
  });
});
