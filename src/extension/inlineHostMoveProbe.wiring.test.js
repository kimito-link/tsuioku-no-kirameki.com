import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * v0.1.1124 D-1計器(host移設観測)の「配線忘れ=CI赤」ガード。
 *   content-entry.js は content script で vitest から import できないため、ソース文字列スキャンで
 *   「移設6箇所すべての直前に noteInlineHostMove がある」「fastDiag に hostMoveDiag が載る」を断言する。
 *   1箇所でも計器の無い移設経路が残ると、実測で reloadCount=0 なのにちかちかが続く=嘘の白、になるため。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/content-entry.js'), 'utf8');

describe('inlineHostMoveProbe(v0.1.1124)の配線', () => {
  it('移設7経路+盲点2経路すべてに計器がある(理由ラベル網羅)', () => {
    for (const reason of [
      'anchored_video',
      'anchored_video_fallback_body',
      'nonvideo_anchor',
      'nonvideo_fallback_body',
      'floating_body',
      'dock_body',
      'prewarm_offscreen',
      // v0.1.1125 盲点計器: dedupe が非primary host を消す瞬間(iframe持ちなら reloadCount 実害)
      'duplicate_host_removed',
      // v0.1.1125 盲点計器: host の新規生成(作り直しループの検知)
      'host_created'
    ]) {
      expect(src).toContain(`noteInlineHostMove('${reason}'`);
    }
  });

  it('★計器の無い移設が残っていない: host移設/削除の各出現の直前5行に計器がある', () => {
    const lines = src.split('\n');
    // popup host の移設だけを対象にする(insertAdjacentElement / body・hostParent への appendChild)。
    //   documentElement.appendChild(host) はトースト等の無関係なローカル host=対象外。
    //   v0.1.1125: dedupe ループの h.remove()(pickPrimaryInlinePopupHostFromDom)も対象に追加。
    //   iframe 持ち host の remove は移設より重い実害(リロードでなく完全破棄)なのに v0.1.1124 計器の
    //   盲点だった。`h.remove()` は content-entry では dedupe ループにしか現れない前提(増えたら計器必須)。
    const movePattern = /insertAdjacentElement\('afterend', host\)|body\.appendChild\(host\)|hostParent\.appendChild\(host\)|\bh\.remove\(\)/;
    const offenders = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (!movePattern.test(lines[i])) continue;
      const windowBefore = lines.slice(Math.max(0, i - 5), i).join('\n');
      if (!windowBefore.includes('noteInlineHostMove(')) offenders.push(i + 1);
    }
    expect(offenders).toEqual([]); // 新しい移設/削除経路を足すときは計器も一緒に(このテストが赤で教える)
  });

  it('fastDiag(AI共有の診断JSON)に hostMoveDiag が載る', () => {
    expect(src).toMatch(/hostMoveDiag: summarizeInlineHostMoveDiag\(_inlineHostMoveState/);
  });

  it('★印字の穴(v0.1.1125): lite ダイジェストが hostMoveDiag/scrollWhiteoutDiag を通す', () => {
    // 状態速報の「診断 JSON (fastDiag)」は full ではなく statusFastDiagLite(~1KB)を印字する。
    //   lite に通っていない計器はユーザーのコピペに永久に出ない(v0.1.1124 の実機で確認した穴)。
    const liteSrc = readFileSync(path.join(repoRoot, 'src/lib/statusFastDiagLite.js'), 'utf8');
    expect(liteSrc).toContain('hostMoveDiag');
    expect(liteSrc).toContain('scrollWhiteoutDiag');
  });

  it('重複host検知(duplicateSeen)が dedupe の冒頭に配線されている', () => {
    expect(src).toMatch(/recordInlineHostDuplicateSeen\(_inlineHostMoveState, hosts\.length\)/);
  });

  it('venueOpen 判定は venueBar.js と同一 literal(文字列契約=driftをCIで止める)', () => {
    const venueBarSrc = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8');
    expect(src).toContain("classList.contains('nlsb-venue-open')");
    expect(venueBarSrc).toContain("classList.toggle('nlsb-venue-open', open)");
  });
});
