import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// 除外: このテスト自身・changelog.js(過去の変更履歴=歴史記録なので書き換えない)・
//   venueLaneParity.wiring.test.js(「ロビーが撤去されたこと」を断言するテストのため
//   否定形の正規表現内に一時的に単語が残る。撤去確認テストなので除外して問題ない)。
const EXCLUDE = new Set([
  'src/lib/noLobbyString.test.js',
  'src/lib/changelog.js',
  // ★2026-08-19: changelog-archive.js も **同じ歴史記録**(changelog.js から押し出した旧版)。
  //   除外理由は changelog.js と全く同じ = 過去の記述は書き換えない。
  //   ★popup のバンドルには入らないので、実行コードにロビーが復活する経路にはならない。
  'src/lib/changelog-archive.js',
  'src/lib/venueLaneParity.wiring.test.js'
]);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(repoRoot, full).replace(/\\/g, '/');
    if (statSync(full).isDirectory()) { walk(full, out); continue; }
    if (!name.endsWith('.js') || EXCLUDE.has(rel)) continue;
    out.push(full);
  }
  return out;
}

describe('「ロビー」文字列が実行コードに残っていないことの機械保証', () => {
  it('src/ 配下に lobby / ロビー が0件', () => {
    const files = walk(path.join(repoRoot, 'src'), []);
    const hits = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      if (/lobby|ロビー/i.test(content)) hits.push(path.relative(repoRoot, f));
    }
    expect(hits).toEqual([]);
  });
});
