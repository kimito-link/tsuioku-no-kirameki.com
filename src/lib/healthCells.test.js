import { describe, it, expect } from 'vitest';
import { buildHealthCells } from './healthCells.js';

const cellById = (cells, id) => cells.find((c) => c.id === id);

describe('buildHealthCells', () => {
  it('空入力でも落ちず、全セルが na(対象外)で赤を作らない', () => {
    const cells = buildHealthCells({});
    expect(cells.length).toBeGreaterThan(10);
    // 該当データ無し=na。bad(赤)は1つも無い(正常に「データ無し」を赤にしない)。
    expect(cells.every((c) => c.level !== 'bad')).toBe(true);
  });

  it('取得率: 公式0件は na(0%赤にしない)', () => {
    const c = cellById(buildHealthCells({ livesData: [{ recordedCount: 0, officialCommentCount: 0 }] }), 'capture-rate');
    expect(c.level).toBe('na');
    expect(c.value).toBeNull();
  });

  it('取得率: 99%は ok・%値が出る', () => {
    const c = cellById(buildHealthCells({ livesData: [{ recordedCount: 3598, officialCommentCount: 3643 }] }), 'capture-rate');
    expect(c.level).toBe('ok');
    expect(c.value).toBe(99);
  });

  it('取得率: 30%は bad', () => {
    const c = cellById(buildHealthCells({ livesData: [{ recordedCount: 30, officialCommentCount: 100 }] }), 'capture-rate');
    expect(c.level).toBe('bad');
    expect(c.value).toBe(30);
  });

  it('🔴 NDGR unknown は na(障害でなく未受信なので赤にしない・批判役の指摘)', () => {
    const cells = buildHealthCells({ fastDiag: { content: { networkErrorProbe: { ndgrConnectStatus: 'unknown' } } } });
    const c = cellById(cells, 'ndgr');
    expect(c.level).toBe('na');
  });

  it('NDGR connected=ok / disconnected=bad', () => {
    expect(cellById(buildHealthCells({ fastDiag: { content: { networkErrorProbe: { ndgrConnectStatus: 'connected' } } } }), 'ndgr').level).toBe('ok');
    expect(cellById(buildHealthCells({ fastDiag: { content: { networkErrorProbe: { ndgrConnectStatus: 'disconnected' } } } }), 'ndgr').level).toBe('bad');
  });

  it('🔴 北極星 no_event/該当無しは na(その配信にイベント無いだけ=赤にしない)', () => {
    const cells = buildHealthCells({
      fastDiag: { content: { giftDiagnostics: { '北極星レーン': {
        '3_イベント累計スコア': { state: 'no_event' },
        '4_番組累計ポイント': { state: 'ok', value: 6940 }
      } } } }
    });
    expect(cellById(cells, 'ns-escore').level).toBe('na');
    expect(cellById(cells, 'ns-prog-pt').level).toBe('ok');
  });

  it('v0.1.845 北極星 iframe_unrendered=processing(取得中=正常な途中・青)', () => {
    const cells = buildHealthCells({
      fastDiag: { content: { giftDiagnostics: { '北極星レーン': { '2_ギフト履歴': { state: 'iframe_unrendered' } } } } }
    });
    expect(cellById(cells, 'ns-gift-hist').level).toBe('processing');
  });

  it('多タブ名残: 有っても warn まで(実害なし=赤にしない・v0.1.834)', () => {
    const cells = buildHealthCells({ fastDiag: { content: { giftDiagnostics: { multiTabDiag: { staleDomBundleSuspected: true } } } } });
    expect(cellById(cells, 'stale').level).toBe('warn');
  });

  it('コンソールエラー: 0件=ok / 有=bad', () => {
    expect(cellById(buildHealthCells({ fastDiag: { content: { consoleErrorProbe: { totalCount: 0 } } } }), 'console').level).toBe('ok');
    expect(cellById(buildHealthCells({ fastDiag: { content: { consoleErrorProbe: { totalCount: 3 } } } }), 'console').level).toBe('bad');
  });

  it('userId付き保存: 匿名主体(保存0)は na・保存ありで100%は ok', () => {
    const anon = buildHealthCells({ fastDiag: { content: { giftDiagnostics: { commentObservability: { savedCommentsUidStats: { totalSaved: 0, withUidPercent: 0 } } } } } });
    expect(cellById(anon, 'uid-rate').level).toBe('na');
    const named = buildHealthCells({ fastDiag: { content: { giftDiagnostics: { commentObservability: { savedCommentsUidStats: { totalSaved: 100, withUidPercent: 99.8 } } } } } });
    expect(cellById(named, 'uid-rate').level).toBe('ok');
  });

  it('実機相当(健全配信)= 赤(bad)が出ない', () => {
    // lv350761522 相当: 取得率99 / connected / 北極星 ok×3+na×2+warn×1。
    const cells = buildHealthCells({
      livesData: [{ recordedCount: 3598, officialCommentCount: 3643, officialRatePct: 99, lastIngestAgoMs: 5000, paintMs: 62 }],
      fastDiag: { content: {
        networkErrorProbe: { ndgrConnectStatus: 'connected', serviceWorkerInactive: false },
        consoleErrorProbe: { totalCount: 0 },
        giftDiagnostics: {
          commentObservability: { savedCommentsUidStats: { totalSaved: 2, withUidPercent: 100 } },
          ndgrWireCounters: { decoded: 319, chats: 28 },
          '北極星レーン': {
            '4_番組累計ポイント': { state: 'ok' }, '3_イベント累計スコア': { state: 'ok' }, '5_イベント現在順位': { state: 'ok' },
            '1_貢献度ランキング': { state: 'ok' }, '+α_広告ランキング': { state: 'ok' }, '2_ギフト履歴': { state: 'iframe_unrendered' }
          }
        }
      } }
    });
    expect(cells.some((c) => c.level === 'bad')).toBe(false);
    expect(cellById(cells, 'capture-rate').value).toBe(99);
  });
});

