import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const statusSrc = fs.readFileSync(path.join(here, 'status-entry.js'), 'utf8');

/**
 * v0.1.1222: 共有ボタン(btnShareAll)が「古い本文を黙って渡さない」配線を断言する。
 *
 * 【なぜ文字列で見張るか】
 * 純関数(statusCopyFreshness.js)は単体テストで守れるが、**呼ばれていなければ意味がない**。
 * 実際 2026-08-01 に、鮮度(staleNote)は画面ヘッダーにだけ出ていてコピー本文には
 * 入っておらず、数十秒前の値が「コピーしました ✓」として共有されていた。
 * [[fastdiag-lite-is-the-printer-subset]] と同型の「機構はあるが配線が死んでいる」穴。
 *
 * ★このテストは書いた直後に変異(if(false)前置・呼び出し削除)で赤になることを確認済み。
 */
describe('status 共有ボタンの鮮度配線 (status-entry.js btnShareAll)', () => {
  /** btnShareAll のクリックハンドラ本体だけを切り出す。 */
  const heroBlock = (() => {
    const start = statusSrc.indexOf("const heroBtn = document.getElementById('btnShareAll');");
    expect(start).toBeGreaterThanOrEqual(0);
    // ハンドラ終端(このブロックを閉じる位置)まで。十分な窓を取る。
    return statusSrc.slice(start, start + 3000);
  })();

  it('鮮度モジュールを import している', () => {
    expect(statusSrc).toContain("from '../lib/statusCopyFreshness.js'");
    expect(statusSrc).toContain('buildStatusCopyStaleBanner');
    expect(statusSrc).toContain('buildStatusCopyButtonLabel');
  });

  it('★コピーする本文に警告バナーを前置している(text 単体を渡していない)', () => {
    // banner + text を渡すことが核心。copyTextWithFallback(text, ...) のままだと
    // 受け取った側は古さを知りようがない。
    expect(heroBlock).toContain('const banner = buildStatusCopyStaleBanner(ageSec);');
    expect(heroBlock).toContain('copyTextWithFallback(banner + text');
    expect(heroBlock).not.toContain('copyTextWithFallback(text,');
  });

  it('★古さは「本文の齢 + 元データが古かったぶん」の合算で出している', () => {
    // どちらか片方だけだと実態より新しく見える(混雑時は両方効く)。
    expect(heroBlock).toContain('_lastRenderedAtMs');
    expect(heroBlock).toContain('_lastRenderedSourceStaleSec');
  });

  it('★ボタン文言を鮮度つきに差し替えている(固定の「コピーしました ✓」を出さない)', () => {
    expect(heroBlock).toContain('buildStatusCopyButtonLabel(outcome, ageSec)');
    expect(heroBlock).toContain('heroFlash(label');
    // 旧実装の固定文言が残っていたら、古くても「そのまま貼ってください」と言ってしまう。
    expect(heroBlock).not.toContain("heroFlash('コピーしました ✓ そのまま貼ってください'");
  });

  it('本文を組んだ時刻と元データの古さが、render 側で実際に代入されている', () => {
    // 代入が無ければ常に 0 = 永久に「新鮮」と嘘をつく。
    expect(statusSrc).toContain('_lastRenderedAtMs = Date.now();');
    // stale でないサイクルで 0 に戻していること(前回の古さが残り続けない)。
    expect(statusSrc).toContain('_lastRenderedSourceStaleSec = 0;');
  });

  /**
   * ★ [[wiring-test-mutation-check-2026-08-01]]: 文字列 toContain だけだと
   *   `if (false) x = y;` を前置する変異を検知できず緑のまま通る(実際にこのテストで踏んだ)。
   *   代入が【無条件に実行される文】であることまで断言する。
   */
  it('★古さの代入は無条件の文である(if(false)等の前置で殺されていない)', () => {
    const idx = statusSrc.indexOf('_lastRenderedSourceStaleSec = worstSec;');
    expect(idx).toBeGreaterThanOrEqual(0);
    // その行の行頭からの部分を取り、代入の手前に条件・論理演算子が無いことを確かめる。
    const lineStart = statusSrc.lastIndexOf('\n', idx) + 1;
    const beforeOnLine = statusSrc.slice(lineStart, idx).trim();
    expect(beforeOnLine).toBe('');
  });
});
