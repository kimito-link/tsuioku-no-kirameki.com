import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/*
 * ★配線テスト(2026-08-11・v0.1.1324):
 *   純関数 buildWatchSnapshotKey を作っても、popup-entry.js が呼ばなければ
 *   会場の鏡は直らない(=「テストは緑だが症状は変わらない」典型)。
 *   ここでは【呼び出し側が実際に差し替わっていること】をソース上で固定する。
 *
 *   ★変異で赤になることを確認済み: 呼び出しを旧 `${lv}|${url}|s17` に戻すと
 *     「旧形式が残っていない」の断言が落ちる。
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const POPUP_ENTRY = join(HERE, '..', 'extension', 'popup-entry.js');

describe('watchSnapshotKey の配線(popup-entry)', () => {
  const src = readFileSync(POPUP_ENTRY, 'utf8');

  it('buildWatchSnapshotKey を import している', () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\bbuildWatchSnapshotKey\b[^}]*\}\s*from\s*'\.\.\/lib\/watchSnapshotKey\.js'/
    );
  });

  it('heavyResultStillTargetsThisWatch を import している(v0.1.1325)', () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\bheavyResultStillTargetsThisWatch\b[^}]*\}\s*from\s*'\.\.\/lib\/watchSnapshotKey\.js'/
    );
  });

  it('snapshotKey を buildWatchSnapshotKey で作っている', () => {
    expect(src).toMatch(
      /const\s+snapshotKey\s*=\s*buildWatchSnapshotKey\(\s*\{\s*liveId:\s*lv\s*,\s*url\s*\}\s*\)/
    );
  });

  it('★旧形式のテンプレート鍵が残っていない(url を生で鍵に入れない)', () => {
    // 旧: const snapshotKey = `${lv}|${url}|s17`;
    expect(src).not.toMatch(/snapshotKey\s*=\s*`\$\{lv\}\|\$\{url\}\|/);
  });

  it('snapshotKey の生成は1箇所だけ(鍵の作り方が二重化していない)', () => {
    const assignments = src.match(/const\s+snapshotKey\s*=/g) || [];
    expect(assignments.length).toBe(1);
  });

  /*
   * ★v0.1.1325 で判定を純関数へ移した。
   *   旧: `if (watchMetaCache.key !== snapshotKey) bailHeavy(...)`
   *       → key='' (polling/visibility が再取得を促すため意図的に消す)でも bail し、
   *         読めた全件を毎回捨てていた(heavyEverSettled:false の残り半分の真因)。
   *   新: heavyResultStillTargetsThisWatch({cacheKey, snapshotKey}) が false のときだけ bail。
   *   ★関所自体は残す(本物の配信切替は捨てる必要がある)。
   */
  it('STALE_SNAPSHOT の判定に純関数を使っている(関所は残す)', () => {
    expect(src).toMatch(
      /if\s*\(\s*!heavyResultStillTargetsThisWatch\(\s*\{\s*cacheKey:\s*watchMetaCache\.key\s*,\s*snapshotKey\s*\}\s*\)\s*\)\s*return\s+bailHeavy\(\s*STORY_USER_LANE_HEAVY_SETTLE\.STALE_SNAPSHOT/
    );
  });

  it('★生の !== 比較に戻っていない(key="" で全件を捨てる退行の再発防止)', () => {
    expect(src).not.toMatch(
      /watchMetaCache\.key\s*!==\s*snapshotKey\)\s*return\s+bailHeavy/
    );
  });
});
