import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const popupSrc = fs.readFileSync(path.join(here, 'popup-entry.js'), 'utf8');

/**
 * v0.1.1248(2026-08-04): refresh() の自己フィードバックループを断つ配線の断言。
 *
 * 実測: 1コメントあたり77回の描き直し(3分で描画+2013回=毎秒11回)。
 * 真因: refresh() → 診断/鏡キーを storage.set → onChanged →
 *   それらが高頻度キー判定に該当しない → 450ms throttle を完全バイパス →
 *   即時 refresh() → …(ループが閉じる)
 *
 * ★過去10回のちらつき修正(v0.1.618/622/1037/1038/1039/1125/1128/1135/1170/1179)は
 *   全部「描画される側」への対処で、10回とも再発した。ここは【呼ぶ側】を断つ。
 *   その配線が将来外れても気づけるよう、ソース文字列で固定する
 *   ([[fastdiag-lite-is-the-printer-subset]] と同型の穴を作らない)。
 */
describe('repaint loop guard wiring (popup-entry.js)', () => {
  it('自己書き込みキー判定を import している', () => {
    const importLine = popupSrc
      .split(/\r?\n/)
      .find((l) => l.includes('from') && l.includes('selfWrittenStorageKeys.js'));
    expect(importLine).toBeTruthy();
    expect(importLine).toContain('isAllSelfWrittenRenderArtifacts');
    expect(importLine).toContain('stripSelfWrittenRenderArtifacts');
  });

  it('【中核】自己書き込みキーだけの変更なら早期returnしてループを断つ', () => {
    const idx = popupSrc.indexOf('function scheduleCoalescedStorageRefresh(');
    expect(idx).toBeGreaterThanOrEqual(0);
    const body = popupSrc.slice(idx, idx + 1800);
    // 無条件に実行される if 文であること(`if (false)` 前置等の変異を弾く)。
    expect(body).toMatch(/\n\s*if \(isAllSelfWrittenRenderArtifacts\(keys\)\) \{/);
    // 早期 return していること(判定だけして素通りしていたら意味がない)。
    const guardIdx = body.indexOf('if (isAllSelfWrittenRenderArtifacts(keys)) {');
    const afterGuard = body.slice(guardIdx, guardIdx + 200);
    expect(afterGuard).toContain('return;');
  });

  it('高頻度判定は自己書き込みキーを除いてから行う(混在でthrottleを失う穴を塞ぐ)', () => {
    const idx = popupSrc.indexOf('function scheduleCoalescedStorageRefresh(');
    const body = popupSrc.slice(idx, idx + 1800);
    expect(body).toMatch(/const keysForFreq = stripSelfWrittenRenderArtifacts\(keys\);/);
    // every() の対象が生の keys ではなく keysForFreq であること(ここが穴だった)。
    expect(body).toMatch(/keysForFreq\.every\(/);
    expect(body).not.toMatch(/const allHighFreq = keys\.every\(/);
  });

  it('理由別内訳が診断payloadへ渡っている(渡さないと速報に永久に出ない)', () => {
    expect(popupSrc).toMatch(/\n\s*repaintReasons: _repaintReasonCounts,/);
  });

  it('主要な自動経路に引き金タグが立っている(犯人を名指しするため)', () => {
    for (const tag of ['storage_changed', 'interval_poll', 'visibility_resume', 'cdb_summary_push']) {
      expect(popupSrc).toContain(`tagRefreshReason('${tag}')`);
    }
    // paint 実行時にタグが計上されること。
    expect(popupSrc).toMatch(/noteRepaintReason\(_refreshReasonTag \|\| 'unknown'\);/);
  });
});
