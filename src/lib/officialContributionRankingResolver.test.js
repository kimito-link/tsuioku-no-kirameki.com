/**
 * officialContributionRankingResolver.js のテスト。
 *
 * 目的（v0.1.286）:
 *   §6.1 で構造変化した「貢献度ランキング取得経路の優先度」を unit test で
 *   構造的に固定する。3 年後に誰かが優先度を戻したり、検証ガードを緩めたり
 *   しても、本 test が落ちる＝即検出できる。
 *
 * 設計（純関数のみ）:
 *   - I/O モック不要。各純関数に直接データを渡して結果を検証。
 *   - popup-entry.js の async wrapper は本 test の対象外（I/O 単体は
 *     happy-dom + chrome.storage stub では振る舞いが浅く、回帰検出力が
 *     低い＝純関数 test に集中させる）。
 */

import { describe, it, expect } from 'vitest';
import {
  iframeOfficialDomStorageKey,
  pickKokenStorageRows,
  pickDomBundleRows,
  pickIframeStorageRows,
  resolveContributionRankingRowsFromSources
} from './officialContributionRankingResolver.js';

describe('iframeOfficialDomStorageKey', () => {
  it('liveId を lowercase で suffix に組み込む', () => {
    expect(iframeOfficialDomStorageKey('lv350553787')).toBe('nls_iframe_official_dom_lv350553787');
  });

  it('大文字 / 前後空白を正規化する', () => {
    expect(iframeOfficialDomStorageKey('  LV12345 ')).toBe('nls_iframe_official_dom_lv12345');
  });

  it('空・undefined・null は空 suffix を返す（呼び出し側で短絡される想定）', () => {
    expect(iframeOfficialDomStorageKey('')).toBe('nls_iframe_official_dom_');
    expect(iframeOfficialDomStorageKey(/** @type {any} */ (undefined))).toBe('nls_iframe_official_dom_');
    expect(iframeOfficialDomStorageKey(/** @type {any} */ (null))).toBe('nls_iframe_official_dom_');
  });
});

describe('pickKokenStorageRows', () => {
  it('liveId 一致 + rows 非空配列 → rows を返す', () => {
    const data = { liveId: 'lv1', rows: [{ rank: 1, name: 'A', contribution: 100 }] };
    expect(pickKokenStorageRows(data, 'lv1')).toEqual([
      { rank: 1, name: 'A', contribution: 100 }
    ]);
  });

  it('liveId 不一致 → null（古い番組の rows 漏れ防止）', () => {
    const data = { liveId: 'lv1', rows: [{ rank: 1 }] };
    expect(pickKokenStorageRows(data, 'lv2')).toBe(null);
  });

  it('liveId 大文字 / 空白の不一致は正規化して比較', () => {
    const data = { liveId: 'lv1', rows: [{ rank: 1 }] };
    expect(pickKokenStorageRows(data, ' LV1 ')).not.toBe(null);
  });

  it('rows 空配列 → null', () => {
    expect(pickKokenStorageRows({ liveId: 'lv1', rows: [] }, 'lv1')).toBe(null);
  });

  it('rows プロパティ無し → null', () => {
    expect(pickKokenStorageRows({ liveId: 'lv1' }, 'lv1')).toBe(null);
  });

  it('rows が非配列 → null', () => {
    expect(pickKokenStorageRows({ liveId: 'lv1', rows: 'not-array' }, 'lv1')).toBe(null);
  });

  it('data が null / undefined / 非 object → null', () => {
    expect(pickKokenStorageRows(null, 'lv1')).toBe(null);
    expect(pickKokenStorageRows(undefined, 'lv1')).toBe(null);
    expect(pickKokenStorageRows('string', 'lv1')).toBe(null);
    expect(pickKokenStorageRows(123, 'lv1')).toBe(null);
  });

  it('引数 liveId が空 → null（無効入力）', () => {
    expect(pickKokenStorageRows({ liveId: 'lv1', rows: [{}] }, '')).toBe(null);
  });

  it('data.liveId プロパティ無しでも引数と空文字比較で null', () => {
    expect(pickKokenStorageRows({ rows: [{}] }, 'lv1')).toBe(null);
  });
});

