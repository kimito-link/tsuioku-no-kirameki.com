import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * ★v0.1.1420 配線テスト: サイドパネルで幕(cloak)を即座に外しているか。
 *
 * ■ なぜ機械で固定するか
 *   幕は v0.1.1279 で静的に足されて以来、12版かけても黒が消えなかった当人。
 *   「サイドパネルでは使わない」という判断を、次の改修で黙って戻されないようにする。
 *   ★特に【読み込み順】が肝: 幕を外す処理が #nlPopupPrimary より後に走ると
 *   その間だけ中身が隠れる=いまの症状に戻る。順序を検査で固定する。
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const popupHtml = readFileSync(join(root, 'extension', 'popup.html'), 'utf8');
const failsafeEntry = readFileSync(
  join(root, 'src', 'extension', 'cloak-failsafe-entry.js'),
  'utf8'
);

describe('サイドパネルの幕スキップ', () => {
  it('★判定は純関数へ隔離されている', () => {
    expect(failsafeEntry).toMatch(
      /import\s*\{[^}]*shouldUseCloak[^}]*\}\s*from\s*'\.\.\/lib\/cloakNotForSidePanel\.js'/
    );
    expect(failsafeEntry).toMatch(/shouldUseCloak\(/);
  });

  it('★幕を外したら「外した印」も立てる(本体が付け直さないように)', () => {
    // 印を立てないと popup-entry.js の ensurePopupPrimaryCloakedBeforeFirstReveal が
    // 「まだ誰も見せていない」と誤認して幕を再付与する(v0.1.1381 の教訓)。
    const block = failsafeEntry.match(/if\s*\(!shouldUseCloak\([\s\S]{0,600}?\n\}/);
    expect(block).not.toBeNull();
    expect(block?.[0]).toMatch(/removeAttribute\(\s*['"]data-nl-popup-primary-cloak['"]\s*\)/);
    expect(block?.[0]).toMatch(/CLOAK_FAILSAFE_FIRED_FLAG/);
  });

  it('★スキップは従来の 400ms 保険より前に書かれている(待たずに外す)', () => {
    const skipAt = failsafeEntry.indexOf('shouldUseCloak(');
    const timerAt = failsafeEntry.indexOf('setTimeout(');
    expect(skipAt).toBeGreaterThan(-1);
    expect(timerAt).toBeGreaterThan(-1);
    expect(skipAt).toBeLessThan(timerAt);
  });

  it('★★cloak-failsafe.js は #nlPopupPrimary より前に読み込まれる(順序が肝)', () => {
    const scriptAt = popupHtml.indexOf('dist/cloak-failsafe.js');
    const primaryAt = popupHtml.indexOf('id="nlPopupPrimary"');
    expect(scriptAt).toBeGreaterThan(-1);
    expect(primaryAt).toBeGreaterThan(-1);
    // ここが逆転すると「幕を外す前に中身が幕付きで生成される」=黒が戻る。
    expect(scriptAt).toBeLessThan(primaryAt);
  });

  it('★埋め込み(watch)の幕は撤去していない(挙動不変)', () => {
    // 幕の規則自体は残っていること。丸ごと消すと watch 重ねのちらつき隠しが失われる。
    expect(popupHtml).toMatch(/html\[data-nl-popup-primary-cloak='1'\]\s*\.nl-popup-primary/);
  });
});
