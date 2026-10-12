import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場のキャラ(りんく/こん太/たぬ姉)は「浮かぶだけ」=しゃべらない、の配線の固定(2026-10-12 ユーザー要望)。
 * 部品(charaLiveController の talk スイッチ)があっても、venueBar が false を渡さなければ吹き出しが出続ける。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const venue = readFileSync(path.join(root, 'extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');
const i0 = venue.indexOf('const charaLive = startCharaLive({');
const call = venue.slice(i0, i0 + 1500);

describe('venueBar: キャラライブは talk:false で起動する', () => {
  it('★前提: startCharaLive の呼び出しが取れている', () => {
    expect(i0).toBeGreaterThan(0);
    expect(call).toContain('mount: stage');
  });
  it('★startCharaLive に talk: false を渡している(しゃべらない)', () => {
    expect(call).toMatch(/\n\s+talk: false\n\s+\}\);/);
  });
});
