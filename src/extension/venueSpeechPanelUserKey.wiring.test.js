import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractUserCommentRows, comeviewUserKeyForRow } from '../lib/comeviewActions.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const venueBarSrc = fs.readFileSync(path.join(here, 'venueBar.js'), 'utf8');

/**
 * v0.1.1248(2026-08-04): 会場のアイコンをクリックしたときの発言パネルが
 * 常に「この配信の記録にはまだ発言がありません」を出していたバグの回帰テスト。
 *
 * 真因: venueBar.js が extractUserCommentRows に【生の uid】を渡していた。
 *   この関数は comeviewUserKeyForRow が返す接頭辞つきキー('u:<userId>')で
 *   完全一致照合する(comeviewActions.js:226)ため、
 *   "140475218" !== "u:140475218" で全行が外れ total が常に0になっていた。
 *
 * ★なぜ既存テストで防げなかったか(この wiring テストが要る理由):
 *   comeviewActions.test.js は全部 'u:1' 形式(=正しい形)でしか呼んでおらず、
 *   関数自体は正しく動いていた。バグは【呼び出し側】にあり、純関数テストでは
 *   原理的に検知できない。実際、修正を元に戻す変異を当てても純関数テストは
 *   32件すべて緑のままだった。よってソース文字列で配線を断言する
 *   ([[fastdiag-lite-is-the-printer-subset]] と同型の穴)。
 */
describe('venue speech panel user key wiring (venueBar.js)', () => {
  it('comeviewUserKeyForRow を import している', () => {
    expect(venueBarSrc).toContain('comeviewUserKeyForRow');
    // import 文に含まれていること(関数名がコメントに出ているだけでは配線されない)
    const importLine = venueBarSrc
      .split(/\r?\n/)
      .find((l) => l.includes('from') && l.includes('comeviewActions.js'));
    expect(importLine).toBeTruthy();
    expect(importLine).toContain('comeviewUserKeyForRow');
  });

  it('extractUserCommentRows には生の uid ではなく接頭辞つきキーを渡している', () => {
    const idx = venueBarSrc.indexOf('extractUserCommentRows(raw,');
    expect(idx).toBeGreaterThanOrEqual(0);
    const call = venueBarSrc.slice(idx, idx + 120);
    // 生の uid を第2引数にしていない(これが実機バグそのもの)
    expect(call).not.toMatch(/extractUserCommentRows\(raw,\s*uid\b/);
    // 接頭辞つきキーを渡している
    expect(call).toMatch(/extractUserCommentRows\(raw,\s*userKey\b/);
  });

  it('userKey は comeviewUserKeyForRow から作られている(無条件に実行される文)', () => {
    // `if (false)` 等を前置する変異でも通ってしまわないよう、
    // 代入が無条件の const 宣言であることまで断言する
    //  ([[wiring-test-mutation-check-2026-08-01]] の教訓)。
    expect(venueBarSrc).toMatch(
      /\n\s*const userKey = comeviewUserKeyForRow\(\{\s*userId:\s*uid\s*\}\);/
    );
  });

  it('【契約の実証】この配線なら実際に発言が取れる(生uidでは0件)', () => {
    const archive = [
      { commentNo: 1, text: 'あ', userId: '140475218', name: '太ももちゃん' },
      { commentNo: 2, text: 'い', userId: '999', name: 'ほか' },
      { commentNo: 3, text: 'う', userId: '140475218', name: '太ももちゃん' }
    ];
    const uid = '140475218';
    // 修正前(実機バグ)の呼び方 → 0件
    expect(extractUserCommentRows(archive, uid).total).toBe(0);
    // 修正後の呼び方 → 取れる
    const userKey = comeviewUserKeyForRow({ userId: uid });
    expect(extractUserCommentRows(archive, userKey).total).toBe(2);
  });
});
