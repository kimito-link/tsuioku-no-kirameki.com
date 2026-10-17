import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場を開いている間も、透明な所のクリックをニコ生の画面(映像・再生ボタン・音量・コメント入力欄)へ通す(v0.1.1648)。
 *   実測: 以前は root / stage / stage-layout が全面 pointer-events:auto で、映像の中心を elementFromPoint すると
 *   .nlsb-root 配下が返り、会場を閉じるまで映像まわりが押せなかった。
 *   → 全面を覆う3枚は none、押せる箱(ヘッダー・席・パネル・トグル)だけ auto。パネルの『外側クリックで閉じる』は
 *     stage が通すようになったので document のキャプチャ段階で受ける(プレーヤーが映像のクリックを止めても届く)。
 *   実際のヒットテストは実ブラウザでしか測れない(別途 headless で確認済み)ので、ここは再発させない規則だけを固定する。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');

/** @param {string} selectorLine */
const ruleBody = (selectorLine) => {
  const a = src.indexOf(selectorLine);
  expect(a, `${selectorLine} が見つからない`).toBeGreaterThan(0);
  return src.slice(a, src.indexOf('\n  }\n', a));
};

describe('全面を覆う箱は透明な所を通す', () => {
  it('★.nlsb-root.nlsb-is-open は pointer-events:none', () => {
    const body = ruleBody('  .nlsb-root.nlsb-is-open {');
    expect(body).toContain('pointer-events: none;');
    expect(body).not.toContain('pointer-events: auto;');
  });

  it('★開いたときの .nlsb-stage も none(auto に戻っていない)', () => {
    const body = ruleBody('  .nlsb-root.nlsb-is-open .nlsb-stage {');
    expect(body).toContain('pointer-events: none;');
    expect(body).not.toContain('pointer-events: auto;');
  });

  it('★.nlsb-stage-layout も none', () => {
    const body = ruleBody('  .nlsb-stage-layout {');
    expect(body).toMatch(/pointer-events:\s*none;/);
    expect(body).not.toMatch(/pointer-events:\s*auto;/);
  });
});

describe('押せる箱は auto を明示している(none の親の下でも押せる)', () => {
  it('★席の入れ物 .nlsb-seating は auto', () => {
    expect(ruleBody('  .nlsb-seating {')).toContain('pointer-events: auto;');
  });

  it('★パネル(.nlsb-roster-panel)は auto(発言・一覧・状態の3枚)', () => {
    expect(ruleBody('  .nlsb-roster-panel {')).toContain('pointer-events: auto;');
  });

  it('★トグル(.nlsb-toggle)は auto', () => {
    expect(ruleBody('  .nlsb-toggle {')).toContain('pointer-events: auto;');
  });

  it('★ホバーカードは none のまま(マウスを奪わない)', () => {
    expect(ruleBody('  .nlsb-hover-card {')).toContain('pointer-events: none;');
  });
});

describe('パネルの外側クリックは document のキャプチャで受ける', () => {
  for (const nm of ['Speech', 'Roster', 'Diag']) {
    it(`★${nm}: add/remove とも document・キャプチャ(true)で、stage には付けない`, () => {
      expect(src).toContain(`document.addEventListener('click', on${nm}OutsideClick, true)`);
      expect(src).toContain(`document.removeEventListener('click', on${nm}OutsideClick, true)`);
      expect(src).not.toContain(`stage.addEventListener('click', on${nm}OutsideClick`);
      expect(src).not.toContain(`stage.removeEventListener('click', on${nm}OutsideClick`);
    });
  }
});
