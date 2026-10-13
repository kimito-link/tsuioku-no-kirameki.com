import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ★Chrome は、content script / 拡張のスクリプトに Unicode の【非文字】(U+FFFE・U+FFFF・U+FDD0〜U+FDEF)が
 *   生のまま含まれると「UTF-8 ではない」と判定し、拡張ごと読み込まない(2026-10-13 実測: ソースに書いた
 *   正規表現 /[\u0080-\uFFFF]/ を esbuild が U+FFFF を生のまま出力し、Service Worker すら起動しなくなった)。
 *   ユーザーの Chrome でこれが起きれば拡張が丸ごと消える。出荷物(dist)を機械で検査して二度と通さない。
 */
describe('出荷物に非文字が生で入っていない', () => {
  const dirs = ['extension/dist', 'app/dist'];
  for (const d of dirs) {
    const abs = path.resolve(d);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).filter((x) => x.endsWith('.js'))) {
      it(`${d}/${f}`, () => {
        const text = fs.readFileSync(path.join(abs, f), 'utf8');
        const m = /[\uFDD0-\uFDEF\uFFFE\uFFFF]/.exec(text);
        expect(m ? `U+${m[0].charCodeAt(0).toString(16).toUpperCase()} at ${m.index}` : null).toBeNull();
      });
    }
  }
});
