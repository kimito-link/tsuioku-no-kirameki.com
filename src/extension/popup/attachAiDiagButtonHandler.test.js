/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { attachAiDiagButtonHandler } from './attachAiDiagButtonHandler.js';

/**
 * ★Phase 2 の2件目の抽出(popup-entry.js → src/extension/popup/)の回帰。
 *
 * 抽出前は popup-entry 内の私有関数で呼び出せず、テストがゼロだった。
 * 切り出したことで「要素が無いとき落ちない」「二重に listener を張らない」
 * といった不変条件を初めて機械的に固定できる。
 */
describe('attachAiDiagButtonHandler(抽出後も同じ挙動)', () => {
  it('★対象要素が無ければ何もしない(落ちない)', () => {
    expect(() => attachAiDiagButtonHandler({}, { getEl: () => null })).not.toThrow();
  });

  it('★要素があれば listener を張る(1回目)', () => {
    const el = document.createElement('div');
    let added = 0;
    const origin = el.addEventListener.bind(el);
    el.addEventListener = (...args) => {
      added += 1;
      return origin(...args);
    };
    attachAiDiagButtonHandler({ a: 1 }, { getEl: () => el });
    expect(added).toBeGreaterThan(0);
  });

  it('★二重には張らない(delegated listener は1回だけ)', () => {
    /*
     * _aiDiagDelegatedAttached は「既に張ったか」を覚えるモジュール状態。
     * 抽出時にこの状態も一緒に移した(popup-entry 側での利用がゼロなのを確認済み)。
     * 2回呼んでも listener が増えないことが、その移設が正しいことの証拠。
     */
    const el = document.createElement('div');
    let added = 0;
    const origin = el.addEventListener.bind(el);
    el.addEventListener = (...args) => {
      added += 1;
      return origin(...args);
    };
    // 直前のテストで既に attach 済みなので、ここでは増えないのが正しい。
    attachAiDiagButtonHandler({ b: 2 }, { getEl: () => el });
    attachAiDiagButtonHandler({ c: 3 }, { getEl: () => el });
    expect(added).toBe(0);
  });

  it('★attach 済みなら要素を探しにも行かない(早期 return が効いている)', () => {
    /*
     * ★このテストは最初「要素取得器が呼ばれること」を断言して赤になった。
     *   実際は _aiDiagDelegatedAttached が true になった後は
     *   getEl より【前】に return するので、呼ばれないのが正しい挙動だった。
     *   テストの方が間違っていたので、実挙動に合わせて断言を直した
     *   (実装を testable に歪めない)。
     */
    const asked = [];
    attachAiDiagButtonHandler(
      {},
      {
        getEl: (id) => {
          asked.push(id);
          return null;
        }
      }
    );
    expect(asked).toEqual([]);
  });
});
