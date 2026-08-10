import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const popupEntry = readFileSync(join(root, 'src/extension/popup-entry.js'), 'utf8');

/**
 * ★配線が切れると「サイドパネルがタブ切替で空になる」実害が戻るので、
 *   呼び出しが【無条件に実行される文】であることまで断言する。
 *   (文字列スキャンだけだと `if (false)` 前置の変異を素通りする既知の穴がある)
 */
describe('decideNoActiveWatch の配線', () => {
  it('popup-entry が decideNoActiveWatch を import している', () => {
    expect(popupEntry).toMatch(
      /import\s*\{\s*decideNoActiveWatch\s*\}\s*from\s*'\.\.\/lib\/noActiveWatchDecision\.js'/
    );
  });

  it('★const 宣言として無条件に呼ばれている(if で囲うと赤くなる)', () => {
    // `const noActiveWatchDecision = decideNoActiveWatch({` をアンカーごと固定する。
    expect(popupEntry).toMatch(
      /\n\s*const noActiveWatchDecision = decideNoActiveWatch\(\{/
    );
  });

  it('★4つの入力すべてを渡している(面の種類を落とすと判定が壊れる)', () => {
    const m = popupEntry.match(
      /const noActiveWatchDecision = decideNoActiveWatch\(\{([\s\S]{0,400}?)\}\)/
    );
    expect(m, '呼び出しが読めること').toBeTruthy();
    const args = m[1];
    expect(args).toMatch(/isWatchUrl:/);
    expect(args).toMatch(/source:/);
    expect(args).toMatch(/embedWatch:\s*INLINE_EMBED_WATCH/);
    // ★これが今回の修正の要。落とすとサイドパネルが再び空になる。
    expect(args).toMatch(/sidePanel:\s*INLINE_SIDE_PANEL/);
  });

  it('★戻り値の両方を使っている(片方だけだと画面とヒントがちぐはぐになる)', () => {
    expect(popupEntry).toMatch(
      /const treatAsNoActiveWatch = noActiveWatchDecision\.treatAsNoActiveWatch/
    );
    expect(popupEntry).toMatch(
      /const showNoWatchRankingHint = noActiveWatchDecision\.showNoWatchHint/
    );
  });

  it('★旧判定(source の直接比較)が復活していない', () => {
    // 旧: `watchUrlPick.source === 'storage' || watchUrlPick.source === 'dataBacked'`
    // これが treatAsNoActiveWatch の定義に戻ると、サイドパネルの実害が再発する。
    expect(popupEntry).not.toMatch(
      /const treatAsNoActiveWatch\s*=\s*\n?\s*!isNicoLiveWatchUrl\(url\)\s*\|\|/
    );
  });
});
