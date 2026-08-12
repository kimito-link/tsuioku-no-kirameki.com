// backfillLiveMetricHeartbeat.wiring.test.js
// ★「詰まっているときに限って計器が黙る」を塞いだことを固定する。
//
// ■ 実機で確定したこと(2026-08-12 の状態速報)
//   「⏳ 取り込み中 33%・過去のコメントを取得中」= backfill は走っているのに、
//   状態速報に「⏱ 取得速度(走行中)」の行が【1行も出ていなかった】。
//   status 側は running===1 かつ ts が15秒以内のときだけ出す(嘘の走行中を残さないため)。
//
// ■ 真因
//   計器の更新は `await gen.next()` の【後】にしか無かった。generator の中で
//   待ち(ネットワーク/リトライ/バックオフ)が起きるとループが戻らず、計器が更新されない。
//   → ts が15秒で古くなり行が消える。★ユーザーが一番知りたい「なぜ止まったか」の
//   瞬間に、計器が自分を消していた([[screen-only-info-never-reaches-the-report-2026-08-11]] と同型)。
//
// ■ 直し: generator の歩みと独立した心拍で ts を更新し続ける。
//   値は最後に観測したものを再送する(嘘を足さない)。running:1 のまま止まっている、
//   が速報から読めるようになるのが目的。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  path.resolve(HERE, '../extension/content-entry.js'),
  'utf8'
);

describe('★backfill 計器の心拍(詰まっていても ts を進める)', () => {
  it('心拍間隔の定数がある', () => {
    expect(src).toMatch(/const BACKFILL_LIVE_METRIC_HEARTBEAT_MS = (\d+);/);
  });

  it('★心拍は status の鮮度窓(15秒)より十分短い', () => {
    const m = src.match(/const BACKFILL_LIVE_METRIC_HEARTBEAT_MS = (\d+);/);
    expect(m).toBeTruthy();
    const ms = Number(m[1]);
    // status-entry.js は Date.now() - ts < 15000 のときだけ行を出す。
    // 心拍がこれ以上だと、詰まった瞬間に行が消える(直したはずの症状が復活)。
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(15000 / 2);
  });

  it('setInterval で心拍を回し、running:1 と force:true で publish する', () => {
    // force:true でないと 1Hz の min-gap に弾かれて ts が進まないことがある。
    const block = src.slice(
      src.indexOf('const liveMetricHeartbeat = setInterval('),
      src.indexOf('BACKFILL_LIVE_METRIC_HEARTBEAT_MS);') + 40
    );
    expect(block).toContain('publishBackfillLiveMetric(');
    expect(block).toContain('running: 1');
    expect(block).toContain('force: true');
  });

  it('★心拍は finally で必ず止める(止め忘れると嘘の走行中が残る)', () => {
    expect(src).toContain('clearInterval(_backfillLiveMetricHeartbeatTid)');
    // finally ブロックの中にあること(catch だけだと完走時に止まらない)。
    const finallyIdx = src.indexOf('  } finally {\n    clearTimeout(rotationTid);');
    expect(finallyIdx).toBeGreaterThan(0);
    const clearIdx = src.indexOf('clearInterval(_backfillLiveMetricHeartbeatTid)');
    expect(clearIdx).toBeGreaterThan(finallyIdx);
  });

  it('止めたあとに running:0 で締める(走行終了が速報に反映される)', () => {
    const finallyIdx = src.indexOf('  } finally {\n    clearTimeout(rotationTid);');
    const tail = src.slice(finallyIdx, finallyIdx + 2000);
    expect(tail).toContain('running: 0');
  });

  it('★rAF で心拍を回さない(タブ非表示で止まる=詰まりが見えなくなる)', () => {
    const block = src.slice(
      src.indexOf('const liveMetricHeartbeat = setInterval('),
      src.indexOf('BACKFILL_LIVE_METRIC_HEARTBEAT_MS);') + 40
    );
    expect(block).not.toContain('requestAnimationFrame');
  });
});
