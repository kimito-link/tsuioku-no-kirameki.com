import { describe, it, expect } from 'vitest';
import { shouldRunExternalFetchWhileHidden } from './hiddenTabExternalFetchGate.js';

describe('shouldRunExternalFetchWhileHidden（v0.1.616 非可視タブ外部fetchゲート）', () => {
  it('可視タブは常に true（対象状態に関わらず）', () => {
    expect(
      shouldRunExternalFetchWhileHidden({ tabHidden: false, targetsAcquired: [] })
    ).toBe(true);
    expect(
      shouldRunExternalFetchWhileHidden({ tabHidden: false, targetsAcquired: [true, true] })
    ).toBe(true);
    expect(
      shouldRunExternalFetchWhileHidden({ tabHidden: false, targetsAcquired: [false] })
    ).toBe(true);
  });

  it('非可視タブ: 未取得が1つでも残っていれば true（取りにいく）', () => {
    expect(
      shouldRunExternalFetchWhileHidden({ tabHidden: true, targetsAcquired: [false] })
    ).toBe(true);
    expect(
      shouldRunExternalFetchWhileHidden({
        tabHidden: true,
        targetsAcquired: [true, false, true]
      })
    ).toBe(true);
  });

  it('非可視タブ: 全部取得済みなら false（裏では叩かない＝リソース最小）', () => {
    expect(
      shouldRunExternalFetchWhileHidden({ tabHidden: true, targetsAcquired: [true] })
    ).toBe(false);
    expect(
      shouldRunExternalFetchWhileHidden({
        tabHidden: true,
        targetsAcquired: [true, true, true]
      })
    ).toBe(false);
  });

  it('非可視タブ: 対象配列が空なら false（判定対象なし＝従来どおり裏では叩かない）', () => {
    expect(
      shouldRunExternalFetchWhileHidden({ tabHidden: true, targetsAcquired: [] })
    ).toBe(false);
  });

  it('引数欠落・型外は安全側（tabHidden 既定 false 扱いで true、配列でなければ空扱い）', () => {
    // tabHidden 省略 = 可視扱い → true（可視は常に実行可）
    expect(shouldRunExternalFetchWhileHidden({})).toBe(true);
    expect(shouldRunExternalFetchWhileHidden(undefined)).toBe(true);
    // tabHidden true で targetsAcquired が非配列 → 空扱い → false
    expect(
      shouldRunExternalFetchWhileHidden({ tabHidden: true, targetsAcquired: null })
    ).toBe(false);
    expect(
      // @ts-expect-error 故意に型外
      shouldRunExternalFetchWhileHidden({ tabHidden: true, targetsAcquired: 'x' })
    ).toBe(false);
  });
});
