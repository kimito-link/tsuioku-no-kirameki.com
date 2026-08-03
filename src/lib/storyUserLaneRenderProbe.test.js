import { describe, it, expect } from 'vitest';
import {
  STORY_USER_LANE_STEPS,
  STORY_USER_LANE_HEAVY_SETTLE,
  createStoryUserLaneRenderProbe,
  recordStoryUserLaneStep,
  recordStoryUserLaneHeavySettle,
  snapshotStoryUserLaneRenderProbe,
  buildStoryUserLaneRenderDiag,
  formatStoryUserLaneRenderDiagLines,
  storyUserLaneRenderDiagToActionCards,
  detectStoryUserLaneShrink,
  notePaintDecision,
  STORY_USER_LANE_SKIP_REASON
} from './storyUserLaneRenderProbe.js';

const NOW = 1_000_000_000_000;

describe('recordStoryUserLaneStep / snapshot', () => {
  it('start で started++ と lastRunAtBase 記録、done で completed++', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.START, { activePath: 'mirror', nowMs: NOW });
    expect(p.started).toBe(1);
    expect(p.activePath).toBe('mirror');
    expect(p.lastRunAtBase).toBe(NOW);
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.PAINTED, { domTilesPainted: 5 });
    expect(p.domTilesPainted).toBe(5);
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.DONE);
    expect(p.completed).toBe(1);
    expect(p.lastReachedStep).toBe('done');
  });

  it('start で lastError をクリアする', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.START, { error: '前回のエラー' });
    expect(p.lastError).toBe(''); // start は error をクリア
  });

  it('error は 200字に切る', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.PAINTED, { error: 'x'.repeat(500) });
    expect(p.lastError.length).toBe(200);
  });

  it('snapshot は lastRunAgoMs を nowMs から算出', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.START, { nowMs: NOW - 3000 });
    const snap = snapshotStoryUserLaneRenderProbe(p, NOW);
    expect(snap.lastRunAgoMs).toBe(3000);
  });

  it('未実行なら lastRunAgoMs は null', () => {
    const p = createStoryUserLaneRenderProbe();
    const snap = snapshotStoryUserLaneRenderProbe(p, NOW);
    expect(snap.lastRunAgoMs).toBe(null);
  });
});

