import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1706: 件数カード3つのローディング重ねは、値が違うときだけ DOM に書く(同値書き直しの停止)。
 * 実機のちらつき計: #liveStatCard{Comments,Concurrent,Visitors}Load が同値のまま4分で約6,500回書き直されていた。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/popup-entry.js'), 'utf8').replace(/\r\n/g, '\n');

function bodyOf(name) {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `${name} が見つからない`).toBeGreaterThan(-1);
  const next = src.indexOf('\nfunction ', start + 20);
  const nextAsync = src.indexOf('\nasync function ', start + 20);
  const ends = [next, nextAsync].filter((n) => n > -1);
  return src.slice(start, Math.min(...ends));
}

describe('★件数カードのローディング重ね: 同値書き直しをしない', () => {
  const body = bodyOf('syncLiveStatThreeCardsCharLoadingOverlays');

  it('setOne は setOverlayShown(値が違うときだけ書く)を使う', () => {
    expect(src).toMatch(/import \{ setOverlayShown \} from '\.\.\/lib\/overlayShown\.js';/);
    expect(body).toContain('setOverlayShown(el, show)');
  });

  it('旧い無条件の代入(el.hidden = !on / aria-hidden の setAttribute)が残っていない', () => {
    expect(body).not.toMatch(/el\.hidden = !on;/);
    expect(body).not.toMatch(/el\.setAttribute\('aria-hidden'/);
  });
});
