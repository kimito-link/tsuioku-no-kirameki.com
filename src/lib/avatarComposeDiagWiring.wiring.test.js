import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 匿名の顔の合成の状況を状態速報へ出す配線(v0.1.1682)。
 *   popup(composer)が session に統計を書く → サイドパネルの自己診断が読む → 状態速報の1行。
 *   どれか1か所が切れると、Worker が動いているかどうかが実機で読めなくなる(「動いているつもり」)。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('顔の合成の診断の配線', () => {
  const composer = strip(read('src/lib/avatarPartsComposer.js'));
  const panel = strip(read('src/extension/sidepanel-entry.js'));
  const text = strip(read('src/lib/aiShareFullText.js'));

  it('★composer: 要求のたびに診断の書き込みを予約し、session へ { at, stats } を書く', () => {
    const f = composer.indexOf('function composeWhenNear');
    expect(composer.slice(f, f + 200)).toContain('noteComposeDiag();');
    expect(composer).toMatch(/session\.set\(\{ \[KEY_AVATAR_COMPOSE_DIAG\]: \{ at: Date\.now\(\), stats \} \}\)/);
  });

  it('★composer: 統計が変わらなければ書かない・session が無い環境は何もしない', () => {
    expect(composer).toMatch(/if \(sig === composeDiagSig\) return;/);
    expect(composer).toMatch(/if \(!session \|\| typeof session\.set !== 'function'\) return;/);
  });

  it('★サイドパネル: 観測のたびに session を読み、自己診断の avatarComposeLine に載せる', () => {
    expect(panel).toMatch(/function collectAndPublish\(phase, schedMs = null\) \{\s*publishOpenTiming\(\);\s*refreshAvatarComposeLine\(\);/);
    expect(panel).toMatch(/avatarComposeLine:\s*_avatarComposeLine/);
    expect(panel).toContain('chrome?.storage?.session?.get?.(KEY_AVATAR_COMPOSE_DIAG)');
  });

  it('★状態速報: avatarComposeLine を行にする', () => {
    const i = text.indexOf('sidepanelSelfDiag?.avatarComposeLine');
    expect(i).toBeGreaterThan(-1);
    expect(text.slice(i, i + 160)).toContain('lines.push(composeLine)');
  });
});
