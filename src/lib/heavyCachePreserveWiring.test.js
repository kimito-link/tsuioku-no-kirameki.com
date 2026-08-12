import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = readFileSync(join(ROOT, 'src', 'extension', 'popup-entry.js'), 'utf8');

/**
 * 配線検査(v0.1.1367)。
 *
 * ★なぜ必要か: この修正は「軽い read が heavy の証跡を消さない」ことが本体で、
 *   純関数のテストが緑でも【呼ばれていなければ意味が無い】。実際 v1363 は
 *   純関数側が正しいのに呼び出し側の条件で構造的に発動できず 0回だった
 *   ([[unwired-judgement-is-systemic-2026-08-12]] の型・1日で4件起きている)。
 *
 * ★検査は整形に依存させない(handoff §4 地雷6・2回踏んでいる)。
 *   条件式と呼び出しの実体だけを固定し、改行位置やブロックの書き方は pin しない。
 */
describe('heavyCachePreserve の配線', () => {
  it('popup-entry が decideLightWriteKeepsHeavyTrace を import している', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*decideLightWriteKeepsHeavyTrace[^}]*\}\s*from\s*['"]\.\.\/lib\/heavyCachePreserve\.js['"]/);
  });

  it('★軽い read 成功時の書き込みが純関数の結果を使う(生オブジェクト直書きの復活を禁じる)', () => {
    // 旧実装 `watchMetaCache.lastCommentsArr = { lv, arr, chunkTotal: null };` が戻ったら赤にする。
    expect(SRC).not.toMatch(/lastCommentsArr\s*=\s*\{\s*lv\s*,\s*arr\s*,\s*chunkTotal:\s*null\s*\}/);
    expect(SRC).toMatch(/decideLightWriteKeepsHeavyTrace\(\s*\{/);
  });

  it('★書き込みが readAtMs を必ず含む(証跡を落とすと v1363 が死ぬ)', () => {
    const idx = SRC.indexOf('decideLightWriteKeepsHeavyTrace({');
    expect(idx).toBeGreaterThan(0);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/lastCommentsArr\s*=\s*\{[^}]*readAtMs:\s*keep\.readAtMs/);
    expect(block).toMatch(/chunkTotal:\s*keep\.chunkTotal/);
  });

  it('heavy 側の書き込み(readAtMs: Date.now())は従来どおり残っている', () => {
    // 既存の正常経路を壊していないことの確認。
    expect(SRC).toMatch(/readAtMs:\s*Date\.now\(\)/);
  });
});
