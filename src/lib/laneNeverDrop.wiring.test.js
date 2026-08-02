import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 「一度出た人は消えない」(v0.1.1232 lane-never-drop)の**配線忘れ=CI赤**ガード。
 *
 * 【なぜ必要か】
 * laneNeverDrop.integration.test.js は lib 層(laneRosterKeeper / storyUserLaneBuckets /
 * laneRosterDelta)のロジックだけを守る。純関数がいくら正しくても、popup-entry.js 側で
 *   - 上限を 48 に戻す
 *   - keeper の呼び出しを消す / sort の後ろに動かす
 * をされると、①レーンはサイレントに従来の「出たり消えたり」へ戻る。
 * 実際 reality-checker の変異テストで「limit を 48 に戻しても統合テストは全緑のまま」と
 * 確認された(=統合テストだけでは本体の退行を止められない)。その穴をここで塞ぐ。
 *
 * ★実行時 DOM 不要・純 Node(fs 読み)。popup-entry.js は vitest から import できないため、
 *   ソース文字列スキャンで配線の実在を断言する(venueLaneParity.wiring.test.js と同型)。
 *
 * 正本: lane-never-drop-SPEC.md / 地図: lane-never-drop-MAP.md
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const popupSrc = read('src/extension/popup-entry.js');
const keeperSrc = read('src/lib/laneRosterKeeper.js');

describe('lane-never-drop の配線(配線忘れ=CI赤)', () => {
  it('popup が名簿キーパーを import して状態を持っている', () => {
    expect(popupSrc).toMatch(/import\s*\{[^}]*applyLaneRosterKeeper[^}]*\}\s*from\s*'\.\.\/lib\/laneRosterKeeper\.js'/);
    expect(popupSrc).toMatch(/_laneRosterKeeperState\s*=\s*makeLaneRosterKeeperState\(\)/);
  });

  it('★表示上限が撤廃されている(48へ戻したらCI赤)', () => {
    // 上限の実体は STORY_USER_LANE_LIMIT_UNLIMITED = Infinity でなければならない。
    expect(popupSrc).toMatch(/const\s+STORY_USER_LANE_LIMIT_UNLIMITED\s*=\s*Number\.POSITIVE_INFINITY/);
    expect(popupSrc).toMatch(/const\s+limit\s*=\s*STORY_USER_LANE_LIMIT_UNLIMITED\s*;/);
    // 旧実装(INLINE_MODE ? 48 : 24)へ戻す退行を明示的に禁止する。
    expect(popupSrc).not.toMatch(/const\s+limit\s*=\s*INLINE_MODE\s*\?/);
  });

  it('★keeper が bucket へ渡る候補に効いている(呼び出し削除でCI赤)', () => {
    expect(popupSrc).toMatch(/applyLaneRosterKeeper\(\s*_laneRosterKeeperState/);
    expect(popupSrc).toMatch(/merged:\s*rosteredCandidates/);
    expect(popupSrc).toMatch(/bucketStoryUserLanePicks\(\s*rosteredCandidates\s*,\s*limit\s*\)/);
  });

  it('★keeper は sort より前に呼ばれている(順序が逆転したらCI赤)', () => {
    const keeperAt = popupSrc.indexOf('applyLaneRosterKeeper(');
    const sortAt = popupSrc.indexOf('rosteredCandidates.sort(compareStoryUserLaneCandidates)');
    expect(keeperAt).toBeGreaterThan(-1);
    expect(sortAt).toBeGreaterThan(-1);
    // sort 後に足すと復活行が段の末尾に固まり、表示順契約(popup=venue)を壊す(SPEC §7-1)。
    expect(keeperAt).toBeLessThan(sortAt);
  });

  it('人数の帳簿が rosteredCandidates で1本化されている(復活者を数え落とさない)', () => {
    // 旧 candidates.length のままだと「素性N」と「表示M」が割れ、健全度パネルが偽 na を出す。
    expect(popupSrc).toMatch(/candidateTotal:\s*rosteredCandidates\.length/);
    expect(popupSrc).toMatch(/identified:\s*rosteredCandidates\.length/);
    expect(popupSrc).toMatch(/totalCandidates:\s*rosteredCandidates\.length/);
  });

  it('鏡(会場)には有限 cap を渡している(Infinityは512KBフェイルセーフを無力化する既知地雷)', () => {
    expect(popupSrc).toMatch(/cap:\s*STORY_USER_LANE_INLINE_LIMIT/);
    expect(popupSrc).not.toMatch(/cap:\s*STORY_USER_LANE_LIMIT_UNLIMITED/);
  });

  it('laneDiag の limit は Infinity を素通しせず 0(無制限)へ落としている', () => {
    // Infinity をそのまま JSON 化すると null になり、健全度パネルの数字が壊れる。
    expect(popupSrc).toMatch(/limit:\s*Number\.isFinite\(limit\)\s*\?\s*limit\s*:\s*0/);
  });

  it('名簿は配信IDが変わったらリセットされる(前配信を持ち込まない)', () => {
    expect(keeperSrc).toMatch(/lid\s*!==\s*state\.lid/);
    expect(keeperSrc).toMatch(/state\.rows\s*=\s*new Map\(\)/);
  });

  it('名簿は DOM を走査しない(paint毎のDOM全走査は既知の性能地雷)', () => {
    // ★コメント行を除いた「実コード」だけを見る(この模組の説明文には
    //   childElementCount 等が地雷の解説として登場するため、素の grep だと誤検知する)。
    const code = keeperSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/document\./);
    expect(code).not.toMatch(/querySelector/);
    expect(code).not.toMatch(/childElementCount/);
    expect(code).not.toMatch(/\.innerHTML/);
  });
});
