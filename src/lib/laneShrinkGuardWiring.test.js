import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 応援レーンの「縮小ガードが素通りしてタイルが消える」退行ガード(v0.1.1233)。
 *
 * 【実配信で観測された症状】
 *   ユーザー報告「はじめ見たときよりレーン表示のサムネが減っている」
 *   状態速報 v0.1.1232:
 *     shrinkDetectedCount=1 / provisionalFalseCount=1 / heavySettleState=settled
 *     → 計器自身が「⚠ 縮小しているのにガードが素通り(provisional=false)=
 *        タイルが消える直接原因。フラグ設定側を疑う」と報告した。
 *
 * 【真因】
 *   shouldKeepStoryUserLaneTilesOnShrink は 1行目で
 *     if (entriesProvisional !== true) return false;  // settled な正当減少は必ず描く
 *   としており、「確定」を名乗る供給の縮小は無条件で描く。
 *   ところが syncStorySourceEntries は opts 無指定を false(=確定)にするため
 *   (「無指定は false=既存呼び出しは挙動不変」)、opts を渡し忘れた経路は
 *   **不完全な供給でも「確定」を名乗ってしまう**。
 *
 *   populateStorySourceEntriesFromStorageFallback は nls_comments から読み直す
 *   fallback 経路で、取り込み途中(実測20%)でも走る=本質的に暫定。
 *   ここが opts を渡していなかったため、取り込み中の短い供給が確定として通り、
 *   タイルが減った。
 *
 * ★v0.1.1232(lane-never-drop)で picked は同一配信内で単調増加するようになったため、
 *   「確定した供給で人数が減る」ことは原理的に起こらない。減ったなら供給が不完全。
 *
 * 正本: lane-never-drop-SPEC.md / 症状の速報は 2026-08-02 lv351091198
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const popupSrc = read('src/extension/popup-entry.js');

/** syncStorySourceEntries の呼び出し行(定義行は除く)を全部拾う。 */
function syncCallLines() {
  return popupSrc
    .split('\n')
    .map((line, i) => ({ line: line.trim(), no: i + 1 }))
    .filter(
      (x) =>
        x.line.includes('syncStorySourceEntries(') &&
        !x.line.startsWith('*') &&
        !x.line.startsWith('//') &&
        !x.line.includes('function syncStorySourceEntries')
    );
}

describe('応援レーンの縮小ガード配線(タイルが消える退行=CI赤)', () => {
  it('storage fallback 経路は provisional=true を申告する(取り込み途中の短い供給で確定を名乗らない)', () => {
    // ★この経路は nls_comments から読み直す fallback。取り込み中でも走るため本質的に暫定。
    //   opts 無指定だと provisional=false(確定)になり、縮小ガードが素通りしてタイルが消える。
    const fallbackFn = popupSrc.slice(
      popupSrc.indexOf('async function populateStorySourceEntriesFromStorageFallback'),
      popupSrc.indexOf('async function populateStorySourceEntriesFromStorageFallback') + 4000
    );
    expect(fallbackFn).toMatch(/syncStorySourceEntries\([^)]*\{[^}]*provisional:\s*true/s);
  });

  it('供給を渡す syncStorySourceEntries の呼び出しは provisional を明示している(渡し忘れ=CI赤)', () => {
    // 空リセット(syncStorySourceEntries('', []))は供給ではないので対象外。
    const supplyCalls = syncCallLines().filter((x) => !/syncStorySourceEntries\(\s*''\s*,\s*\[\]\s*\)/.test(x.line));
    expect(supplyCalls.length).toBeGreaterThan(0);
    for (const call of supplyCalls) {
      // 複数行にまたがる呼び出しもあるため、その行から500文字を見る。
      const from = popupSrc.indexOf(call.line);
      const chunk = popupSrc.slice(from, from + 500);
      expect(
        /provisional\s*:/.test(chunk),
        `popup-entry.js:${call.no} が provisional を明示していません(無指定=確定扱いになり縮小ガードが素通りします): ${call.line}`
      ).toBe(true);
    }
  });

  it('縮小ガードの契約(確定なら描く/暫定なら1枚でも減ったら守る)が保たれている', () => {
    const domSrc = read('src/extension/story/renderStoryUserLaneDom.js');
    // 出口1: settled は必ず描く(固着回避の生命線・commit 27cf7b30)。
    expect(domSrc).toMatch(/if\s*\(entriesProvisional\s*!==\s*true\)\s*return false;/);
    // ★v0.1.1233 契約変更: 旧 0.6 比率 → 1枚でも減ったら守る。
    expect(domSrc).toMatch(/return\s+next\s*<\s*prev;/);
    // 旧比率は削除済み(残っていると「0.6がまだ生きている」と誤読される)。
    expect(domSrc).not.toMatch(/STORY_USER_LANE_SHRINK_KEEP_RATIO/);
  });

  it("★lid空('')を配信切替扱いしない(穴3: リセット窓でタイル/名簿を守る)", () => {
    const domSrc = read('src/extension/story/renderStoryUserLaneDom.js');
    const keeperSrc = read('src/lib/laneRosterKeeper.js');
    // DOM 側: 「一度も描いていない」と「本物の切替」を分けて判定する。
    expect(domSrc).toMatch(/if\s*\(!last\)\s*return false;/);
    expect(domSrc).toMatch(/if\s*\(cur\s*&&\s*cur\s*!==\s*last\)\s*return false;/);
    // 旧実装(!cur で畳む)へ戻したら CI 赤。
    expect(domSrc).not.toMatch(/if\s*\(!cur\s*\|\|\s*cur\s*!==\s*last\)/);
    // 名簿側: 空 lid ではリセットしない。
    expect(keeperSrc).toMatch(/if\s*\(lid\s*&&\s*lid\s*!==\s*state\.lid\)/);
  });

  it('★keep の非常口(時間上限)が配線されている(永久staleを防ぐ出口4)', () => {
    const domSrc = read('src/extension/story/renderStoryUserLaneDom.js');
    expect(domSrc).toMatch(/export const STORY_USER_LANE_SHRINK_KEEP_MAX_MS/);
    expect(domSrc).toMatch(/export function laneShrinkKeepExpired/);
    // popup 側で guardHit を決める前に非常口を通していること。
    expect(popupSrc).toMatch(/laneShrinkKeepExpired\(/);
    expect(popupSrc).toMatch(/_shrinkGuardHit\s*=\s*_rawKeep\s*&&\s*!_keepExpired/);
  });
});
