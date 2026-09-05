import { describe, it, expect } from 'vitest';
import { shouldRevealCloakAfterFirstPaint } from './popupCloakRevealTiming.js';

/**
 * ★このテストが守っている実害(2026-08-10 実機 v0.1.1314 の計器が名指しした):
 *   パネルを開いた直後、幕(cloak)が t+1238ms まで残り約1.2秒「中身が見えない」。
 *   幕は opacity:0 で中身だけを隠す(背景は塗る)ので、暗い枠の中では【黒く見える】。
 */
describe('shouldRevealCloakAfterFirstPaint', () => {
  it('★キャッシュヒットなら即座に外す(今回の根治)', () => {
    const r = shouldRevealCloakAfterFirstPaint({
      snapshotCacheHit: true,
      freshRefresh: true
    });
    expect(r.revealNow).toBe(true);
    expect(r.reason).toBe('snapshot-cache-hit');
  });

  it('★古い refresh では触らない(既存規律=世代ガード)', () => {
    const r = shouldRevealCloakAfterFirstPaint({
      snapshotCacheHit: true,
      freshRefresh: false
    });
    expect(r.revealNow).toBe(false);
    expect(r.reason).toBe('stale-refresh');
  });

  it('キャッシュミスはこの経路で外さない(fetch 側の経路が担当)', () => {
    const r = shouldRevealCloakAfterFirstPaint({
      snapshotCacheHit: false,
      freshRefresh: true
    });
    expect(r.revealNow).toBe(false);
    expect(r.reason).toBe('cache-miss-uses-fetch-path');
  });

  it('★両方 false でも throw せず false を返す', () => {
    expect(
      shouldRevealCloakAfterFirstPaint({ snapshotCacheHit: false, freshRefresh: false }).revealNow
    ).toBe(false);
  });

  it('壊れた入力でも throw しない', () => {
    for (const bad of [null, undefined, 123, 'x', []]) {
      expect(() => shouldRevealCloakAfterFirstPaint(bad)).not.toThrow();
      expect(shouldRevealCloakAfterFirstPaint(bad).revealNow).toBe(false);
    }
  });
});

describe('★配線: popup-entry が判定を使っている', () => {
  it('import と無条件の呼び出しがある', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '../extension/popup-entry.js'), 'utf8');

    expect(src).toMatch(
      /import\s*\{\s*shouldRevealCloakAfterFirstPaint\s*\}\s*from\s*'\.\.\/lib\/popupCloakRevealTiming\.js'/
    );
    // ★キャッシュヒット経路で呼ばれていること(引数を落とすと判定が壊れる)。
    expect(src).toMatch(
      /shouldRevealCloakAfterFirstPaint\(\{\s*snapshotCacheHit,\s*freshRefresh: isFreshRefresh\(\)\s*\}\)\.revealNow/
    );
  });
});
