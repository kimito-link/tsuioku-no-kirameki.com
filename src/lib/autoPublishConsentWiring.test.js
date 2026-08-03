import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * ★v0.1.1242(CWS提出ブロッカー BLOCKING-1)の配線テスト。
 *
 * 純関数 shouldAutoPublish に optedIn ゲートを足しても、**呼び出し側が渡さなければ**
 * 同意は一切効かない(undefined → no_consent で止まる側に倒れるが、逆に言えば
 * 「同意しても永久に送れない」バグにもなる)。ここでは status-entry が
 *   (a) optedIn を実際に渡していること
 *   (b) 同意フラグを storage から読む初期化を持つこと
 *   (c) 既定が false(fail-closed)であること
 * を、**無条件に実行される文**として断言する。
 *
 * 文字列スキャンなので、書いた直後に必ず変異(該当行の削除/`if(false)`前置)で
 * 赤を確認すること。緑だけだと実効性ゼロの穴が開く(v0.1.1201 の実例)。
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../extension/status-entry.js');

/** CRLF/LF 差で落ちないよう正規化して読む。 */
function readSource() {
  return readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
}

describe('自動WEB公開の同意ゲート配線(status-entry)', () => {
  it('shouldAutoPublish に optedIn を渡している', () => {
    const src = readSource();
    // shouldAutoPublish({ ... optedIn: ... }) の呼び出しブロックを取り出して断言する。
    const call = src.match(/shouldAutoPublish\(\{[\s\S]{0,600}?\}\)/);
    expect(call, 'shouldAutoPublish の呼び出しが見つからない').toBeTruthy();
    expect(call[0]).toMatch(/optedIn\s*:/);
  });

  it('optedIn には同意キャッシュを真偽値で渡している(定数 true を直書きしていない)', () => {
    const src = readSource();
    const call = src.match(/shouldAutoPublish\(\{[\s\S]{0,600}?\}\)/)[0];
    // `optedIn: true` のような握り潰しを禁じる(同意を無効化する最も簡単な壊し方)。
    expect(call).not.toMatch(/optedIn\s*:\s*true\s*[,}]/);
    expect(call).toMatch(/optedIn\s*:\s*_webPublishOptIn\s*===\s*true/);
  });

  it('同意フラグの既定値は false(fail-closed)', () => {
    const src = readSource();
    expect(src).toMatch(/let\s+_webPublishOptIn\s*=\s*false\s*;/);
  });

  it('storage 読み取りに失敗したら false に倒す(fail-closed)', () => {
    const src = readSource();
    const fn = src.match(/async function refreshWebPublishOptInCache\(\)[\s\S]{0,500}?\n\}/);
    expect(fn, 'refreshWebPublishOptInCache が見つからない').toBeTruthy();
    // catch 節で false を代入していること
    expect(fn[0]).toMatch(/catch\s*\{[\s\S]{0,160}_webPublishOptIn\s*=\s*false/);
  });

  it('bootstrap が同意キャッシュの読み込みを無条件に await している', () => {
    const src = readSource();
    const boot = src.match(/async function bootstrap\(\)[\s\S]*?\n\}/);
    expect(boot, 'bootstrap が見つからない').toBeTruthy();
    // `await refreshWebPublishOptInCache();` が文として存在すること。
    // if/&&/? などで条件付きにされていないことまで見る。
    expect(boot[0]).toMatch(/\n\s*await refreshWebPublishOptInCache\(\);/);
  });

  it('同意トグルUIが両方のマウント地点に配線されている', () => {
    const src = readSource();
    const mounts = src.match(/buildAutoPublishConsentToggle\(\)/g) || [];
    // 定義1 + 呼び出し2 = 3
    expect(mounts.length).toBeGreaterThanOrEqual(3);
    // 追加が条件分岐で握り潰されていないこと(null チェックのみ許す)
    const appends = src.match(/const consentEl = buildAutoPublishConsentToggle\(\);\n\s*if \(consentEl\)/g) || [];
    expect(appends.length).toBe(2);
  });
});
