import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { combineCanonicalComeviewRows } from '../lib/comeviewRows.js';
import { extractUserCommentRows, comeviewUserKeyForRow } from '../lib/comeviewActions.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// CRLF 正規化(アンカー付き regex が改行を跨ぐため)。
const venueBarSrc = fs.readFileSync(path.join(here, 'venueBar.js'), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★会場の発言パネルが「この配信の記録にはまだ発言がありません」を出し続けた件の根治
 *   (2026-08-07・v0.1.1287)。ユーザー証言「出たところを見たことがないかも」。
 *
 * ■ 真因: 会場だけが【テールを読んでいなかった】
 *   コメントはまずテール(nls_ctail_<lv>)に溜まり、compaction されて初めてチャンクへ畳まれる。
 *   しきい値は通常 200件 or 10秒、【巨大メイン(5,000件超)では 1,500件】
 *   (commentTailBuffer.js:30,33,67)。大配信では「直近1,500件がチャンクに無い窓」ができる。
 *   発言数の少ない人がその窓に入ると、チャンクだけ読む会場では永久に total=0。
 *
 * ■ 正しい読み方の正本は comeview(comeview-entry.js:1172-1177)= チャンク→テール合流の2段。
 *
 * ■ なぜ既存テストで防げなかったか(この回の最大の教訓)
 *   venueSpeechPanelUserKey.wiring.test.js は「キーの書式」と「純関数の契約」しか見ておらず、
 *   readVenueCommentRowsForSpeech が常に [] を返しても【全件緑のまま通る】。
 *   v0.1.1201→1204→1206→1248 と4回「直した」と宣言して4回とも実機で動かなかったのは、
 *   毎回この形の文字列スキャンだけで緑を確認して出荷していたため。
 *   → ここでは【データが実際に取れること】を、本物の純関数を通して断言する。
 */

describe('★発言パネル: テールにしか無い発言でも取れる(データが実際に取れることの断言)', () => {
  /** チャンクに畳まれた古い分(この人の発言は入っていない)。 */
  const chunkRows = [
    { commentNo: 1, text: '古い発言', userId: '99999999', name: 'ほか' },
    { commentNo: 2, text: 'これも古い', userId: '88888888', name: 'ほか2' }
  ];
  /** ★まだテールにしか無い直近分(compaction 前)。当事者の発言はここにある。 */
  const tailRows = [
    { commentNo: 3, text: 'こんばんは', userId: '14087594', name: 'ぴしゃ' },
    { commentNo: 4, text: 'たのしい', userId: '14087594', name: 'ぴしゃ' }
  ];

  const uid = '14087594';
  const userKey = comeviewUserKeyForRow({ userId: uid });

  it('★修正前の再現: チャンクだけ読むと 0件(=実機の症状そのもの)', () => {
    const found = extractUserCommentRows(chunkRows, userKey, 200);
    expect(found.total).toBe(0); // ← これが「発言がありません」の正体
  });

  it('★修正後: テールを合流すれば取れる', () => {
    const merged = combineCanonicalComeviewRows(chunkRows, tailRows);
    const found = extractUserCommentRows(merged, userKey, 200);
    expect(found.total).toBe(2);
    expect(found.rows.map((r) => r.text)).toEqual(['こんばんは', 'たのしい']);
  });

  it('合流は commentNo で重複排除する(二重表示しない)', () => {
    // 同じ発言がチャンクとテールの両方に居る過渡状態(compaction 直後)。
    const overlap = combineCanonicalComeviewRows([...chunkRows, ...tailRows], tailRows);
    const found = extractUserCommentRows(overlap, userKey, 200);
    expect(found.total).toBe(2); // 4件にならない
  });

  it('テールが空でも従来どおり動く(fail-soft)', () => {
    const merged = combineCanonicalComeviewRows(chunkRows, []);
    expect(merged).toHaveLength(chunkRows.length);
  });
});

describe('★配線: 会場の発言パネルがテールを読んでいる', () => {
  it('★readVenueCommentRowsForSpeech の中でテールを読んで合流している', () => {
    // アンカーを前後まで固定する(緩めると別の場所の tail 読みで素通りする)。
    expect(venueBarSrc).toMatch(
      /const tKey = tailStorageKey\(lid\);\n\s*const bag = await chrome\.storage\.local\.get\(tKey\);\n\s*rows = combineCanonicalComeviewRows\(rows, Array\.isArray\(bag\[tKey\]\) \? bag\[tKey\] : \[\]\);/
    );
  });

  it('★合流関数を実 import している(コメント言及だけでは配線されない)', () => {
    const importLine = venueBarSrc
      .split('\n')
      .find((l) => l.includes('from') && l.includes('comeviewRows.js'));
    expect(importLine).toBeTruthy();
    expect(importLine).toContain('combineCanonicalComeviewRows');
  });

  it('★チャンク読みも残っている(テールだけにして古い発言を捨てていない)', () => {
    expect(venueBarSrc).toMatch(/readChunkedComments\(lid, commentsStorageKey\(lid\)/);
  });
});
