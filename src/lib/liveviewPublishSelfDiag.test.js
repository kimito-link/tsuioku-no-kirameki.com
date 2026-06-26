import { describe, it, expect } from 'vitest';
import {
  buildLiveviewPublishSelfDiag,
  formatLiveviewPublishSelfDiagLines,
  liveviewPublishSelfDiagToActionCards
} from './liveviewPublishSelfDiag.js';

const NOW = 1_000_000_000_000;

function cell(src) {
  return { displaySrc: src, title: 't', meta: { idLine: 'i', nameLine: 'n' }, entry: { userId: 'u' } };
}
function northRow(name, contribution) {
  return { name, contribution, thumbnailUrl: 'x', isAnonymous: false };
}

function fullBlob() {
  return {
    laneMirror: {
      liveId: 'lv1', capturedAt: NOW - 5000,
      link: [cell('a'), cell('b'), cell('c')], gift: [], ad: [], konta: [cell('k')], tanu: [cell('t1'), cell('t2')]
    },
    statCardsMirror: {
      liveId: 'lv1', capturedAt: NOW - 5000,
      recordsText: '2189', recordsIsPlaceholder: false,
      concurrent: { estText: '—', estIsPlaceholder: true },
      visitor: { text: '1583', isPlaceholder: false }
    },
    northStarMirror: {
      liveId: 'lv1', capturedAt: NOW - 5000,
      lanes: { contributionRanking: [northRow('x', 10), northRow('y', 5)], adRanking: [] }
    },
    topSupporters: { liveId: 'lv1', rows: [{}, {}, {}, {}, {}] }
  };
}

