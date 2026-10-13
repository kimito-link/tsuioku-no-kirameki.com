import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildVenueSeatsDiagSnapshot } from './venueSeatsDiag.js';
import { buildAiShareFullText } from './aiShareFullText.js';
import { createVenueTileCountState, observeVenueTileCount, toVenueTileCountDiag } from './venueTileCountCensus.js';

/**
 * 2026-10-13(ユーザー報告「会場が出たり消えたりする。途中で減るのはだめ」): 会場のタイル数の増減の計器の配線。
 *   venueBar(毎描画で観測) → venueSeatsDiag(個別列挙で通す) → 状態速報(aiShareFullText の1行)。
 *   ★この3か所のどれかを落とすと、計器は動いているのに状態速報へ出ない([[fastdiag-lite-is-the-printer-subset]] の同型)。
 */
const read = (p) => fs.readFileSync(path.resolve(p), 'utf8').split('\r\n').join('\n');
const venue = read('src/extension/venueBar.js');

describe('venueBar: 毎描画で観測し、診断へ載せる', () => {
  it('★供給元のラベルを composeVenueBaseRows が決める(鏡/古い鏡/fallback+理由)', () => {
    expect(venue).toMatch(/_venueTileOrigin = `fallback:\$\{usable\.reason \|\| '\?'\}`;/);
    expect(venue).toMatch(/_venueTileOrigin = staleButUsable \? 'mirror-stale' : 'mirror';/);
  });

  it('★visibleLaneItems 確定直後(noteVenueFirstPaint の隣)で毎描画サンプルする', () => {
    const a = venue.indexOf('noteVenueFirstPaint(_openLatency, Date.now(), visibleLaneItems.length)');
    const b = venue.indexOf('observeVenueTileCount(_tileCountCensus, {');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeLessThan(900); // 隣にある(別の場所へ離れていない)
    const body = venue.slice(b, b + 400);
    expect(body).toMatch(/tiles: visibleLaneItems\.length,/);
    expect(body).toMatch(/origin: _venueTileOrigin,/);
  });

  it('★3秒間引き(diagDue)の内側に置いていない(過渡的な減少も累計に残す)', () => {
    const b = venue.indexOf('observeVenueTileCount(_tileCountCensus, {');
    const dueAt = venue.indexOf('const diagDue = nowMs() - _venueSeatsDiagLastWriteAt >= 3000;');
    expect(dueAt).toBeGreaterThan(b); // 観測は diagDue の判定より前(=その条件に縛られない)
  });

  it('★snapshot(seatsDiagObs)へ載せている', () => {
    expect(venue).toMatch(/tileCountCensus: toVenueTileCountDiag\(_tileCountCensus, Date\.now\(\)\),/);
  });

  it('★close では消さない(再オープン直後に減るのも利用者には「減った」)', () => {
    const i = venue.indexOf('const resetSpeechTracking');
    expect(i).toBeGreaterThan(0);
    const body = venue.slice(i, i + 1600);
    expect(body).not.toMatch(/_tileCountCensus/);
  });
});

describe('診断の通し(個別列挙で落ちない)と状態速報の1行', () => {
  const census = () => {
    const st = createVenueTileCountState();
    observeVenueTileCount(st, { liveId: 'lv1', tiles: 90, origin: 'mirror', nowMs: 1_000_000 });
    observeVenueTileCount(st, { liveId: 'lv1', tiles: 45, origin: 'fallback:staleHard', nowMs: 1_010_000 });
    return toVenueTileCountDiag(st, 1_020_000);
  };

  it('★venueSeatsDiag を通っても、減った回数・最大の脱落・原因が落ちない', () => {
    const snap = buildVenueSeatsDiagSnapshot({ enabled: true, liveId: 'lv1', tileCountCensus: census() }, 2_000_000);
    expect(snap.tileCountCensus).toMatchObject({
      verdict: 'warn',
      drops: 1,
      worstDrop: 45,
      worstFrom: 90,
      worstTo: 45,
      worstCause: 'mirror→fallback:staleHard',
      last: 45,
      max: 90
    });
    expect(snap.tileCountCensus?.line).toContain('★減った1回');
  });

  it('★未観測(null)は null のまま通る(古い版が書いた診断でも落ちない)', () => {
    const snap = buildVenueSeatsDiagSnapshot({ enabled: true, liveId: 'lv1' }, 2_000_000);
    expect(snap.tileCountCensus).toBeNull();
  });

  const build = (tileCountCensus) =>
    buildAiShareFullText({
      overviewText: '',
      livesData: [],
      fastDiag: null,
      popupDiag: null,
      voiceDiag: null,
      venueSeatsDiag: buildVenueSeatsDiagSnapshot({ enabled: true, liveId: 'lv1', tileCountCensus }, Date.now()),
      currentLiveId: 'lv1'
    });

  it('★状態速報の本文に「会場の人数」の行が出る(概要ブロックの外=配信が無くても)', () => {
    const text = build(census());
    expect(text).toContain('会場の人数 🔴');
    expect(text).toContain('mirror→fallback:staleHard');
  });

  it('★未観測なら行ごと出ない(普段の速報を汚さない)', () => {
    expect(build(undefined)).not.toContain('会場の人数');
  });
});
