import { describe, expect, it } from 'vitest';
import {
  applyPopupWindowBounds,
  isPopupWindowAtBounds
} from './applyPopupWindowBounds.js';

describe('isPopupWindowAtBounds', () => {
  it('幅と高さの両方が一致するときだけ true', () => {
    expect(isPopupWindowAtBounds({ width: 420, height: 851 }, { width: 420, height: 851 })).toBe(true);
    expect(isPopupWindowAtBounds({ width: 1288, height: 851 }, { width: 420, height: 851 })).toBe(false);
    expect(isPopupWindowAtBounds({ width: 420, height: 780 }, { width: 420, height: 851 })).toBe(false);
    expect(isPopupWindowAtBounds(null, { width: 420, height: 851 })).toBe(false);
  });
});

describe('applyPopupWindowBounds', () => {
  it('1回目で幅が決まれば update は1回', async () => {
    const calls = [];
    const api = {
      update: async (id, info) => {
        calls.push(['update', id, { ...info }]);
      },
      get: async (id) => {
        calls.push(['get', id]);
        return { width: 420, height: 851 };
      }
    };
    await applyPopupWindowBounds(api, 9, { width: 420, height: 851 });
    expect(calls).toEqual([
      ['update', 9, { height: 851, width: 420 }],
      ['get', 9]
    ]);
  });

  it('1回目のあとに幅が残っていればもう一度指定する', async () => {
    const calls = [];
    // 1回目の update では幅が残る（仮想ディスプレイ等の再現）。
    const api = {
      update: async (id, info) => {
        calls.push(['update', id, { ...info }]);
      },
      get: async (id) => {
        calls.push(['get', id]);
        const updates = calls.filter((c) => c[0] === 'update').length;
        return { width: updates >= 2 ? 420 : 1288, height: 851 };
      }
    };
    await applyPopupWindowBounds(api, 9, { width: 420, height: 851 });
    expect(calls).toEqual([
      ['update', 9, { height: 851, width: 420 }],
      ['get', 9],
      ['update', 9, { height: 851, width: 420 }]
    ]);
  });
});
