import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1708: マーケレポートの分析入力は【全件】。過去配信を読んでいないときは「新規100%」を出さない。
 *
 * 経緯(2026-10-20 調査): marketing-export-entry.js は heavy(2,500件超)のとき commentsForAnalytics を capCommentsForAnalytics で
 *   2,500件の均等サンプルにしていた。コメ速度・沈黙・笑い・疲労・感情曲線・離脱・出席・リーチ係数・人別コメント数などが、
 *   注記なしで縮んだ(1万件なら約0.25倍)。「コメント伝染」(5秒以内に3人以上が同じ文)のような検出系は、サンプルでは成立しなくなる。
 *   さらに heavy では過去配信を読まない(pastBroadcasts=[])ため、classifyCommentersAgainstHistory が全員を「新規」に分類し、
 *   「新規 100%・リピーター 0」が注記なしで出うる。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const entry = read('src/extension/marketing-export-entry.js');
const mch = read('src/lib/marketingChartsHtml.js');

describe('★マーケレポート: 全件で分析し、過去配信を読んでいないときは新規/常連を出さない', () => {
  it('分析入力をサンプルしない(commentsForAnalytics は全件・capCommentsForAnalytics を使わない)', () => {
    expect(entry).toContain('commentsForAnalytics: comments,');
    expect(entry).not.toContain('capCommentsForAnalytics');
    expect(existsSync(path.join(repoRoot, 'src/lib/capCommentsForAnalytics.js'))).toBe(false);
  });

  it('新規 vs 常連は judgeNewVsRepeatBasis(過去配信の枠数)で出すかを決め、出さないときは理由の注記を出す', () => {
    expect(mch).toMatch(/import \{ judgeNewVsRepeatBasis \} from '\.\/newVsRepeatBasis\.js';/);
    expect(mch).toContain('const newVsRepeatBasis = judgeNewVsRepeatBasis(pastBroadcastsForLayer.length);');
    expect(mch).toContain('newVsRepeatBasis.ok ? sectionNewVsRepeat(newVsRepeat) : sectionNewVsRepeatUnavailable(newVsRepeatBasis.note)');
    // 次のアドバイスも、出せる(ok)ときだけ
    expect(mch).toContain('newVsRepeatBasis.ok && newVsRepeat.totalCurrent > 0 ? adviceAfterNewVsRepeat()');
  });
});
