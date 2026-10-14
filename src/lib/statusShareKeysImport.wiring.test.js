import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/** 2026-10-14: 鍵ファイル読み込みの配線。検査(parseShareKeysFile)を通らないものを保存してはいけない。 */
const src = fs.readFileSync(path.resolve('src/extension/status-entry.js'), 'utf8').split('\r\n').join('\n');
const at = src.indexOf("fileInput.addEventListener('change'");
const body = src.slice(at, at + 1100);

describe('status-entry: 鍵ファイルの読み込み', () => {
  it('★ボタンが隠しファイル入力を開き、選んだファイルを parseShareKeysFile に通す', () => {
    expect(src).toMatch(/fileBtn\.addEventListener\('click', \(\) => fileInput\.click\(\)\);/);
    expect(at).toBeGreaterThan(0);
    expect(body).toMatch(/parseShareKeysFile\(await f\.text\(\)\)/);
  });
  it('★検査に落ちたら保存せずに戻る(setUploadConfig より前に return)', () => {
    const bad = body.indexOf('if (!parsed.ok)');
    const save = body.indexOf('await setUploadConfig(');
    expect(bad).toBeGreaterThan(0);
    expect(save).toBeGreaterThan(bad);
    expect(body.slice(bad, save)).toMatch(/return;/);
  });
  it('★保存したら下書きを捨てる・画面に鍵の値を出さない', () => {
    expect(body).toMatch(/_uploadConfigDraft\.ingestKey = null;/);
    expect(body).not.toMatch(/result\.textContent = [^;]*parsed\.(ingestKey|viewToken)/);
  });
});
