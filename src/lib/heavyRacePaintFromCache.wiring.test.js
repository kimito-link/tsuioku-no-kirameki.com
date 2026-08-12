// heavyRacePaintFromCache.wiring.test.js
// ★「158件あるのに18件しか描けない」race固着の根治を固定する。
//
// ■ 実機(2026-08-12・複数配信で再現)
//     heavyRaceReturns: 46 / heavyEverSettled: false
//     heavyReuseLastReason: "coverage"   ← 再利用は成立している
//     domTilesPainted: 18 / entriesLen: 147 / mirrorCells: 158
//   会場は①の鏡なので、会場も18件になる(ユーザー報告「会場モードがりんくしかない」)。
//
// ■ 真因
//   再利用時の heavyDataPromise は `Promise.resolve(cachedHeavy.arr)`。解決済みでも
//   .then() は次のマイクロタスクで走る。その間に storage 変更で refresh() が走ると
//   refreshGen が進み、世代チェックで【必ず】bail する。
//   ＝「次の refresh が settled で始まれる」という自己修復の前提が、450msごとに
//   refresh が来る配信では**永久に満たされない**。
//
// ■ 直し
//   【手元に全件がある】なら世代が進んでいても描く。世代チェックの目的は
//   「別配信の古い結果で上書きしない」ことで、それは snapshotKey が既に担保している。
//   ★実読みの遅い結果は従来どおり bail する(古い読みで新しい画面を上書きしない)。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildStoryUserLaneRenderDiag,
  formatStoryUserLaneRenderDiagLines
} from './storyUserLaneRenderProbe.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const src = readFileSync(path.join(REPO, 'src', 'extension', 'popup-entry.js'), 'utf8');

/** 世代チェックの分岐だけを切り出す(他の refreshGen 比較を誤検出しないため)。 */
function raceBranch() {
  const i = src.indexOf('const bailHeavy = (state) =>');
  expect(i).toBeGreaterThan(0);
  return src.slice(i, i + 3000);
}

describe('★race固着の根治(手元に全件があれば世代が進んでも描く)', () => {
  const block = raceBranch();

  // ★条件式だけを固定する(1行/ブロックの書き方には依存させない=整形で赤くならないように)。
  const GUARD = 'if (!(canReuseHeavyChunkRead && nextArr.length > 0))';

  it('再利用かつ件数>0 のときだけ bail をやめる', () => {
    expect(block).toContain(GUARD);
  });

  it('★実読みの遅い結果は従来どおり bail する(古い読みで新しい画面を上書きしない)', () => {
    // 条件を満たさない場合に RACE で抜ける経路が残っていること。
    const guardIdx = block.indexOf(GUARD);
    expect(guardIdx).toBeGreaterThan(-1);
    const after = block.slice(guardIdx, guardIdx + 200);
    expect(after).toContain('STORY_USER_LANE_HEAVY_SETTLE.RACE');
  });

  it('★別配信の混入は snapshotKey が先に弾く(世代チェックを緩めても安全な根拠)', () => {
    const before = block.slice(0, block.indexOf('refreshGen !== watchPopupRefreshGeneration'));
    expect(before).toContain('heavyResultStillTargetsThisWatch');
    expect(before).toContain('STALE_SNAPSHOT');
  });

  it('効いた回数を数える(実機で発動しているかの証拠を残す)', () => {
    expect(block).toContain('_heavyRacePaintedFromCacheCount += 1');
    expect(src).toContain('let _heavyRacePaintedFromCacheCount = 0;');
  });

  it('★その回数が診断スナップショットに載る(画面止まりにしない)', () => {
    expect(src).toContain('snap.heavyRacePaintedFromCache = _heavyRacePaintedFromCacheCount');
  });
});

describe('★通し: 回数が速報の行まで届く', () => {
  const base = {
    activePath: 'heavy', started: 5, completed: 5, entriesLen: 147,
    domTilesPainted: 158, lastReachedStep: 'done'
  };

  it('★buildStoryUserLaneRenderDiag が値を落とさない(個別列挙の穴)', () => {
    const d = buildStoryUserLaneRenderDiag({ ...base, heavyRacePaintedFromCache: 7 });
    expect(d.heavyRacePaintedFromCache).toBe(7);
  });

  it('発動していれば行が出る', () => {
    const d = buildStoryUserLaneRenderDiag({ ...base, heavyRacePaintedFromCache: 7 });
    const text = formatStoryUserLaneRenderDiagLines(d).join('\n');
    expect(text).toContain('手元の全件で描いた');
    expect(text).toContain('7回');
  });

  it('0回なら行を出さない(正常時のノイズにしない)', () => {
    const d = buildStoryUserLaneRenderDiag({ ...base, heavyRacePaintedFromCache: 0 });
    const text = formatStoryUserLaneRenderDiagLines(d).join('\n');
    expect(text).not.toContain('手元の全件で描いた');
  });

  it('旧形式(フィールド無し)でも落ちない', () => {
    const d = buildStoryUserLaneRenderDiag({ ...base });
    expect(d.heavyRacePaintedFromCache).toBe(0);
    expect(() => formatStoryUserLaneRenderDiagLines(d)).not.toThrow();
  });
});
