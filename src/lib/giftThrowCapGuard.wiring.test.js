import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 「ギフト検知N→演出N-k」の差分診断における同時投擲上限(GIFT_THROW_MAX_CONCURRENT)超過の
 * 内訳計上(giftThrowCapGuarded/adThrowCapGuarded)の「配線忘れ=CI赤」ガード。
 *
 * 背景: 実配信の状態速報で「検知24→演出21」が⚠3件飛んでいないと誤診断されていたが、
 * 真因はcanLaunchGiftThrow(同時投擲上限8件)超過による性能ガード(正常動作)だった。
 * giftEffectDiag.js側の純関数(diffCounts等)は修正済みでも、venueBar.js側でこの内訳を
 * 実際にインクリメントしなければ計器は永久に0のまま=取りこぼしと誤診断され続ける。
 *
 * ★実行時 DOM 不要・純 Node(fs 読み)。venueBar.js は content script で vitest から
 *   import できないため、ソース文字列スキャンで配線の実在を断言する
 *   (venueLaneParity.wiring.test.js と同型)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const venueBarSrc = read('src/extension/venueBar.js');
const giftEffectDiagSrc = read('src/lib/giftEffectDiag.js');

describe('同時投擲上限超過の内訳計上(配線忘れ=CI赤)', () => {
  it('launchGiftThrowの上限超過分岐でgiftThrowCapGuarded/adThrowCapGuardedをインクリメントしている', () => {
    const begin = venueBarSrc.indexOf('const launchGiftThrow = ');
    expect(begin).toBeGreaterThanOrEqual(0);
    const end = venueBarSrc.indexOf('canLaunchGiftThrow(giftProjActive)', begin);
    const block = venueBarSrc.slice(begin, end + 700);
    expect(block).toMatch(/_giftEffectDiagCounters\.giftThrowCapGuarded \+= 1/);
    expect(block).toMatch(/_giftEffectDiagCounters\.adThrowCapGuarded \+= 1/);
    expect(block).toMatch(/proj\.kind === 'ad'/);
  });

  it('上限超過分岐でもpublishGiftEffectDiagを呼び、状態速報へ即時反映する', () => {
    const begin = venueBarSrc.indexOf('const launchGiftThrow = ');
    const capBranchEnd = venueBarSrc.indexOf('return false; // 上限超過は捨てる', begin);
    const block = venueBarSrc.slice(begin, capBranchEnd + 100);
    expect(block).toMatch(/publishGiftEffectDiag\(\)/);
  });

  it('giftEffectDiag.jsのdiffCountsがthrowExplained引数を受け取りthrowMissingから減算している', () => {
    expect(giftEffectDiagSrc).toMatch(/function diffCounts\([^)]*throwExplained\s*=\s*0\)/);
    expect(giftEffectDiagSrc).toMatch(/throwMissing:\s*Math\.max\(0,\s*detected\s*-\s*thrown\s*-\s*Math\.max\(0,\s*throwExplained\)\)/);
  });

  it('buildGiftEffectDiagLinesがギフト/広告両方でgiftThrowCapGuarded/adThrowCapGuardedをdiffCountsへ渡している', () => {
    expect(giftEffectDiagSrc).toMatch(/diffCounts\(giftDetected,\s*giftThrown,\s*giftSoundPlayed,\s*giftSoundCoalesced,\s*soundExplained,\s*giftThrowCapGuarded\)/);
    expect(giftEffectDiagSrc).toMatch(/diffCounts\(adDetected,\s*adThrown,\s*adSoundPlayed,\s*0,\s*0,\s*adThrowCapGuarded\)/);
  });

  it('giftEffectDiagToActionCardsのcheck呼び出しもthrowExplainedを渡している(致命カードの誤検知防止)', () => {
    expect(giftEffectDiagSrc).toMatch(/Number\(snap\.giftThrowCapGuarded\)\s*\|\|\s*0/);
    expect(giftEffectDiagSrc).toMatch(/Number\(snap\.adThrowCapGuarded\)\s*\|\|\s*0/);
  });

  it('makeInitialGiftEffectDiagがgiftThrowCapGuarded/adThrowCapGuardedを初期化している(whitelist落ち防止)', () => {
    const begin = giftEffectDiagSrc.indexOf('export function makeInitialGiftEffectDiag()');
    const end = giftEffectDiagSrc.indexOf('}', giftEffectDiagSrc.indexOf('return {', begin));
    const block = giftEffectDiagSrc.slice(begin, end);
    expect(block).toMatch(/giftThrowCapGuarded:\s*0/);
    expect(block).toMatch(/adThrowCapGuarded:\s*0/);
  });

  it('buildGiftEffectDiagSnapshotがgiftThrowCapGuarded/adThrowCapGuardedを通す(whitelist落ち防止)', () => {
    const begin = giftEffectDiagSrc.indexOf('export function buildGiftEffectDiagSnapshot(');
    const end = giftEffectDiagSrc.indexOf('capturedAt: now', begin);
    const block = giftEffectDiagSrc.slice(begin, end);
    expect(block).toMatch(/giftThrowCapGuarded:\s*num\(d\.giftThrowCapGuarded/);
    expect(block).toMatch(/adThrowCapGuarded:\s*num\(d\.adThrowCapGuarded/);
  });
});