describe('buildHealthCells v0.1.845 進行中=processing(青)・見た瞬間ほぼ全部緑/青', () => {
  const running = { romiDebug: { backfill: { running: true, done: 0, stopReason: '' } } };

  it('backfill 進行中: 取得率・過去ログ・記録↔公式一致 が processing(嘘をつかず数字は保持)', () => {
    const cells = buildHealthCells({
      livesData: [{ recordedCount: 70, officialCommentCount: 100, officialRatePct: 39 }],
      fastDiag: { content: { giftDiagnostics: running } }
    });
    const cap = cellById(cells, 'capture-rate');
    expect(cap.level).toBe('processing');
    expect(cap.value).toBe(70); // 数字は偽らない(70%のまま色だけ青)。
    expect(cellById(cells, 'backfill').level).toBe('processing');
    expect(cellById(cells, 'match').level).toBe('processing');
    // 進行中は黄/赤を出さない=「調子が悪い」に見えない。
    expect([cap.level, cellById(cells, 'backfill').level, cellById(cells, 'match').level])
      .not.toContain('bad');
  });

  it('backfill 失速(stalled)は processing にせず bad のまま(詰まりを隠さない=self-verifying)', () => {
    const cells = buildHealthCells({
      livesData: [{ recordedCount: 30, officialCommentCount: 100, officialRatePct: 30 }],
      fastDiag: { content: { giftDiagnostics: { romiDebug: { backfill: { running: false, done: 0, stopReason: 'stalled' } } } } }
    });
    expect(cellById(cells, 'backfill').level).toBe('bad');
    // 失速時は取得率も進行中扱いにしない=通常評価で率30%は bad(本当に取れていない)。
    expect(cellById(cells, 'capture-rate').level).toBe('bad');
  });

  it('backfill 完了(done)後は率を通常評価(完了したのに低ければ warn/bad)', () => {
    const cells = buildHealthCells({
      livesData: [{ recordedCount: 70, officialCommentCount: 100 }],
      fastDiag: { content: { giftDiagnostics: { romiDebug: { backfill: { running: false, done: 1, stopReason: 'reached_start' } } } } }
    });
    expect(cellById(cells, 'backfill').level).toBe('ok'); // 完了=緑。
    expect(cellById(cells, 'capture-rate').level).toBe('warn'); // 70%=完了後は warn(取りこぼし)。
  });

  it('NDGRコメント 0(匿名/取得前)は processing(青)=匿名仕様/取得前を黄にしない', () => {
    const cells = buildHealthCells({
      fastDiag: { content: { giftDiagnostics: { ndgrWireCounters: { decoded: 89, chats: 0 } } } }
    });
    const c = cellById(cells, 'ndgr-chats');
    expect(c.level).toBe('processing');
    expect(c.text).toContain('匿名/取得前');
  });

  it('実機初動相当(backfill中・iframe待ち・匿名0)= bad/warn が1つも出ない(全部緑/青/灰)', () => {
    const cells = buildHealthCells({
      livesData: [{ recordedCount: 116, officialCommentCount: 1555, officialRatePct: 7, lastIngestAgoMs: 1000, paintMs: 40 }],
      fastDiag: { content: {
        networkErrorProbe: { ndgrConnectStatus: 'connected', serviceWorkerInactive: false },
        consoleErrorProbe: { totalCount: 0 },
        giftDiagnostics: {
          romiDebug: { backfill: { running: true, done: 0, stopReason: '' }, interceptMapSize: 23 },
          commentObservability: { savedCommentsUidStats: { totalSaved: 116, withUidPercent: 100 } },
          ndgrWireCounters: { decoded: 89, chats: 0 },
          interceptAvatarSize: 17,
          '北極星レーン': {
            '4_番組累計ポイント': { state: 'ok' }, '1_貢献度ランキング': { state: 'ok', apiRows: 2 },
            '+α_広告ランキング': { state: 'ok', apiRows: 4 }, '2_ギフト履歴': { state: 'iframe_unrendered' },
            '3_イベント累計スコア': { state: 'no_event' }, '5_イベント現在順位': { state: 'no_event' }
          }
        }
      } }
    });
    // 「配信を見た瞬間」= 黄も赤も出ない(進行中は青・対象外は灰)。
    expect(cells.some((c) => c.level === 'bad')).toBe(false);
    expect(cells.some((c) => c.level === 'warn')).toBe(false);
    // 進行中セルは確かに青(processing)で出ている。
    expect(cellById(cells, 'backfill').level).toBe('processing');
    expect(cellById(cells, 'capture-rate').level).toBe('processing');
    expect(cellById(cells, 'ndgr-chats').level).toBe('processing');
    expect(cellById(cells, 'ns-gift-hist').level).toBe('processing');
  });
});
