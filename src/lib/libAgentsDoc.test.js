import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★`src/lib/AGENTS.md` が【実態とズレたら赤くなる】ようにする。
 *
 * ■ ★ユーザーの要求(2026-08-21)
 *   「AIが見ても人間が見ても分かるコード構成がほしい。
 *     他のプログラムをAIに(こう)したいと伝えても、すぐに理解できる気がします」
 *
 * ■ ★なぜ「1枚置くだけ」で終わらせないか
 *   このリポで**文書だけの仕掛けは全部死んでいる**:
 *     ・オプトインの台帳(diagChannelRegistry)は3ヶ月で登録1件のまま
 *     ・「追わない」と文書に書いた件に、その後84版が積まれた
 *   ★生き残ったのは**サボると赤くなる**ものだけ。
 *   → AGENTS.md に書いた数字・例外一覧が実測とズレたら、このテストが落ちる。
 *
 * ■ ★AGENTS.md を選んだ理由(2026-08-21 に実在調査)
 *   AGENTS.md は Linux Foundation 傘下 Agentic AI Foundation が管理する
 *   **2026年の事実上の標準**(60,000+リポ・20+ツールが対応)。
 *   ★**入れ子仕様**があり、エージェントはツリー上で**最も近いもの**を読む。
 *   ＝ `src/lib` を触るAIは、ルートより先にこの1枚を読む。
 */
describe('★src/lib/AGENTS.md が実態と一致している', () => {
  const md = () => read('src/lib/AGENTS.md');

  /** check-layer.mjs の実測を取り直す(テスト内で二重実装しない)。 */
  const measure = () => {
    const out = execFileSync('node', ['scripts/check-layer.mjs'], {
      cwd: repoRoot, encoding: 'utf8'
    });
    const impure = out
      .split('\n')
      .filter((l) => /^\s+\S+\.js\s/.test(l))
      .map((l) => l.trim().split(/\s+/)[0]);
    const m = out.match(/純粋 (\d+) \/ 非純粋 (\d+)/);
    return { impure, pure: m ? Number(m[1]) : -1, impureCount: m ? Number(m[2]) : -1 };
  };

  it('★存在する(入れ子AGENTS.mdでAIが最初に読む1枚)', () => {
    expect(md()).toContain('src/lib');
    expect(md(), 'フロントマターが無い').toMatch(/^---\n[\s\S]*?\n---/);
  });

  it('★★例外ファイルが【1件残らず】名前で書かれている', () => {
    /*
     * ★「41件あります」と数だけ書いても、どれが例外か分からなければ意味が無い。
     *   ★新しく例外を足したのに文書へ書かなければ、このテストが落ちる。
     */
    const { impure } = measure();
    expect(impure.length, '実測が取れていない').toBeGreaterThan(0);
    const doc = md();
    const missing = impure.filter((f) => !doc.includes(f.replace(/\.js$/, '')));
    expect(missing, `AGENTS.md に書かれていない例外: ${missing.join(', ')}`).toEqual([]);
  });

  it('★★書かれた件数が実測と一致する(数字が古くならない)', () => {
    const { impureCount } = measure();
    const doc = md();
    expect(doc, `impure_exceptions が実測(${impureCount})と違う`)
      .toContain(`impure_exceptions: ${impureCount}`);
    expect(doc, `本文の件数が実測(${impureCount})と違う`).toContain(`**${impureCount}**`);
  });

  it('★禁止するAPIを具体名で挙げている(曖昧にしない)', () => {
    const doc = md();
    for (const api of ['chrome.', 'fetch', 'localStorage', 'indexedDB', 'document', 'window']) {
      expect(doc, `禁止APIに ${api} が挙がっていない`).toContain(api);
    }
  });

  it('★★検査コマンドへの導線がある(読んだ人が確かめられる)', () => {
    expect(md()).toContain('npm run check:layer');
  });

  it('★★検査が verify:cc に配線されている(出荷前に必ず走る)', () => {
    /*
     * ★judgement が配線されていない片肺を作らない
     *   ([[unwired-judgement-is-systemic-2026-08-12]])。
     */
    expect(read('package.json'), 'npm script が無い').toContain('"check:layer"');
    expect(read('scripts/run-verify-cc.mjs'), 'verify:cc に入っていない')
      .toContain('check:layer');
  });

  it('★迷ったときの導線が実在するファイルを指している', () => {
    /*
     * ★リンク切れの地図は、無い地図より悪い(読んだ人が迷子になる)。
     */
    const doc = md();
    for (const rel of [
      'docs/code-tree.md',
      'docs/feature-map/impact-map.md',
      'docs/feature-map/storage-bus.md',
      'docs/feature-map/dom-attr-bus.md'
    ]) {
      const base = rel.split('/').pop();
      expect(doc, `${rel} への導線が無い`).toContain(base);
      expect(fs.existsSync(path.join(repoRoot, rel)), `${rel} が実在しない`).toBe(true);
    }
  });

  it('★書式の見本が実在ファイルを指している', () => {
    const doc = md();
    expect(doc).toContain('instrumentSpec.js');
    expect(fs.existsSync(path.join(repoRoot, 'src/lib/instrumentSpec.js'))).toBe(true);
  });
});