describe('pickDomBundleRows', () => {
  it('contributionRanking 非空配列 → rows', () => {
    const bundle = { contributionRanking: [{ rank: 1 }, { rank: 2 }] };
    expect(pickDomBundleRows(bundle)).toEqual([{ rank: 1 }, { rank: 2 }]);
  });

  it('空配列 → null', () => {
    expect(pickDomBundleRows({ contributionRanking: [] })).toBe(null);
  });

  it('非配列 → null', () => {
    expect(pickDomBundleRows({ contributionRanking: null })).toBe(null);
    expect(pickDomBundleRows({ contributionRanking: 'str' })).toBe(null);
  });

  it('bundle 自体 null / undefined → null', () => {
    expect(pickDomBundleRows(null)).toBe(null);
    expect(pickDomBundleRows(undefined)).toBe(null);
  });

  it('bundle に他プロパティしか無くても落ちない', () => {
    expect(pickDomBundleRows({ giftHistory: [{}] })).toBe(null);
    expect(pickDomBundleRows({})).toBe(null);
  });
});

describe('pickIframeStorageRows', () => {
  it('contributionRanking 非空 → rows', () => {
    const data = { contributionRanking: [{ rank: 1 }] };
    expect(pickIframeStorageRows(data)).toEqual([{ rank: 1 }]);
  });

  it('空配列 → null', () => {
    expect(pickIframeStorageRows({ contributionRanking: [] })).toBe(null);
  });

  it('null / undefined / 非 object → null', () => {
    expect(pickIframeStorageRows(null)).toBe(null);
    expect(pickIframeStorageRows(undefined)).toBe(null);
    expect(pickIframeStorageRows(0)).toBe(null);
    expect(pickIframeStorageRows('str')).toBe(null);
  });
});

describe('resolveContributionRankingRowsFromSources (優先度統合)', () => {
  const liveId = 'lv12345';
  const kokenOk = { liveId, rows: [{ rank: 1, name: 'koken', contribution: 999 }] };
  const domOk = { contributionRanking: [{ rank: 1, name: 'dom', contribution: 500 }] };
  const iframeOk = { contributionRanking: [{ rank: 1, name: 'iframe', contribution: 200 }] };

  it('v0.1.285 §6.1: Koken / DOM / iframe 全部あれば Koken を返す', () => {
    const result = resolveContributionRankingRowsFromSources({
      kokenStorage: kokenOk,
      domBundle: domOk,
      iframeStorage: iframeOk,
      liveId
    });
    expect(result?.[0]?.name).toBe('koken');
  });

  it('Koken 空 → DOM bundle に fallback', () => {
    const result = resolveContributionRankingRowsFromSources({
      kokenStorage: null,
      domBundle: domOk,
      iframeStorage: iframeOk,
      liveId
    });
    expect(result?.[0]?.name).toBe('dom');
  });

  it('Koken liveId mismatch → DOM bundle に fallback（古い番組 rows 漏れ防止）', () => {
    const staleKoken = { liveId: 'lvOLD', rows: [{ name: 'stale' }] };
    const result = resolveContributionRankingRowsFromSources({
      kokenStorage: staleKoken,
      domBundle: domOk,
      iframeStorage: iframeOk,
      liveId
    });
    expect(result?.[0]?.name).toBe('dom');
  });

  it('Koken + DOM 両方空 → iframe storage に fallback', () => {
    const result = resolveContributionRankingRowsFromSources({
      kokenStorage: null,
      domBundle: { contributionRanking: [] },
      iframeStorage: iframeOk,
      liveId
    });
    expect(result?.[0]?.name).toBe('iframe');
  });

  it('3 経路すべて空 → null', () => {
    expect(
      resolveContributionRankingRowsFromSources({
        kokenStorage: null,
        domBundle: null,
        iframeStorage: null,
        liveId
      })
    ).toBe(null);
  });

  it('liveId 無し → Koken は短絡されるが DOM/iframe は液状で評価される', () => {
    // Koken は liveId 必須＝null。DOM bundle は liveId 無関係に rows があれば返す。
    const result = resolveContributionRankingRowsFromSources({
      kokenStorage: kokenOk,
      domBundle: domOk,
      iframeStorage: iframeOk,
      liveId: ''
    });
    expect(result?.[0]?.name).toBe('dom');
  });

  it('sources object 自体が空 → null', () => {
    // @ts-expect-error 不正入力に対する防御を確認
    expect(resolveContributionRankingRowsFromSources({})).toBe(null);
  });

  it('§6.1 回帰検出: DOM が新鮮でも Koken が新鮮なら Koken を返す（順序ロックの正本テスト）', () => {
    // 3 年後に誰かが「DOM の方が新しいから優先したい」と書き換えた場合、
    // この test が落ちて即検出される。これが本ファイルの存在意義。
    const result = resolveContributionRankingRowsFromSources({
      kokenStorage: kokenOk,
      domBundle: domOk,
      iframeStorage: null,
      liveId
    });
    expect(result?.[0]?.name).toBe('koken');
    expect(result?.[0]?.name).not.toBe('dom');
  });
});