describe('buildStoryUserLaneRenderDiag', () => {
  it('probe が無ければ present:false', () => {
    expect(buildStoryUserLaneRenderDiag(null)).toEqual({ present: false });
  });

  it('(A) 鏡が空＝empty_source（正常）', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 1, mirrorCells: 0, domTilesPainted: 0, lastReachedStep: 'mirror-empty'
    });
    expect(d.verdict).toBe('empty_source');
    expect(d.reason).toContain('正常');
  });

  it('(B) 鏡にあるのに画面0件＝source_but_no_dom', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 0, mirrorCells: 5, domTilesPainted: 0, lastReachedStep: 'mirror-empty'
    });
    expect(d.verdict).toBe('source_but_no_dom');
    expect(d.expected).toBe(5);
    expect(d.reason).toContain('供給5件');
  });

  it('(C) heavy 経路で entries が空', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'heavy', started: 1, completed: 0, entriesLen: 0, domTilesPainted: 0, lastReachedStep: 'entries-empty-return'
    });
    expect(d.verdict).toBe('empty_source'); // 供給0＝正常扱い（=heavy未完走で entries 空。カード側で既知地雷を説明）
    expect(d.expected).toBe(0);
  });

  it('描画成功＝ok', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 1, mirrorCells: 5, domTilesPainted: 5, lastReachedStep: 'done'
    });
    expect(d.verdict).toBe('ok');
    expect(d.reason).toContain('5件');
  });

  it('一度も描画していない＝not_started', () => {
    const d = buildStoryUserLaneRenderDiag({ activePath: '', started: 0, completed: 0 });
    expect(d.verdict).toBe('not_started');
  });

  it('例外で落ちた＝errored', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 0, mirrorCells: 5, domTilesPainted: 0, lastError: 'boom'
    });
    expect(d.verdict).toBe('errored');
    expect(d.reason).toContain('boom');
  });

  it('描画したが完走していない＝painted_not_completed', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'heavy', started: 1, completed: 0, entriesLen: 10, domTilesPainted: 8, lastReachedStep: 'painted'
    });
    expect(d.verdict).toBe('painted_not_completed');
  });

  // ★v0.1.1006: 匿名主体(userId付き率が極低)の配信は heavy 経路 0 タイルが正常=🔴にしない。
  it('匿名主体(withUidPercent極低)で heavy 0タイル＝empty_source_anonymous(正常・実機lv350860018型)', () => {
    const d = buildStoryUserLaneRenderDiag(
      { activePath: 'heavy', started: 2, completed: 2, entriesLen: 2, domTilesPainted: 0, lastReachedStep: 'done' },
      { withUidPercent: 2.6 }
    );
    expect(d.verdict).toBe('empty_source_anonymous');
    expect(d.reason).toContain('匿名主体');
    expect(d.reason).toContain('仕様');
    // 🔴 症状カードに昇格しない。
    expect(storyUserLaneRenderDiagToActionCards(d).some((c) => c.id === 'story-user-lane-no-dom')).toBe(false);
    // 表示行は ✅(🔴 でない)。
    expect(formatStoryUserLaneRenderDiagLines(d).join('\n')).toContain('✅');
  });

  it('userId付きが一定数ある配信(withUidPercent高)で 0タイルなら従来どおり source_but_no_dom(本物は隠さない)', () => {
    const d = buildStoryUserLaneRenderDiag(
      { activePath: 'heavy', started: 1, completed: 0, entriesLen: 5, domTilesPainted: 0, lastReachedStep: 'done' },
      { withUidPercent: 100 }
    );
    expect(d.verdict).toBe('source_but_no_dom');
  });

  it('withUidPercent 未指定なら従来どおり判定(後方互換=匿名特例を発動しない)', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'heavy', started: 1, completed: 0, entriesLen: 5, domTilesPainted: 0, lastReachedStep: 'done'
    });
    expect(d.verdict).toBe('source_but_no_dom');
  });

  it('heavyRace根治計器(A/B): shrinkKeepCount / heavyFreshReadReuseCount が >0 のとき診断行に出る', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'heavy', started: 3, completed: 3, entriesLen: 300, domTilesPainted: 200, lastReachedStep: 'done',
      shrinkKeepCount: 4, heavyFreshReadReuseCount: 7
    });
    const text = formatStoryUserLaneRenderDiagLines(d).join('\n');
    expect(text).toContain('暫定縮小の上書きを 4 回防御'); // A計器
    expect(text).toContain('fresh-read再利用): 7 回'); // B計器
  });

  it('計器が0なら診断行に出さない(ノイズにしない)', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'heavy', started: 1, completed: 1, entriesLen: 5, domTilesPainted: 5, lastReachedStep: 'done',
      shrinkKeepCount: 0, heavyFreshReadReuseCount: 0
    });
    const text = formatStoryUserLaneRenderDiagLines(d).join('\n');
    expect(text).not.toContain('暫定縮小の上書き');
    expect(text).not.toContain('fresh-read再利用');
  });
});

describe('formatStoryUserLaneRenderDiagLines', () => {
  it('present:false なら空配列', () => {
    expect(formatStoryUserLaneRenderDiagLines({ present: false })).toEqual([]);
  });

  it('source_but_no_dom を1行で見せる', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 0, mirrorCells: 5, domTilesPainted: 0, lastReachedStep: 'mirror-empty'
    });
    const text = formatStoryUserLaneRenderDiagLines(d).join('\n');
    expect(text).toContain('応援レーン描画');
    expect(text).toContain('鏡5件');
    expect(text).toContain('画面0件描画');
    expect(text).toContain('🔴');
  });

  it('描画済みなのにローディング継続を警告', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 1, mirrorCells: 5, domTilesPainted: 5, lastReachedStep: 'done'
    });
    const text = formatStoryUserLaneRenderDiagLines(d, { loadingActive: true }).join('\n');
    expect(text).toContain('ローディング表示が続いています');
  });

  it('ローディング非表示なら overlay 警告を出さない', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 1, mirrorCells: 5, domTilesPainted: 5, lastReachedStep: 'done'
    });
    const text = formatStoryUserLaneRenderDiagLines(d, { loadingActive: false }).join('\n');
    expect(text).not.toContain('ローディング表示が続いています');
  });
});

