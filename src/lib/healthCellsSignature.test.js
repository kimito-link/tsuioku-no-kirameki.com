/**
 * healthCellsSignature.test.js — 診断パネルの再描画が【時刻で暴発しない】ことを固定する。
 *
 * ★なぜ要るか(2026-08-16 実機「診断タブが重すぎて開かない」の真因)
 *   v0.1.1403〜1408 で 53→100 セルに増やした際、「◯秒前」「◯分経過」のような
 *   **時刻由来の文字列**を text に持つセルを多数足した。
 *   status-entry の diff-skip 署名は text をそのまま含んでいたため、
 *   **中身が何も変わっていなくても毎tick 署名が変わり**、
 *   19枠×100セル(約500 DOMノード)を2秒ごとに全再構築していた。
 *
 * ★ここでは status-entry.js の署名【式】そのものをテストできないので、
 *   同じ式を再現して「時間だけが進んだとき署名が変わらない」ことを固定する。
 *   ★式を変えたらこのテストも一緒に直すこと(healthCells の出力契約の一部)。
 */
import { describe, it, expect } from 'vitest';
import { buildHealthCells } from './healthCells.js';

/**
 * status-entry.js:2320 と同じ署名式(セル部分のみ)。
 * ★level と数値だけ。text は含めない(時刻が混ざるため)。
 * @param {Array<any>} cells
 */
function cellsSignature(cells) {
  return cells.map((c) => `${c.id}:${c.level}:${c.kind === 'pct' ? c.value : ''}`).join('~');
}

/** 時刻由来の値を持つ入力(レーン最終描画・起動段階・外部API・取得中)。 */
function inputAt(nowMs, ageBaseMs) {
  return {
    nowMs,
    livesData: [{ recording: true, liveId: 'lv1', recordedCount: 10, officialCommentCount: 100 }],
    liveElapsedMs: 30 * 60 * 1000 + ageBaseMs,
    popupDiag: { popup: {
      laneTickProbe: { ticks: 10, runs: 7, lastRunAgoMs: 200_000 + ageBaseMs },
      lanePublishSkip: { noEls: 1, entriesEmpty: 0, lastPublishAgoSec: 3 + ageBaseMs / 1000 },
      loadShadeProbe: {
        shadeAgeMs: 2500, shadePresent: true, dismissCalls: 2,
        lastLoadPhase: { phase: 'awaiting-first-paint', agoMs: 8000 + ageBaseMs }
      }
    } },
    fastDiag: { content: { giftDiagnostics: {
      '北極星レーン': { '2_ギフト履歴': { state: 'iframe_unrendered', foundCountLifetime: 0 } },
      externalFetchProbe: {
        intervalTicks: 20, leaderRan: 15, kokenSent: 10, kokenLastOk: true,
        kokenLastStatus: 200, kokenLastRows: 5, kokenLastAgoMs: 4000 + ageBaseMs
      }
    } } }
  };
}

describe('診断パネルの再描画署名', () => {
  it('★時間だけが進んでも署名は変わらない(2秒ごとの全再構築を止める)', () => {
    const t0 = 1_000_000;
    const a = buildHealthCells(inputAt(t0, 0));
    // 10秒経過。中身(level)は同じで、経過時間の表示だけが動く。
    const b = buildHealthCells(inputAt(t0 + 10_000, 10_000));

    // 表示テキストは変わってよい(秒数が進むので)
    const textA = a.map((c) => c.text).join('|');
    const textB = b.map((c) => c.text).join('|');
    expect(textA).not.toBe(textB);

    // ★署名は変わらない=再描画しない
    expect(cellsSignature(b)).toBe(cellsSignature(a));
  });

  it('★level が変われば署名も変わる(異常の見落としを作らない)', () => {
    const t0 = 1_000_000;
    const normal = buildHealthCells(inputAt(t0, 0));

    // 外部APIがエラーになった=level が ok → bad へ
    const broken = inputAt(t0, 0);
    broken.fastDiag.content.giftDiagnostics.externalFetchProbe.kokenLastError = 'network';
    const after = buildHealthCells(broken);

    expect(cellsSignature(after)).not.toBe(cellsSignature(normal));
  });

  it('★セルが増減すれば署名も変わる', () => {
    const t0 = 1_000_000;
    const a = buildHealthCells(inputAt(t0, 0));
    const withVoice = inputAt(t0, 0);
    withVoice.voiceDiag = { enabled: true, spokenTotal: 5, queueMax: 10, effectiveQueueMax: 10 };
    const b = buildHealthCells(withVoice);
    expect(cellsSignature(b)).not.toBe(cellsSignature(a));
  });
});
