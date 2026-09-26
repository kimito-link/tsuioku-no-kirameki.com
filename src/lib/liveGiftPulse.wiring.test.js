import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'extension', 'live-ranking-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function braceDepthAt(src, index) {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') depth -= 1;
  }
  return depth;
}

describe('live gift pulse wiring', () => {
  it('registry はトップレベルで1回だけ生成する', () => {
    const calls = source.match(/createGiftPulseRegistry\(\)/g) || [];
    expect(calls).toHaveLength(1);
    const at = source.indexOf('createGiftPulseRegistry()');
    expect(braceDepthAt(source, at)).toBe(0);
  });

  it('begin/end は render の対として各1回だけ呼ぶ', () => {
    expect(source.match(/giftPulse\.begin\(\)/g) || []).toHaveLength(1);
    expect(source.match(/giftPulse\.end\(\)/g) || []).toHaveLength(1);
  });

  it('giftPulse は初回宣言後に再代入しない', () => {
    const withoutDeclaration = source.replace(
      /const giftPulse\s*=\s*createGiftPulseRegistry\(\);/,
      ''
    );
    expect(withoutDeclaration.match(/\bgiftPulse\s*=/g) || []).toHaveLength(0);
  });

  it('ギフト renderRows は第4引数に pulse 結果を渡す', () => {
    expect(source).toMatch(/renderRows\(rows\.gift\s*,[^)]*,[^)]*,[^)]*\)/);
  });
});
