import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 2026-07-16: 実配信で「デルタ補完3件・21,775,806,936,812,300pt」という異常な巨大値が
//   状態速報に表示された実測バグの回帰テスト。真因はNDGR protobufデコード(ndgrDecode.js の
//   pbVarint)がパース位置ずれ時に上限なしで巨大なゴミ値を返しうること。content-entry.js の
//   applyInterceptNdgrStatisticsFields は postMessage 経由でこの値を受け取るため、
//   ndgrDecode.js側のクランプとは独立に、ここでも同じ上限で再検証する(二重防御)。
//   content-entry.js は DOM 依存が強くユニットテストを直接組めないため、
//   ソース文字列スキャンで防御コードの実在を固定する。

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'content-entry.js'), 'utf8');

function extractFunctionBody(source, startMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`marker not found: ${startMarker}`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces for: ${startMarker}`);
}

describe('applyInterceptNdgrStatisticsFields は giftPoints/adPoints に上限サニティチェックを持つ', () => {
  const fn = extractFunctionBody(src, 'function applyInterceptNdgrStatisticsFields(payload)');

  it('STATISTICS_POINTS_SANITY_MAX(10億pt)の上限定数が定義されている', () => {
    expect(fn).toMatch(/STATISTICS_POINTS_SANITY_MAX\s*=\s*1_000_000_000/);
  });

  it('adPointsの採用ゲートが上限チェックを含む', () => {
    expect(fn).toMatch(/typeof ap === 'number' && Number\.isFinite\(ap\) && ap >= 0 && ap <= STATISTICS_POINTS_SANITY_MAX/);
  });

  it('giftPointsの採用ゲートが上限チェックを含む', () => {
    expect(fn).toMatch(/typeof gp === 'number' && Number\.isFinite\(gp\) && gp >= 0 && gp <= STATISTICS_POINTS_SANITY_MAX/);
  });
});
