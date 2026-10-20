import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1702: popup の応援ランキングは【全件】で数え、同数は前回の順位を保つ。
 *
 * 経緯(2026-10-20 調査・docs/handoff の数字の設計):
 *   renderUserRooms は集計の前に capCommentsForAnalytics(総数/2500 の均等サンプル)で入力を間引き、そのままユーザー別件数にしていた。
 *   コメントが1件増えるたびにサンプル位置が全部ずれ→僅差の順位が毎回入れ替わる(合成データ 6,300件で、1件追加×40回の上位10の並び変化が
 *   サンプル 40/40回・全件 0回)。タイルの「60件」も実件数ではなくサンプル内の件数だった。さらに同数の並びを、時間で動く値
 *   (サムネ評価・直近5分の件数・最終発言時刻)で決めていた。
 *   → 全件で集計する(全件集計は 6,300件で約2ms・2万件で約8ms=実測)。並びは orderRankedRooms(件数降順・同数は前回順位を保つ)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/popup-entry.js'), 'utf8').replace(/\r\n/g, '\n');

function renderUserRoomsBody() {
  const start = src.indexOf('function renderUserRooms(');
  expect(start, 'renderUserRooms が見つからない(構造が変わったら本テストを見直すこと)').toBeGreaterThan(-1);
  const next = src.indexOf('\nfunction ', start + 20);
  const nextAsync = src.indexOf('\nasync function ', start + 20);
  const ends = [next, nextAsync].filter((n) => n > -1);
  return src.slice(start, Math.min(...ends));
}

describe('★popup の応援ランキング: 全件で数え、並びを安定させる', () => {
  const body = renderUserRoomsBody();

  it('集計の入力を間引かない(capCommentsForAnalytics を通さない)', () => {
    expect(body).not.toContain('capCommentsForAnalytics');
    expect(src).not.toMatch(/import \{ capCommentsForAnalytics \}/);
    expect(body).toMatch(/const list = Array\.isArray\(entries\) \? entries : \[\];/);
  });

  it('ユーザー別件数は list(全件)から数える', () => {
    expect(body).toContain('aggregateCommentsByUser(list, { requireText: true })');
  });

  it('並びは orderRankedRooms(同数は前回順位を保つ)で決める。時間で動く値(サムネ評価)で並べ替えない', () => {
    expect(body).toContain('orderRankedRooms(');
    expect(body).not.toContain('userLaneResolvedThumbScore(');
    expect(src).toMatch(/import \{ orderRankedRooms \} from '\.\.\/lib\/rankedRoomsOrder\.js';/);
  });

  it('前回の順位は配信ごとに持つ(配信が変わったら引き継がない)', () => {
    expect(src).toMatch(/let _rankOrderLiveId = '';/);
    expect(src).toMatch(/let _rankOrderKeys = \/\*\* @type \{string\[\]\} \*\/ \(\[\]\);/);
    expect(body).toMatch(/_rankOrderLiveId === lvPrimed \? _rankOrderKeys : \[\]/);
    expect(body).toContain('_rankOrderLiveId = lvPrimed;');
    expect(body).toContain('_rankOrderKeys = ');
  });

  it('室温(直近5分)も全件の list から数える(サンプルで縮めない)', () => {
    expect(body).toMatch(/for \(const e of list\) \{\s*const at = Number\(e\?\.capturedAt \|\| 0\);/);
  });
});
