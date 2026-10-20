import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** ★v0.1.1715: 100%超(記録>公式)の表示。status の描画が over を使って「超」を付ける。 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const status = readFileSync(path.join(repoRoot, 'src/extension/status-entry.js'), 'utf8').replace(/\r\n/g, '\n');

describe('★取得率の100%超表示', () => {
  it('status の健全度セルは over のとき「%超」と出す', () => {
    expect(status).toContain("`${c.value}%${c.over ? '超' : ''}`");
  });
});
