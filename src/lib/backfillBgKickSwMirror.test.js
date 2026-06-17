import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKFILL_HEARTBEAT_KEY_PREFIX,
  BACKFILL_HEARTBEAT_MIN_GAP,
  BACKFILL_HEARTBEAT_STALE_MS,
  KEY_BACKFILL_BG_KICK_ENABLED,
  KEY_BACKFILL_HEARTBEAT_INDEX
} from './backfillHeartbeat.js';

/**
 * v0.1.795: background.js(手書きクラシック SW・ESM import 不可)は backfillHeartbeat.js の
 * キー式/しきい値をミラーで持つ。lib を正本とし、SW 側がズレたらここで検知する
 * (commentDb.test.js / kokenContributionRankingApi のミラー drift 検知と同じ思想)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backgroundSrc = readFileSync(
  path.join(repoRoot, 'extension', 'background.js'),
  'utf8'
);
const reminder =
  'background.js は ESM import 不可の手書き SW。lib(src/lib/backfillHeartbeat.js)に合わせて直すこと';

describe('background.js の背面 backfill kick ミラー(drift 検知)', () => {
  it('ハートビートのキー式/しきい値リテラルが lib と一致する', () => {
    expect(backgroundSrc.includes(`'${BACKFILL_HEARTBEAT_KEY_PREFIX}'`), reminder).toBe(true);
    expect(backgroundSrc.includes(`'${KEY_BACKFILL_HEARTBEAT_INDEX}'`), reminder).toBe(true);
    expect(backgroundSrc.includes(`'${KEY_BACKFILL_BG_KICK_ENABLED}'`), reminder).toBe(true);
    // STALE_MS / MIN_GAP は式そのものをミラー(6 * 60 * 1000 / 30)。値も一致を確認。
    expect(BACKFILL_HEARTBEAT_STALE_MS).toBe(6 * 60 * 1000);
    expect(backgroundSrc.includes('6 * 60 * 1000'), reminder).toBe(true);
    expect(BACKFILL_HEARTBEAT_MIN_GAP).toBe(30);
    expect(backgroundSrc.includes('BACKFILL_HEARTBEAT_MIN_GAP = 30'), reminder).toBe(true);
  });

  it('alarm 名と onAlarm 分岐・kick tick が配線されている', () => {
    expect(backgroundSrc.includes("'nls_backfill_bg_kick'"), reminder).toBe(true);
    expect(backgroundSrc.includes('ensureBackfillBgKickAlarm'), reminder).toBe(true);
    expect(backgroundSrc.includes('runBackfillBgKickTick'), reminder).toBe(true);
    // SW crawl エンジンの公開グローバルを呼ぶ(IIFE から self へ出した API)。
    expect(backgroundSrc.includes('__nlsSwBackfill'), reminder).toBe(true);
  });

  it('v0.1.798: ローカル診断ダンプ(Claude Code が Read する固定パス)が配線されている', () => {
    // 司令塔がブラウザ無しで状態を読む正本。パスが変わると Read 先がズレるので固定を担保。
    expect(backgroundSrc.includes("'nicolivelog-mcp/status-latest.json'"), reminder).toBe(true);
    expect(backgroundSrc.includes("'nls_mcp_diag_dump'"), reminder).toBe(true);
    expect(backgroundSrc.includes('runMcpDiagDumpTick'), reminder).toBe(true);
    expect(backgroundSrc.includes('ensureMcpDiagDumpAlarm'), reminder).toBe(true);
    // fastDiag の1キーだけ読む(全件走査しない=記録を圧迫しない)。
    expect(backgroundSrc.includes("'nls_ai_share_fast_diag_v1'"), reminder).toBe(true);
  });

  it('kick tick は get(null) 全件走査でなく索引→該当 hb だけ get している(stall 回避)', () => {
    expect(backgroundSrc.includes('KEY_BACKFILL_HEARTBEAT_INDEX'), reminder).toBe(true);
    // runBackfillBgKickTick の関数本体だけを抜き出して get(null) を含まないことを確認。
    //   (別関数 migrateClearStaleSelfPostedOnce は get(null) を使うため全文検査は不可)
    const startIdx = backgroundSrc.indexOf('async function runBackfillBgKickTick');
    expect(startIdx, '関数 runBackfillBgKickTick が見つからない').toBeGreaterThan(-1);
    // 次の async function 宣言までを関数本体の近似範囲とする。
    const after = backgroundSrc.slice(startIdx + 1);
    const nextFnRel = after.indexOf('\nasync function ');
    const body = nextFnRel > -1 ? after.slice(0, nextFnRel) : after;
    expect(
      body.includes('chrome.storage.local.get(null)'),
      'runBackfillBgKickTick は get(null) を使わない(索引経由で stall を避ける)'
    ).toBe(false);
  });
});
