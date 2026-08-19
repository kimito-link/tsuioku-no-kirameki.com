import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * マインドマップの diff-skip 配線検査。
 *
 * ★守っているのは「JSON.stringify(model) に戻さないこと」。
 *   モデルには「◯秒前」が入るので、全体を文字列化すると
 *   署名が毎tick変わり innerHTML='' が一度もスキップされない。
 *   ＝v0.1.1409 が健全度セルで直したのと同じ型のバグに戻る。
 */

const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

describe('マインドマップの署名', () => {
  const entry = () => read('src/extension/status-entry.js');

  it('純関数 buildStatusMindmapSignature を使っている', () => {
    const s = entry();
    expect(s).toContain("import { buildStatusMindmapSignature }");
    expect(s).toMatch(/sig = buildStatusMindmapSignature\(model\);/);
  });

  it('★JSON.stringify(model) に戻していない(時刻混入の再発防止)', () => {
    const s = entry();
    const at = s.indexOf('function renderMindmap');
    expect(at).toBeGreaterThan(-1);
    const body = s.slice(at, at + 2600);
    expect(body).not.toMatch(/sig = JSON\.stringify\(model\)/);
  });

  it('★署名が一致したら再描画しない分岐が残っている', () => {
    const s = entry();
    const at = s.indexOf('function renderMindmap');
    const body = s.slice(at, at + 2600);
    expect(body).toMatch(/sig === _lastMindmapSig/);
    expect(body).toMatch(/return;/);
  });

  it('★純関数は時間の経過だけを外す(件数は外さない)', () => {
    const lib = read('src/lib/statusMindmapSignature.js');
    expect(lib).toContain('export function isElapsedValue');
    // 件数やパーセントを落とす実装になっていないこと
    expect(lib).not.toMatch(/件\|/);
  });
});
