import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * story の成長アイコンの更新で、合成済みの顔(PNG)を SVG の仮の顔へ戻さない配線(v0.1.1683)。
 *   外れると、更新のたびに全マスで「SVG へ戻す→PNG へ差し替える」が再び走る(開いて12秒に約7,000回の代入・ちらつき)。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const src = strip(read('src/extension/popup-entry.js'));

describe('成長アイコンは出ている顔を上書きしない', () => {
  it('★popup-entry が isAnonymousFaceShown を composer から import している', () => {
    expect(src).toMatch(/import \{[^}]*isAnonymousFaceShown[^}]*\} from '\.\.\/lib\/avatarPartsComposer\.js';/);
  });

  it('★applyStoryGrowthIconAttributes: 顔が出ていなければ、従来どおり代入・失敗記録・アップグレードを行う', () => {
    const f = src.indexOf('function applyStoryGrowthIconAttributes');
    const body = src.slice(f, f + 1900);
    const guard = body.indexOf('if (!isAnonymousFaceShown(img, entry?.userId, displayTile)) {');
    expect(guard).toBeGreaterThan(-1);
    const block = body.slice(guard, guard + 420);
    expect(block).toContain('storyGrowthImgAssignSrc(img, displayTile);');
    expect(block).toContain('storyAvatarLoadGuard.noteRemoteAttempt(img, requestedTile);');
    expect(block).toContain('upgradeAnonymousAvatarImageFromFallback(img, entry?.userId, requestedTile, 64);');
  });

  it('★v0.1.1691: 匿名の仮顔(SVG)が要求されたとき、メモリの合成済みの顔を最初から使う(cachedAnonymousFace)', () => {
    const f = src.indexOf('function applyStoryGrowthIconAttributes');
    const body = src.slice(f, f + 1900);
    expect(body).toMatch(/const cachedFace = requestedTile\.startsWith\('data:image\/svg\+xml'\) \? cachedAnonymousFace\(entry\?\.userId\) : '';/);
    expect(body).toContain('const displayTile = cachedFace || storyAvatarLoadGuard.pickDisplaySrc(requestedTile);');
    expect(src).toMatch(/import \{[^}]*cachedAnonymousFace[^}]*\} from '\.\.\/lib\/avatarPartsComposer\.js';/);
  });

  it('★判定の関数は composer に1つ(popup 側に複製しない)', () => {
    expect(src).not.toMatch(/function isAnonymousFaceShown/);
    expect(strip(read('src/lib/avatarPartsComposer.js'))).toMatch(/export function isAnonymousFaceShown\(/);
  });
});