describe('storyUserLaneRenderDiagToActionCards', () => {
  it('source_but_no_dom で bad カード', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 0, mirrorCells: 5, domTilesPainted: 0, lastReachedStep: 'mirror-empty'
    });
    const cards = storyUserLaneRenderDiagToActionCards(d);
    expect(cards.some((c) => c.id === 'story-user-lane-no-dom' && c.severity === 'bad')).toBe(true);
  });

  it('heavy で entries 0 のとき既知地雷の説明を入れる', () => {
    // entriesLen 0 は empty_source だが、source_but_no_dom にならないので no-dom カードは出ない。
    // 一方、もし供給を heavy で取れているのに画面0なら既知地雷文言が cause に入ることを確認する。
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'heavy', started: 1, completed: 0, entriesLen: 12, domTilesPainted: 0, lastReachedStep: 'painted'
    });
    const cards = storyUserLaneRenderDiagToActionCards(d);
    const card = cards.find((c) => c.id === 'story-user-lane-no-dom');
    expect(card).toBeTruthy();
    expect(card.cause).toContain('早期 return');
  });

  it('errored で bad カード', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 0, mirrorCells: 5, domTilesPainted: 0, lastError: 'boom'
    });
    const cards = storyUserLaneRenderDiagToActionCards(d);
    expect(cards.some((c) => c.id === 'story-user-lane-error')).toBe(true);
  });

  it('描画済みなのにローディング継続で warn カード', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 1, mirrorCells: 5, domTilesPainted: 5, lastReachedStep: 'done'
    });
    const cards = storyUserLaneRenderDiagToActionCards(d, { loadingActive: true });
    expect(cards.some((c) => c.id === 'story-user-lane-loading-stuck')).toBe(true);
  });

  it('正常(ok)ならカードゼロ', () => {
    const d = buildStoryUserLaneRenderDiag({
      activePath: 'mirror', started: 1, completed: 1, mirrorCells: 5, domTilesPainted: 5, lastReachedStep: 'done'
    });
    const cards = storyUserLaneRenderDiagToActionCards(d, { loadingActive: false });
    expect(cards).toEqual([]);
  });

  it('present:false ならカードゼロ', () => {
    expect(storyUserLaneRenderDiagToActionCards({ present: false })).toEqual([]);
  });
});

