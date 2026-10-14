import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/** 2026-10-14: 鍵ファイルの自動取り込みの配線。同意は明記されたときだけ・一度だけ・失敗しても起動を止めない。 */
const src = fs.readFileSync(path.resolve('src/extension/status-entry.js'), 'utf8').split('\r\n').join('\n');
const at = src.indexOf('async function seedShareKeysFromLocalFile() {');
const body = src.slice(at, at + 1700);

describe('status-entry: 鍵ファイルの自動取り込み', () => {
  it('★boot で共有キーを読んだあとに呼び、取り込んだら読み直す', () => {
    const boot = src.indexOf('await refreshUploadConfigCache();\n  // v0.1.1626');
    expect(boot).toBeGreaterThan(0);
    expect(src.slice(boot, boot + 400)).toMatch(/if \(await seedShareKeysFromLocalFile\(\)\) await refreshUploadConfigCache\(\);/);
  });
  it('★取り込み済みの印があれば何もしない(同意を切った後に戻さない)', () => {
    expect(at).toBeGreaterThan(0);
    expect(body).toMatch(/if \(done\?\.\[KEY_SHARE_KEYS_SEEDED\]\) return false;/);
    expect(body).toMatch(/\[KEY_SHARE_KEYS_SEEDED\]: Date\.now\(\)/);
  });
  it('★検査(parseShareKeysFile)に通らなければ保存しない', () => {
    const bad = body.indexOf('if (!parsed.ok) return false;');
    const save = body.indexOf('await setUploadConfig(');
    expect(bad).toBeGreaterThan(0);
    expect(save).toBeGreaterThan(bad);
  });
  it('★同意はファイルが true と明記したときだけ入れる', () => {
    expect(body).toMatch(/if \(parsed\.autoPublishConsent\) await setWebPublishOptIn\(true\);/);
  });
  it('★ファイル取得に時間制限があり、例外は握って起動を止めない', () => {
    expect(body).toMatch(/setTimeout\(\(\) => resolve\(null\), 1500\)/);
    expect(body).toMatch(/\} catch \{\n {4}return false;/);
  });
});
