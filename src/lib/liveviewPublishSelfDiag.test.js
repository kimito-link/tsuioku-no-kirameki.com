import { describe, it, expect } from 'vitest';
import {
  buildLiveviewPublishSelfDiag,
  formatLiveviewPublishSelfDiagLines,
  liveviewPublishSelfDiagToActionCards,
  judgeLaneMirrorConsistency,
  judgeCommentMirrorConsistency
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
    topSupporters: { liveId: 'lv1', rows: [{}, {}, {}, {}, {}] },
    // ③WEB投げ一覧丸写し(第2号): 貢献者 rooms 3 + 投げ明細 ledger 2(母数 7)。
    giftHistoryMirror: {
      liveId: 'lv1', capturedAt: NOW - 5000,
      rooms: [{ userKey: 'u1', nickname: 'a', count: 3 }, { userKey: 'u2', nickname: 'b', count: 2 }, { userKey: 'u3', nickname: 'c', count: 1 }],
      ledgerRows: [{ timeLabel: '1', itemName: 'x', points: 10 }, { timeLabel: '2', itemName: 'y', points: 5 }],
      ledgerTotalCount: 7
    }
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
    // ③WEB投げ一覧丸写し(第2号): 貢献者 rooms 数・投げ明細 ledger 数・母数を出す。
    expect(d.mirrors.giftHistory.present).toBe(true);
    expect(d.mirrors.giftHistory.rooms).toBe(3);
    expect(d.mirrors.giftHistory.ledger).toBe(2);
    expect(d.mirrors.giftHistory.ledgerTotal).toBe(7);
  });

  it('空セル(displaySrcなし)は数えない', () => {
    const blob = fullBlob();
    blob.laneMirror.link.push({ displaySrc: '' }, { title: 'no-src' });
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blob, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.mirrors.lane.counts.link).toBe(3); // 空2件は無視(userId も無いので復元できない)
  });

  /**
   * v0.1.1236: 鏡スリム化 B-2(v0.1.1235)の副作用で、③WEB鏡の件数が 0 に見える偽🔴が出ていた。
   *
   * B-2 は匿名セルの displaySrc(identicon の data URL・約2.5KB)を鏡から落とす。
   * 読み手(B-1・laneMirror.js:207-209)が userId から同じ顔を再生成するので**表示は正常**だが、
   * laneCellFilled が displaySrc しか見ていなかったため「中身なし」と数え、
   * 匿名258人の配信で「①POP 258 / ③WEB鏡 0 🔴」という嘘の不一致を出していた(実測で再現)。
   *
   * ★「中身あり」の定義を B-1 と揃える: displaySrc 空でも userId があれば復元できる=中身あり。
   */
  describe('B-2(鏡スリム化)でstripされたセルの数え方', () => {
    it('★displaySrc空+userId有り は「中身あり」と数える(復元できるため・偽🔴を出さない)', () => {
      const blob = fullBlob();
      blob.laneMirror.tanu = [
        { displaySrc: '', userId: 'a:anon1' },
        { displaySrc: '', userId: 'a:anon2' }
      ];
      const d = buildLiveviewPublishSelfDiag({ jsonBlob: blob, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
      expect(d.mirrors.lane.counts.tanu).toBe(2);
    });

    it('displaySrc も userId も空のセルは従来どおり数えない(復元できない)', () => {
      const blob = fullBlob();
      blob.laneMirror.tanu = [{ displaySrc: '', userId: '' }, { title: 'no-src' }];
      const d = buildLiveviewPublishSelfDiag({ jsonBlob: blob, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
      expect(d.mirrors.lane.counts.tanu).toBe(0);
    });

    it('★実配信の再現(匿名258人が全員strip): ①POP と ③WEB鏡 が一致して✅になる', () => {
      const blob = fullBlob();
      blob.laneMirror.link = [];
      blob.laneMirror.gift = [];
      blob.laneMirror.ad = [];
      blob.laneMirror.konta = [];
      blob.laneMirror.tanu = Array.from({ length: 258 }, (_, i) => ({ displaySrc: '', userId: `a:u${i}` }));
      blob.laneMirror.pickedLength = 258;
      blob.laneMirror.totalCandidates = 258;
      const d = buildLiveviewPublishSelfDiag({ jsonBlob: blob, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
      expect(d.mirrors.lane.total).toBe(258);
      const laneRow = d.consistency.find((c) => c.lane === '応援レーン(全段)');
      expect(laneRow?.match).toBe(true); // 🔴を出さない
    });
  });

  it('鏡が無いと present:false', () => {
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: {}, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.mirrors.lane.present).toBe(false);
    expect(d.mirrors.northStar.present).toBe(false);
    expect(d.mirrors.giftHistory.present).toBe(false);
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

  it('整合チェック: 生API深度>鏡上限(42→鏡10)は設計通りの cap=一致(誤検知の根治・実機lv350857956 v0.1.1000)', () => {
    // koken API は rank=20 で取るが鏡は 1-10 位で頭打ち(NORTH_STAR_LANE_ROW_CAP)。生42と鏡10を
    //   そのまま突合すると「コピー漏れ🔴」と誤検知する。apiRows を上限でクランプして突合=一致にする。
    const blob = fullBlob();
    blob.northStarMirror.lanes.contributionRanking = Array.from({ length: 10 }, (_, i) => ({
      name: `u${i}`,
      contribution: 100 - i
    })); // 鏡は満杯の10件
    const fastDiag = { content: { giftDiagnostics: { '北極星レーン': {
      '1_貢献度ランキング': { apiRows: 42, state: 'ok' } // 生API深度は42(11位以降は鏡に載らない設計)
    } } } };
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blob, fastDiag, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    // extRows は生値(42)を保持しつつ、判定は上限クランプ後で match=true。
    expect(d.consistency[0]).toMatchObject({ extRows: 42, mirrorRows: 10, match: true });
    // コピー漏れカードに昇格しない(誤検知ゼロ)。
    const cards = liveviewPublishSelfDiagToActionCards(d);
    expect(cards.some((c) => c.id.startsWith('liveview-mirror-count-mismatch'))).toBe(false);
  });

  it('整合チェック: 上限クランプ後でも本物の欠落(鏡<min(api,cap))は🔴不一致のまま', () => {
    // 生42→クランプ10、だが鏡は3件しか無い=本物のコピー漏れ→引き続き mismatch。
    const blob = fullBlob();
    blob.northStarMirror.lanes.contributionRanking = [
      { name: 'a', contribution: 9 }, { name: 'b', contribution: 8 }, { name: 'c', contribution: 7 }
    ]; // 鏡3件
    const fastDiag = { content: { giftDiagnostics: { '北極星レーン': {
      '1_貢献度ランキング': { apiRows: 42, state: 'ok' }
    } } } };
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blob, fastDiag, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.consistency[0]).toMatchObject({ extRows: 42, mirrorRows: 3, match: false });
    // メッセージに生件数(42)を併記して透明性を保つ。
    expect(d.consistency[0].reason).toContain('生42');
  });

  it('整合チェック(第2段): 拡張>鏡 が許容幅以内(1件差)は鮮度差=normal で警告しない', () => {
    // ★実機 v0.1.964: 拡張 apiRows=7 ≠ 鏡6(1件差)。koken 30秒自動更新の鮮度差=コピー漏れではない。
    const blob = fullBlob();
    blob.northStarMirror.lanes.contributionRanking = [
      { name: 'a', contribution: 7 }, { name: 'b', contribution: 6 }, { name: 'c', contribution: 5 },
      { name: 'd', contribution: 4 }, { name: 'e', contribution: 3 }, { name: 'f', contribution: 2 }
    ]; // 鏡6件
    const fastDiag = { content: { giftDiagnostics: { '北極星レーン': {
      '1_貢献度ランキング': { apiRows: 7, state: 'ok' } // 拡張は今7件
    } } } };
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blob, fastDiag, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.consistency[0]).toMatchObject({ extRows: 7, mirrorRows: 6, match: null, skipped: true, normal: true });
    expect(d.consistency[0].reason).toContain('鮮度差');
    // ★normal は警告カードに昇格しない(誤検知ゼロ)。
    const cards = liveviewPublishSelfDiagToActionCards(d);
    expect(cards.some((c) => c.id.startsWith('liveview-mirror-count-mismatch'))).toBe(false);
  });

  it('整合チェック(第2段): 鏡が空(0)なのに拡張に実データ=完全欠落は許容幅と無関係に🔴不一致', () => {
    // 1件でも鏡=0 は鮮度差でなく本物のコピー漏れ(完全欠落)。
    const blob = fullBlob();
    blob.northStarMirror.lanes.contributionRanking = []; // 鏡0件
    const fastDiag = { content: { giftDiagnostics: { '北極星レーン': {
      '1_貢献度ランキング': { apiRows: 1, state: 'ok' }
    } } } };
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blob, fastDiag, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.consistency[0]).toMatchObject({ extRows: 1, mirrorRows: 0, match: false });
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

  it('投げ一覧(giftHistory): 件数のみ(比較なし)を明示し嘘の✅/🔴を出さない', () => {
    const d = buildLiveviewPublishSelfDiag({
      jsonBlob: fullBlob(), currentLiveId: 'lv1',
      publishKeys: { ingestKey: 'k', viewToken: 'v' }, nowMs: NOW
    });
    const line = formatLiveviewPublishSelfDiagLines(d).find((l) => l.startsWith('- 投げ一覧:'));
    expect(line).toBeTruthy();
    expect(line).toContain('貢献者3');
    expect(line).toContain('投げ明細2/7件'); // 母数7>表示2=「2/7件」
    expect(line).toContain('比較対象APIなし=件数のみ');
    // consistency に giftHistory の突合行(嘘の🔴になりうる)は作らない
    expect(d.consistency.some((c) => String(c.lane || '').includes('投げ'))).toBe(false);
  });

  it('投げ一覧が prune された場合、⚠️削減行に日本語ラベルで明記(嘘の欠落に見せない)', () => {
    const blob = fullBlob();
    blob.snapshotMeta = { capturedAt: NOW - 5000, pruned: [{ section: 'giftHistoryMirror.ledgerRows', before: 20, after: 8 }] };
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blob, currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    const line = formatLiveviewPublishSelfDiagLines(d).find((l) => l.startsWith('⚠️ 容量超過のため③WEB'));
    expect(line).toBeTruthy();
    expect(line).toContain('投げ一覧の明細rows 20→8'); // 生キーでなく日本語ラベル
    expect(line).not.toContain('giftHistoryMirror.ledgerRows'); // 生キーが露出しない
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

  it('★キー未設定の対処が「実際にできる操作」を案内している（.env 再ビルドは廃止済み）', () => {
    /*
     * ★2026-08-30 の実機速報で見つかった食い違い。
     *   同じ1つの速報が、矛盾する案内を2つ出していた:
     *     ・対処カード → 「.env に STATUS_INGEST_KEY を設定して再ビルド」
     *     ・別の行     → 「「🔑 WEB共有の設定」で入力してください」
     *   ★.env 方式は v0.1.1245 で廃止済み(公開リポに鍵が出た事故のため、
     *     ビルドに焼き込まず storage から読む形にした・status-entry.js:609)。
     *   ＝できない操作を案内していた＝利用者の時間を奪う。
     *   AGENTS.md §12.7「対処を書く/変えるときは実コードで裏取りしてから書く」。
     */
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    const card = liveviewPublishSelfDiagToActionCards(d).find((c) => c.id === 'liveview-publish-key-missing');
    expect(card).toBeTruthy();
    const text = `${card.cause} ${card.action}`;
    // ★廃止された方式を案内しないこと。
    expect(text).not.toMatch(/\.env/);
    expect(text).not.toMatch(/STATUS_INGEST_KEY|STATUS_VIEW_TOKEN/);
    // ★「再ビルド」の語そのものは禁じない（「再ビルドは不要です」と書けるようにする）。
    //   禁じるのは【再ビルドを指示すること】。
    expect(text).not.toMatch(/再ビルド(?!は不要)/);
    expect(text).not.toMatch(/build:copy/);
    // ★いま実在する入口(status の設定欄)を名指しすること。
    expect(card.action).toContain('WEB共有の設定');
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

describe('judgeLaneMirrorConsistency — ①POP vs ③WEB鏡のレーン突合(v0.1.1017)', () => {
  it('①=③ 完全一致は match', () => {
    expect(judgeLaneMirrorConsistency(44, 44)).toEqual({ verdict: 'match', reason: '' });
  });
  it('③鏡が①より少ない=欠落は mismatch(理由に件数差)', () => {
    const r = judgeLaneMirrorConsistency(44, 30);
    expect(r.verdict).toBe('mismatch');
    expect(r.reason).toContain('①POP 44件');
    expect(r.reason).toContain('③WEB鏡 30件');
    expect(r.reason).toContain('14件');
  });
  it('③鏡が①より多い(余分)も mismatch', () => {
    expect(judgeLaneMirrorConsistency(10, 12).verdict).toBe('mismatch');
  });
  it('0/0 は一致', () => {
    expect(judgeLaneMirrorConsistency(0, 0).verdict).toBe('match');
  });
});

describe('judgeCommentMirrorConsistency — ①POP vs ③WEBのコメント突合(v0.1.1017)', () => {
  it('母数がcap以下で全部載る=match', () => {
    expect(judgeCommentMirrorConsistency(30, 30, 60).verdict).toBe('match');
  });
  it('母数がcap超でrowsがcap到達=capped(正常な頭打ち)', () => {
    const r = judgeCommentMirrorConsistency(808, 60, 60);
    expect(r.verdict).toBe('capped');
    expect(r.reason).toContain('最新60件');
    expect(r.reason).toContain('母数808件');
  });
  it('rowsが母数から大きく目減り=mismatch(コメントが薄い)', () => {
    // 母数808だが③に載るのが30だけ=778件が捨てられた=薄い。
    const r = judgeCommentMirrorConsistency(808, 30, 60);
    expect(r.verdict).toBe('mismatch');
    expect(r.reason).toContain('30件');
    expect(r.reason).toContain('808件');
  });
  it('母数=rows=0 は match(何も無いだけ)', () => {
    expect(judgeCommentMirrorConsistency(0, 0, 60).verdict).toBe('match');
  });
});

describe('容量 prune の透明性(Phase 1 MVP・2026-07-07) — 嘘の🔴を出さない', () => {
  /** コメント鏡付きの blob(母数40だが③には8件しか載っていない=本来なら mismatch)。 */
  function blobWithThinComment(pruned) {
    const rows = Array.from({ length: 8 }, (_, i) => ({ text: `c${i}`, name: `n${i}`, at: i + 1 }));
    return {
      snapshotMeta: pruned ? { capturedAt: NOW - 5000, pruned } : { capturedAt: NOW - 5000 },
      laneMirror: { liveId: 'lv1', capturedAt: NOW - 5000, link: [cell('a')], gift: [], ad: [], konta: [], tanu: [] },
      commentTimelineMirror: { liveId: 'lv1', capturedAt: NOW - 5000, rows, totalSeen: 40 }
    };
  }

  it('prune 無し: 母数40 vs ③8件は mismatch(本物の欠落は🔴のまま)', () => {
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blobWithThinComment(null), currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    const c = d.consistency.find((x) => x.lane === 'コメント');
    expect(c).toBeTruthy();
    expect(c.match).toBe(false);
  });

  it('prune 有り: 同じ件数差でも「容量削減=正常」で🔴にしない(normal/skipped)', () => {
    const pruned = [{ section: 'commentTimelineMirror.rows', before: 40, after: 8 }];
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blobWithThinComment(pruned), currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    const c = d.consistency.find((x) => x.lane === 'コメント');
    expect(c).toBeTruthy();
    expect(c.match).toBe(null);
    expect(c.skipped).toBe(true);
    expect(c.normal).toBe(true);
    expect(c.reason).toContain('prune');
  });

  it('diag.pruned に削った内訳が入る', () => {
    const pruned = [
      { section: 'commentTimelineMirror.rows', before: 40, after: 8 },
      { section: 'topSupporters.rows', before: 10, after: 5 }
    ];
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blobWithThinComment(pruned), currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.pruned).toHaveLength(2);
    expect(d.pruned[0]).toMatchObject({ section: 'commentTimelineMirror.rows', before: 40, after: 8 });
  });

  it('format 行: prune したら⚠️行で削減を必ず明記する(嘘をつかない)', () => {
    const pruned = [{ section: 'commentTimelineMirror.rows', before: 40, after: 8 }];
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: blobWithThinComment(pruned), currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    const lines = formatLiveviewPublishSelfDiagLines(d);
    const line = lines.find((l) => l.startsWith('⚠️ 容量超過のため③WEB'));
    expect(line).toBeTruthy();
    expect(line).toContain('コメント鏡rows 40→8');
  });

  it('prune していなければ⚠️削減行は出ない(挙動不変)', () => {
    const d = buildLiveviewPublishSelfDiag({ jsonBlob: fullBlob(), currentLiveId: 'lv1', publishKeys: {}, nowMs: NOW });
    expect(d.pruned).toEqual([]);
    const lines = formatLiveviewPublishSelfDiagLines(d);
    expect(lines.some((l) => l.startsWith('⚠️ 容量超過のため③WEB'))).toBe(false);
  });
});
