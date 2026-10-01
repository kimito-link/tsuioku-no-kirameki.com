import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 2026-10-01: /live/ の Kick セクション(ほかの配信サービス)の配線を entry のソースで固定する。
 * ★ニコ生の流れ(load/render/追跡器)と混ざらないことが要点(設計 SPEC §2.2-2・§4.6)。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'extension', 'live-ranking-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

/** function loadPlatforms() { ... } の本体だけを取り出す(波括弧の対応で切る)。 */
function bodyOf(name) {
  const at = source.indexOf(`function ${name}(`);
  if (at < 0) return '';
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') { depth -= 1; if (depth === 0) return source.slice(open, i + 1); }
  }
  return '';
}

describe('live platforms wiring', () => {
  it('loadPlatforms は load とは別関数として 1 回だけ定義される', () => {
    expect(source.match(/function loadPlatforms\(/g) || []).toHaveLength(1);
    expect(bodyOf('load')).not.toContain('loadPlatforms');
    expect(bodyOf('load')).not.toContain('/api/live-platforms');
  });

  it('loadPlatforms は /api/live-platforms を叩き、?refresh=1 を付けない', () => {
    const body = bodyOf('loadPlatforms');
    expect(body).toContain("'/api/live-platforms'");
    expect(body).not.toContain('refresh');
  });

  it('elPlatforms に対して bindImgFallback を呼ぶ', () => {
    expect(bodyOf('loadPlatforms')).toContain('bindImgFallback(elPlatforms)');
  });

  it('ニコ生の並べ替え・ピン・追跡器に platforms 由来の値を渡していない', () => {
    const body = bodyOf('loadPlatforms');
    expect(body).not.toMatch(/sortByEstimatedConcurrent|pinLiveFirst|\.begin\(|\.pulseFor\(|\.trackFor\(/);
    expect(bodyOf('render')).not.toMatch(/platforms|elPlatforms/);
  });

  it('初回ロード・自動更新・visibilitychange の 3 経路で loadPlatforms が呼ばれる', () => {
    const calls = source.match(/loadPlatforms\(\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(source).toMatch(/setInterval\([^\n]*loadPlatforms\(\)/);
    expect(source).toMatch(/visibilitychange[^\n]*loadPlatforms\(\)/);
  });
});