describe('recordStoryUserLaneHeavySettle(refreshGen レース観測・v0.1.1033)', () => {
  it('settled を記録する', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.SETTLED);
    expect(p.heavySettleState).toBe('settled');
    expect(p.heavyRaceReturns).toBe(0);
  });

  it('race は heavyRaceReturns を累積する(多発=固着の証拠)', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.RACE);
    recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.RACE);
    expect(p.heavySettleState).toBe('race');
    expect(p.heavyRaceReturns).toBe(2);
  });

  it('snapshot / diag に heavySettleState と heavyRaceReturns が乗る', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.START, { activePath: 'heavy', entriesLen: 10, nowMs: NOW });
    recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.RACE);
    const snap = snapshotStoryUserLaneRenderProbe(p, NOW);
    expect(snap.heavySettleState).toBe('race');
    expect(snap.heavyRaceReturns).toBe(1);
    const d = buildStoryUserLaneRenderDiag(snap, {});
    expect(d.heavySettleState).toBe('race');
    expect(d.heavyRaceReturns).toBe(1);
  });

  it('report 行に race の警告文が出る', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.START, { activePath: 'heavy', entriesLen: 10, nowMs: NOW });
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.PAINTED, { domTilesPainted: 4 });
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.DONE);
    recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.RACE);
    const snap = snapshotStoryUserLaneRenderProbe(p, NOW);
    const d = buildStoryUserLaneRenderDiag(snap, {});
    const text = formatStoryUserLaneRenderDiagLines(d, {}).join('\n');
    expect(text).toContain('heavy 完了: ⚠ race');
  });

  /**
   * ★v0.1.1241 実配信 lv351085849 で踏んだ誤警告。
   *
   * heavySettleState は【最後の1回】しか持たないため、5回中4回が race でも
   * 「一度は全件が乗った(settled)」事実が消える。実測では droppedTotal=0 で
   * 誰も消えていないのに「たぬ姉が暫定固着の疑い」と断定していた。
   * 症状(race)から原因(固着)を飛躍して名指しするのは
   * [[instrument-must-name-the-cause-2026-08-01]] 違反。
   * 一度でも settled に到達したかを別に持ち、固着と言い切らない。
   */
  it('一度でも settled に到達したら heavyEverSettled が立つ(最後が race でも消えない)', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.SETTLED);
    recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.RACE);
    expect(p.heavySettleState).toBe('race');
    expect(p.heavyEverSettled).toBe(true);
  });

  it('一度も settled していなければ heavyEverSettled は false のまま', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.RACE);
    recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.RACE);
    expect(p.heavyEverSettled).toBe(false);
  });

  it('settled 済みで最後が race なら「固着の疑い」と断定せず自己修復中と出す', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.START, { activePath: 'heavy', entriesLen: 10, nowMs: NOW });
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.DONE);
    recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.SETTLED);
    recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.RACE);
    const snap = snapshotStoryUserLaneRenderProbe(p, NOW);
    const d = buildStoryUserLaneRenderDiag(snap, {});
    expect(d.heavyEverSettled).toBe(true);
    const text = formatStoryUserLaneRenderDiagLines(d, {}).join('\n');
    expect(text).not.toContain('固着の疑い');
    expect(text).toContain('一度は全件到達');
  });

  it('一度も settled していない race だけが「固着の疑い」を名乗れる', () => {
    const p = createStoryUserLaneRenderProbe();
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.START, { activePath: 'heavy', entriesLen: 10, nowMs: NOW });
    recordStoryUserLaneStep(p, STORY_USER_LANE_STEPS.DONE);
    recordStoryUserLaneHeavySettle(p, STORY_USER_LANE_HEAVY_SETTLE.RACE);
    const snap = snapshotStoryUserLaneRenderProbe(p, NOW);
    const d = buildStoryUserLaneRenderDiag(snap, {});
    const text = formatStoryUserLaneRenderDiagLines(d, {}).join('\n');
    expect(text).toContain('固着の疑い');
  });
});


/**
 * v0.1.1229(会議2026-08-02): 「レーンが出たり消えたり」の真因が
 *   (a)レース頻発 か (b)provisional 未設定でガード素通り かを機械的に切り分ける計器。
 *
 * ★実測 shrinkKeepCount:0 だけでは「縮小していない」と「縮小したがガードが素通りした」を
 *   区別できなかった。そこを分けるのがこの計器の存在意義。
 */
function fakeEls(tileCount) {
  const lane = { childElementCount: tileCount };
  return { laneLink: lane, laneGift: null, laneAd: null, laneKonta: null, laneTanu: null };
}

describe('detectStoryUserLaneShrink — ガードと独立に縮小を測る', () => {
  // ★v0.1.1240 契約変更: 既定 ratio を 0.6 → 1 にしてガードと定義を揃える。
  //   ガードは v0.1.1233 で `next < prev`(1枚でも減ったら守る)になったのに、
  //   計器だけ 0.6 のままだった(仕様に書いたのに実装漏れ)。
  //   その結果、実配信 v0.1.1239 で **誰も消えていない**(消えた人0人/来た人423人/DOM433件)のに
  //   「⚠ 縮小しているのにガードが素通り」という**誤警告**が出た。
  //   計器とガードの「縮小」の定義が違うと、切り分けが永久に詰まる。
  it('1枚でも減れば縮小と判定(ガードと同じ定義)', () => {
    expect(detectStoryUserLaneShrink(fakeEls(100), 99)).toBe(true);
    expect(detectStoryUserLaneShrink(fakeEls(100), 50)).toBe(true);
  });

  it('同数・増加は縮小ではない', () => {
    expect(detectStoryUserLaneShrink(fakeEls(100), 100)).toBe(false);
    expect(detectStoryUserLaneShrink(fakeEls(100), 200)).toBe(false);
  });

  it('ratio を明示すれば従来どおり割合でも測れる(後方互換)', () => {
    expect(detectStoryUserLaneShrink(fakeEls(100), 70, 0.6)).toBe(false);
    expect(detectStoryUserLaneShrink(fakeEls(100), 50, 0.6)).toBe(true);
  });

  it('前回タイル0(初回)は縮小ではない', () => {
    expect(detectStoryUserLaneShrink(fakeEls(0), 0)).toBe(false);
  });

  it('★provisional に依存しない(ガードの発動条件と切り離されている)', () => {
    // detect は els と件数だけを見る=フラグの状態に関係なく縮小を検出できる
    expect(detectStoryUserLaneShrink(fakeEls(100), 10)).toBe(true);
  });

  it('壊れた入力でも例外を投げない', () => {
    expect(detectStoryUserLaneShrink(null, 10)).toBe(false);
    expect(detectStoryUserLaneShrink(undefined, NaN)).toBe(false);
  });
});