describe('buildLiveviewPublishSelfDiag', () => {
  it('完全な jsonBlob: 各鏡の件数を非nullで数える', () => {
    const d = buildLiveviewPublishSelfDiag({
      jsonBlob: fullBlob(), currentLiveId: 'lv1',
      publishKeys: { ingestKey: 'k', viewToken: 'v' },
      lastPost: { everSent: true, lastOk: true, lastHttpStatus: 200, ageSec: 12 },
      nowMs: NOW
    });
    expect(d.publish.ready).toBe(true);
    expect(d.mirrors.lane.total).toBe(6); // link3 + konta1 + tanu2
    expect(d.mirrors.lane.counts.link).toBe(3);
    expect(d.mirrors.lane.counts.gift).toBe(0);
    expect(d.mirrors.northStar.contribution).toBe(2);
    expect(d.mirrors.northStar.ad).toBe(0);
    expect(d.mirrors.stat.records).toBe(true);
    expect(d.mirrors.stat.concurrent).toBe(false); // placeholder
    expect(d.mirrors.stat.visitor).toBe(true);
    expect(d.mirrors.supporters.count).toBe(5);
  });

  it('空セル(displaySrcなし)は数えない', () => {
    const blob = fullBlob();
    blob.laneMirror.link.push({ displaySrc: '' }, { title: 'no-src' });
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blob, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.mirrors.lane.counts.link).toBe(3); // 空2件は無視
  });

  it('鏡が無いと present:false', () => {
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: {}, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.mirrors.lane.present).toBe(false);
    expect(d.mirrors.northStar.present).toBe(false);
  });

  it('liveId 一致/不一致を判定', () => {
    const d1 = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d1.mirrors.lane.lidMatch).toBe(true);
    const d2 = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), currentLiveId: 'lv999', publishKeys: {}, nowMs: NOW });
    expect(d2.mirrors.lane.lidMatch).toBe(false);
    const d3 = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), currentLiveId: '', publishKeys: {}, nowMs: NOW });
    expect(d3.mirrors.lane.lidMatch).toBe(null); // 不明
  });

  it('鮮度: 3分超は ageSec が大きい値で出る', () => {
    const blob = fullBlob();
    blob.laneMirror.capturedAt = NOW - 4 * 60 * 1000; // 4分前
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blob, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.mirrors.lane.ageSec).toBe(240);
  });

  it('整合チェック: 拡張が確定状態(ok/no_ranking_data)かつ鏡が新鮮なら突合（一致）', () => {
    const fastDiag = { content: { giftDiagnostics: { '北極星レーン': {
      '1_貢献度ランキング': { apiRows: 2, state: 'ok' }, '+α_広告ランキング': { apiRows: 0, state: 'no_ranking_data' }
    } } } };
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), fastDiag, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.consistency).toHaveLength(2);
    expect(d.consistency[0]).toMatchObject({ lane: '北極星 貢献度', extRows: 2, mirrorRows: 2, match: true });
    expect(d.consistency[1]).toMatchObject({ lane: '北極星 広告', extRows: 0, mirrorRows: 0, match: true });
  });

  it('整合チェック: 確定状態で件数がズレると不一致(コピー漏れ)', () => {
    const fastDiag = { content: { giftDiagnostics: { '北極星レーン': {
      '1_貢献度ランキング': { apiRows: 6, state: 'ok' } // 拡張は確定6件なのに鏡は2件
    } } } };
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), fastDiag, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.consistency[0]).toMatchObject({ extRows: 6, mirrorRows: 2, match: false });
  });

  it('整合チェック: 拡張が not_yet(取得中)なら突合せず保留=誤検知しない', () => {
    // ★実機で踏んだ誤検知: 拡張 apiRows=0/state=not_yet だが鏡には過去値6件。突合すると「拡張0≠鏡6」を
    //   コピー漏れと誤判定していた。確定状態でないので保留(skipped)にすべき。
    const fastDiag = { content: { giftDiagnostics: { '北極星レーン': {
      '1_貢献度ランキング': { apiRows: 0, state: 'not_yet' }
    } } } };
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), fastDiag, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.consistency[0]).toMatchObject({ skipped: true, match: null });
    expect(d.consistency[0].reason).toContain('取得中');
  });

  it('整合チェック: 鏡が古い(>3分)なら確定状態でも突合せず保留', () => {
    const blob = fullBlob();
    blob.northStarMirror.capturedAt = NOW - 4 * 60 * 1000; // 北極星鏡が4分前
    const fastDiag = { content: { giftDiagnostics: { '北極星レーン': {
      '1_貢献度ランキング': { apiRows: 99, state: 'ok' }
    } } } };
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blob, fastDiag, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.consistency[0]).toMatchObject({ skipped: true, match: null });
    expect(d.consistency[0].reason).toContain('古い');
  });

  it('fastDiag が無ければ整合チェックは空（フェイルソフト）', () => {
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.consistency).toEqual([]);
  });

  it('サイズを計算', () => {
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.size.bytes).toBeGreaterThan(0);
    expect(d.size.cap).toBe(512 * 1024);
    expect(d.size.percent).toBeGreaterThanOrEqual(0);
  });

  it('キー未設定を検知', () => {
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), currentLiveId: 'lv1', publishKeys: { ingestKey: 'k' }, nowMs: NOW });
    expect(d.publish.hasIngestKey).toBe(true);
    expect(d.publish.hasViewToken).toBe(false);
    expect(d.publish.ready).toBe(false);
  });
});

describe('formatLiveviewPublishSelfDiagLines', () => {
  it('完全な診断をテキスト行に整形', () => {
    const fastDiag = { content: { giftDiagnostics: { '北極星レーン': {
      '1_貢献度ランキング': { apiRows: 2, state: 'ok' }, '+α_広告ランキング': { apiRows: 0, state: 'no_ranking_data' }
    } } } };
    const d = buildLiveviewPublishSelfDiag({
      jsonBlob: fullBlob(), fastDiag, currentLiveId: 'lv1',
      publishKeys: { ingestKey: 'k', viewToken: 'v' },
      lastPost: { everSent: true, lastOk: true, lastHttpStatus: 200, ageSec: 12 },
      nowMs: NOW
    });
    const lines = formatLiveviewPublishSelfDiagLines(d);
    const text = lines.join('\n');
    expect(text).toContain('### 純Web公開コピーの自己診断');
    expect(text).toContain('ingestKey ✅');
    expect(text).toContain('直近の公開送信: ✅');
    expect(text).toContain('HTTP 200');
    expect(text).toContain('応援レーン: りんく3');
    expect(text).toContain('北極星: 貢献度2 / 広告0');
    expect(text).toContain('整合チェック');
    expect(text).toContain('元データ無し＝純Webに出なくて正常');
  });

  it('未送信を明示', () => {
    const d = buildLiveviewPublishSelfDiag({
      jsonBlob: fullBlob(), currentLiveId: 'lv1',
      publishKeys: { ingestKey: 'k', viewToken: 'v' },
      lastPost: { everSent: false }, nowMs: NOW
    });
    const text = formatLiveviewPublishSelfDiagLines(d).join('\n');
    expect(text).toContain('まだ送信していません');
  });

  it('キー未設定を明示', () => {
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    const text = formatLiveviewPublishSelfDiagLines(d).join('\n');
    expect(text).toContain('🔴未設定');
    expect(text).toContain('純Webに何も届きません');
  });
});

