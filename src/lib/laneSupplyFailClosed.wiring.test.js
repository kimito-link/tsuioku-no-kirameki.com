import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const popupSrc = fs.readFileSync(path.join(root, 'extension/popup-entry.js'), 'utf8');
const shareSrc = fs.readFileSync(path.join(here, 'aiShareFullText.js'), 'utf8');

/**
 * v0.1.1249(2026-08-04): provisional 既定値の fail-closed 化と供給元計器の配線断言。
 *
 * ★背景: lane-tiles-vanish-SPEC.md Patch 4 は 2026-08-02 に設計されたが**出荷されなかった**。
 *   その2日後、実配信で provisional-false による縮小ガード素通りを再観測した。
 *   同じ「設計したのに配線されず忘れられる」事故を防ぐため、ソース文字列で固定する。
 */
describe('lane supply fail-closed wiring', () => {
  it('★中核: provisional 既定値が fail-closed(無指定=暫定)である', () => {
    // 無条件に実行される代入文であること。
    expect(popupSrc).toMatch(
      /\n\s*STORY_SOURCE_STATE\.entriesProvisional = !\(opts && opts\.provisional === false\);/
    );
    // 旧 fail-open 実装が復活していないこと(これが2026-08-02に見送られた形)。
    expect(popupSrc).not.toMatch(
      /STORY_SOURCE_STATE\.entriesProvisional = opts && opts\.provisional === true;/
    );
  });

  it('供給元計器を import して state を作っている', () => {
    expect(popupSrc).toContain("from '../lib/laneSupplyOriginDiag.js'");
    expect(popupSrc).toMatch(/const _laneSupplyOriginDiag = createLaneSupplyOriginDiag\(\);/);
  });

  it('★全ての供給書き込みが origin タグ付きで計器に記録される', () => {
    expect(popupSrc).toMatch(/\n\s*noteLaneSupplyWrite\(_laneSupplyOriginDiag, \{/);
    // 申告漏れ検出は hasOwnProperty で判定すること(値の真偽では検出できない)。
    expect(popupSrc).toContain("Object.prototype.hasOwnProperty.call(opts, 'provisional')");
    expect(popupSrc).toMatch(/defaulted: !_provDeclared/);
  });

  it('★リセット3経路は「確定」を明示している(既定反転の巻き添えを防ぐ)', () => {
    // 意図的に空にする場面まで暫定にすると、空リセットが効かなくなる。
    const resets = popupSrc.match(
      /syncStorySourceEntries\('', \[\], null, \{ provisional: false, origin: LANE_SUPPLY_ORIGIN\.RESET_NO_WATCH \}\);/g
    );
    expect(resets?.length).toBe(3);
    // タグ無しの素のリセット呼び出しが残っていないこと。
    expect(popupSrc).not.toMatch(/syncStorySourceEntries\('', \[\]\);/);
  });

  it('本線・軽量・fallback の3経路に origin が付いている', () => {
    expect(popupSrc).toContain('origin: LANE_SUPPLY_ORIGIN.HEAVY');
    expect(popupSrc).toContain('origin: LANE_SUPPLY_ORIGIN.LIGHT');
    expect(popupSrc).toContain('origin: LANE_SUPPLY_ORIGIN.FALLBACK');
  });

  it('★現行犯記録: 無条件に呼び、判定に必要な3値を渡している', () => {
    // 「記録すべきか」の判定は laneSupplyOriginDiag 側の責務(純関数テストで担保)。
    // ここでは (1)無条件に呼ばれる文であること (2)guardHit を渡すこと を固定する。
    // ★guardHit を渡し忘れると、ガードが守った瞬間まで「減った」と誤記録される。
    expect(popupSrc).toMatch(
      /\n\s*noteLaneSupplyShrink\(_laneSupplyOriginDiag,\n\s*\{ prevTiles: countStoryUserLaneDomTiles\(els\), nextTiles: nextTileCount, guardHit: _shrinkGuardHit \}\);/
    );
  });

  it('診断payloadと状態速報の両方に通っている(どちらか欠けると永久に出ない)', () => {
    expect(popupSrc).toMatch(/\n\s*laneSupplyOrigin: snapshotLaneSupplyOriginDiag\(_laneSupplyOriginDiag\),/);
    expect(shareSrc).toContain('laneSupplyOrigin?.line');
    expect(shareSrc).toMatch(/if \(supplyLine\) \{ lines\.push\(supplyLine\);/);
  });
});