describe('notePaintDecision — (a)/(b) の切り分け', () => {
  it('★(b)の形: 縮小しているのに provisional=false → provisional-false として記録', () => {
    const probe = createStoryUserLaneRenderProbe();
    notePaintDecision(probe, {
      els: fakeEls(100), nextTileCount: 10, provisional: false, guardHit: false
    });
    expect(probe.lastPaintSkipReason).toBe(STORY_USER_LANE_SKIP_REASON.PROVISIONAL_FALSE);
    expect(probe.shrinkDetectedCount).toBe(1);
    expect(probe.provisionalFalseCount).toBe(1);
    expect(probe.shrinkKeepCount).toBe(0); // ガードは発動していない
  });

  it('ガードが正しく効いた形: provisional=true で見送り → shrink として記録', () => {
    const probe = createStoryUserLaneRenderProbe();
    notePaintDecision(probe, {
      els: fakeEls(100), nextTileCount: 10, provisional: true, guardHit: true
    });
    expect(probe.lastPaintSkipReason).toBe(STORY_USER_LANE_SKIP_REASON.SHRINK);
    expect(probe.provisionalTrueCount).toBe(1);
  });

  it('★(a)の形: 縮小していないのに描画が少ない → none(=供給側を疑う)', () => {
    const probe = createStoryUserLaneRenderProbe();
    notePaintDecision(probe, {
      els: fakeEls(1), nextTileCount: 1, provisional: false, guardHit: false
    });
    expect(probe.lastPaintSkipReason).toBe(STORY_USER_LANE_SKIP_REASON.NONE);
    expect(probe.shrinkDetectedCount).toBe(0);
  });

  it('理由別に累計される(29回走って1件の内訳が説明できる)', () => {
    const probe = createStoryUserLaneRenderProbe();
    for (let i = 0; i < 3; i += 1) {
      notePaintDecision(probe, { els: fakeEls(100), nextTileCount: 10, provisional: false, guardHit: false });
    }
    expect(probe.paintSkipReasons[STORY_USER_LANE_SKIP_REASON.PROVISIONAL_FALSE]).toBe(3);
  });

  it('★状態速報の行に真因の名指しが出る', () => {
    const probe = createStoryUserLaneRenderProbe();
    notePaintDecision(probe, { els: fakeEls(100), nextTileCount: 10, provisional: false, guardHit: false });
    recordStoryUserLaneStep(probe, STORY_USER_LANE_STEPS.DONE, { domTilesPainted: 10 });
    const snap = snapshotStoryUserLaneRenderProbe(probe, Date.now());
    const diag = buildStoryUserLaneRenderDiag(snap);
    const lines = formatStoryUserLaneRenderDiagLines(diag).join(' | ');
    expect(lines).toContain('描画判断');
    expect(lines).toContain('ガードが素通り');
  });

  it('計器の失敗は描画を止めない(壊れた probe でも例外なし)', () => {
    expect(() => notePaintDecision(null, { els: fakeEls(10), nextTileCount: 1 })).not.toThrow();
  });
});
