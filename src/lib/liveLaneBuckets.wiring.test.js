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

describe('live lane buckets wiring', () => {
  it('createRowChangeTracker はトップレベルで2つの器だけ生成する', () => {
    const matches = [];
    const re = /createRowChangeTracker\(\)/g;
    let match;
    while ((match = re.exec(source))) matches.push(match.index);
    expect(matches).toHaveLength(2);
    expect(matches.every((at) => braceDepthAt(source, at) === 0)).toBe(true);
  });

  it('laneTracker の begin/end は render の対として各1回だけ呼ぶ', () => {
    expect(source.match(/laneTracker\.begin\(\)/g) || []).toHaveLength(1);
    expect(source.match(/laneTracker\.end\(\)/g) || []).toHaveLength(1);
  });

  it('laneTracker は初回宣言後に再代入しない', () => {
    const withoutDeclaration = source.replace(
      /const laneTracker\s*=\s*createRowChangeTracker\(\);/,
      ''
    );
    expect(withoutDeclaration.match(/\blaneTracker\s*=/g) || []).toHaveLength(0);
  });

  it('旧 renderKnown の呼び出し文字列を残さない', () => {
    expect(source.match(/renderKnown\(/g) || []).toHaveLength(0);
  });

  it('laneBuckets は1回描画の map 内で renderLanes より先に呼ぶ', () => {
    const mapStart = source.indexOf('elList.innerHTML = ordered.map(');
    const mapEnd = source.indexOf("}).join('');", mapStart);
    const bucketsAt = source.indexOf('laneBuckets(', mapStart);
    const lanesAt = source.indexOf('renderLanes(', mapStart);
    expect(mapStart).toBeGreaterThanOrEqual(0);
    expect(mapEnd).toBeGreaterThan(mapStart);
    expect(bucketsAt).toBeGreaterThan(mapStart);
    expect(bucketsAt).toBeLessThan(mapEnd);
    expect(bucketsAt).toBeLessThan(lanesAt);
  });
});
