import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ちらつき計の配線(v0.1.1686): popup(サイドパネル) が画面の書き換えを数えて session に書く → サイドパネルの自己診断が読む → 状態速報の1行。
 *   どれか1か所が切れると、「ここがちらちらしてます」を実機で裏どりできなくなる(計器が無言で死ぬ)。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('ちらつき計の配線', () => {
  it('★popup が起動時に flickerMeterBoot を読み込む(import するだけで起動)', () => {
    expect(strip(read('src/extension/popup-entry.js'))).toContain("import '../lib/flickerMeterBoot.js';");
  });

  it('★起動はサイドパネルの popup(dock=sidepanel)だけ・session が無ければ何もしない', () => {
    const b = strip(read('src/lib/flickerMeterBoot.js'));
    expect(b).toMatch(/dock=sidepanel/);
    expect(b).toMatch(/if \(!session \|\| typeof session\.set !== 'function'\) return;/);
  });

  it('★DOM を書き換えない(数えるだけ): Boot に innerHTML/appendChild/setAttribute/remove が無い', () => {
    const b = strip(read('src/lib/flickerMeterBoot.js'));
    expect(b).not.toMatch(/innerHTML|appendChild|setAttribute|\.remove\(|\.style\.|classList\.(add|remove|toggle)/);
  });

  it('★書き込みは変化があるときだけ・session のみ(ディスクへ書かない)', () => {
    const b = strip(read('src/lib/flickerMeterBoot.js'));
    expect(b).toMatch(/if \(!meter\.takeDirty\(\)\) return;/);
    expect(b).not.toContain('storage.local');
  });

  it('★サイドパネルの自己診断が写しを読み、flickerMeterLine に載せる', () => {
    const p = strip(read('src/extension/sidepanel-entry.js'));
    expect(p).toMatch(/refreshAvatarComposeLine\(\);\s*refreshFlickerLine\(\);/);
    // v0.1.1703: 順位計の行を続けて載せる合成になった。ちらつき計の写し(_flickerLine)が載ることは保つ。
    expect(p).toMatch(/flickerMeterLine:\s*\[_flickerLine,\s*_rankOrderLine\]/);
    expect(p).toContain('chrome?.storage?.session?.get?.(FLICKER_METER_STORAGE_KEY)');
  });

  it('★状態速報: flickerMeterLine を行にする', () => {
    const t = strip(read('src/lib/aiShareFullText.js'));
    const i = t.indexOf('sidepanelSelfDiag?.flickerMeterLine');
    expect(i).toBeGreaterThan(-1);
    expect(t.slice(i, i + 160)).toContain('lines.push(flickerLine)');
  });
});