describe('liveviewPublishSelfDiagToActionCards', () => {
  it('キー未設定で bad カード', () => {
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    const cards = liveviewPublishSelfDiagToActionCards(d);
    expect(cards.some((c) => c.id === 'liveview-publish-key-missing' && c.severity === 'bad')).toBe(true);
  });

  it('未送信で warn カード（キーは揃っている）', () => {
    const d = buildLiveviewPublishSelfDiag({
      jsonBlob: fullBlob(), currentLiveId: 'lv1',
      publishKeys: { ingestKey: 'k', viewToken: 'v' }, lastPost: { everSent: false }, nowMs: NOW
    });
    const cards = liveviewPublishSelfDiagToActionCards(d);
    expect(cards.some((c) => c.id === 'liveview-publish-never-sent')).toBe(true);
  });

  it('送信失敗で bad カード', () => {
    const d = buildLiveviewPublishSelfDiag({
      jsonBlob: fullBlob(), currentLiveId: 'lv1',
      publishKeys: { ingestKey: 'k', viewToken: 'v' },
      lastPost: { everSent: true, lastOk: false, lastHttpStatus: 502, lastError: 'x' }, nowMs: NOW
    });
    const cards = liveviewPublishSelfDiagToActionCards(d);
    expect(cards.some((c) => c.id === 'liveview-publish-failed' && c.severity === 'bad')).toBe(true);
  });

  it('件数不一致で warn カード', () => {
    const fastDiag = { content: { giftDiagnostics: { '北極星レーン': { '1_貢献度ランキング': { apiRows: 6, state: 'ok' } } } } };
    const d = buildLiveviewPublishSelfDiag({
      jsonBlob: fullBlob(), fastDiag, currentLiveId: 'lv1',
      publishKeys: { ingestKey: 'k', viewToken: 'v' }, lastPost: { everSent: true, lastOk: true }, nowMs: NOW
    });
    const cards = liveviewPublishSelfDiagToActionCards(d);
    expect(cards.some((c) => c.id.startsWith('liveview-mirror-count-mismatch'))).toBe(true);
  });

  it('liveId 不一致で warn カード', () => {
    const d = buildLiveviewPublishSelfDiag({
      jsonBlob: fullBlob(), currentLiveId: 'lv999',
      publishKeys: { ingestKey: 'k', viewToken: 'v' }, lastPost: { everSent: true, lastOk: true }, nowMs: NOW
    });
    const cards = liveviewPublishSelfDiagToActionCards(d);
    expect(cards.some((c) => c.id === 'liveview-mirror-liveid-mismatch')).toBe(true);
  });

  it('全部正常ならカードゼロ', () => {
    const fastDiag = { content: { giftDiagnostics: { '北極星レーン': {
      '1_貢献度ランキング': { apiRows: 2, state: 'ok' }, '+α_広告ランキング': { apiRows: 0, state: 'no_ranking_data' }
    } } } };
    const d = buildLiveviewPublishSelfDiag({
      jsonBlob: fullBlob(), fastDiag, currentLiveId: 'lv1',
      publishKeys: { ingestKey: 'k', viewToken: 'v' },
      lastPost: { everSent: true, lastOk: true, lastHttpStatus: 200 }, nowMs: NOW
    });
    const cards = liveviewPublishSelfDiagToActionCards(d);
    expect(cards).toEqual([]);
  });
});
