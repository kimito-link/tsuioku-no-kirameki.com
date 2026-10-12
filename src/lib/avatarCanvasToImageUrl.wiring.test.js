import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 合成の最後の書き出しが canvasToImageUrl を通る配線の固定(2026-10-11)。直書きの toDataURL に戻ると主スレッドが再び止まる。 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(root, 'lib/avatarPartsComposer.js'), 'utf8').replace(/\r\n/g, '\n');
const i0 = src.indexOf('export function composeAvatarPartsDataUrl(');
const body = src.slice(i0, i0 + 3500);

describe('avatarPartsComposer: 書き出しは canvasToImageUrl を通る', () => {
  it('★合成本体は await canvasToImageUrl(canvas) で URL を得て、toDataURL を直接呼ばない', () => {
    expect(i0).toBeGreaterThan(0);
    expect(body).toMatch(/const dataUrl = await canvasToImageUrl\(canvas\);/);
    expect(body).not.toMatch(/canvas\.toDataURL\(/);
  });
  it('toDataURL はフォールバックとして canvasToImageUrl の中にだけ残る', () => {
    const calls = src.match(/canvas\.toDataURL\(/g) || [];
    expect(calls).toHaveLength(1);
    const fn = src.slice(src.indexOf('export async function canvasToImageUrl('));
    expect(fn.slice(0, 700)).toMatch(/canvas\.toDataURL\('image\/png'\)/);
  });
});
