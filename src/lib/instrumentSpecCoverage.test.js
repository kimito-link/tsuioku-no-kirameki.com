import { describe, it, expect } from 'vitest';
import { INSTRUMENT_SPEC } from './instrumentSpec.js';
import { DIAGNOSIS_REGISTRY } from './diagnosisRegistry.js';

/**
 * ★台帳が【死なない】ための唯一の仕掛け ＝ **未記入の数を固定する**。
 *
 * ■ なぜテストなのか(会議 Q4 への回答)
 *   会議は「PRテンプレにチェックボックスを足す」を提案したが、
 *   ★**人の善意に依存する仕掛けはこのリポで死んでいる**:
 *     `diagChannelRegistry` … オプトイン制。3ヶ月「登録1件のまま」
 *   逆に**実際に機能した仕掛けは全部「赤くなるテスト」**だった:
 *     `KNOWN_NA_DEBT <= 14`      … 機能した
 *     `changelogBundleBudget`    … 入れた初日に鳴って分割を促した
 *
 *   ★**「サボると赤くなるか」だけが、仕掛けの生死を決める**
 *   ([[changelog-1mb-was-the-black-and-gates-decide-survival-2026-08-19]])。
 *
 * ■ 運用(ユーザー決定「正確さがほしい。それを中心に」)
 *   - **新しく計器を足すなら、この台帳にも足す**。足さなければ赤。
 *   - 既存104件は一度に埋めない。**未記入の数を下の定数で固定**し、
 *     ★**増やしたら赤**にする。減らすのは自由。
 *   - ★**デフォルト値を用意しない**(未記入が黙って通ると台帳は死ぬ)。
 */

/**
 * ★まだ宣言していない registry セルの数の【上限】。
 *
 * 着手範囲(ユーザー決定)は「誤診した4件＋DOM関連」なので、残りは意図的に未宣言。
 * **この数を増やす変更は赤**にする。
 *
 * ★実測値: registry 104件 − 宣言済み7件 = **97**(2026-08-20)。
 *   ★推測で 96 と書いて赤にした＝**数は必ず実測から書く**。
 * ★減らしたらこの定数も下げること(ラチェット)。
 */
const MAX_UNDECLARED = 97;

describe('★計器台帳のカバレッジ(未記入の数を固定する)', () => {
  const declaredIds = new Set(INSTRUMENT_SPEC.map((r) => r.id));
  const registryIds = DIAGNOSIS_REGISTRY.map((r) => r.id);

  it('★未宣言セルの数が上限を超えていない(増やしたら赤)', () => {
    const undeclared = registryIds.filter((id) => !declaredIds.has(id));
    expect(
      undeclared.length,
      `未宣言が ${undeclared.length} 件に増えています(上限 ${MAX_UNDECLARED})。`
        + ' 新しい計器を足したなら instrumentSpec.js にも1行足してください。'
    ).toBeLessThanOrEqual(MAX_UNDECLARED);
  });

  it('★着手範囲(誤診4件＋DOM関連)は【全部】宣言済み', () => {
    // ★ここは上限ではなく「全部あること」を断言する＝借金として残さない。
    for (const id of [
      'dom-nodes', 'memory-pressure', 'host-duplicate', 'host-move',
      'lane-tick', 'lane-paint', 'instant-reject'
    ]) {
      expect(declaredIds.has(id), `${id} が台帳に無い`).toBe(true);
    }
  });

  it('★台帳の id は registry に在るか、registry 外だと分かる形で在る', () => {
    /*
     * ★台帳には registry セルでないもの(instant-push-sent 等)も載る。
     *   それ自体は正しい(誤診の当事者だから)。
     *   ただし**綴り間違いで registry と繋がらない**のは事故なので、
     *   registry 外のものは「既知の registry 外」に列挙して固定する。
     */
    const KNOWN_NON_REGISTRY = new Set([
      'instant-push-sent',   // content 側の送信回数(セルではない)
      'instant-push-received', // popup 側の受信延べ数(セルではない)
      'lane-repaint',        // 段の貼り替え回数(速報の文章に出る)
      'lane-hollow',         // hollow 枚数(速報の文章に出る)
      'venue-lane-pop'       // 会場一致の鏡件数(速報の文章に出る)
    ]);
    const inRegistry = new Set(registryIds);
    const orphans = INSTRUMENT_SPEC
      .map((r) => r.id)
      .filter((id) => !inRegistry.has(id) && !KNOWN_NON_REGISTRY.has(id));
    expect(orphans, `registry にも既知リストにも無い id(綴り間違いの疑い): ${orphans.join(', ')}`)
      .toEqual([]);
  });

  it('★registry が増えたら気づける(件数を固定=黙って増やせない)', () => {
    // ★セルを足したのに台帳を無視する変更を止める。
    expect(
      registryIds.length,
      'registry のセル数が変わりました。instrumentSpec.js に宣言を足し、この数を更新してください。'
    ).toBe(104);
  });
});
