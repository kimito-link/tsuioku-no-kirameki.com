import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * ★v0.1.1419 配線テスト: サイドパネルが配信ID(lv)を iframe へ渡しているか。
 *
 * ■ なぜ機械で固定するか(2026-08-17 実機)
 *   background.js は `sidepanel.html?lv=...` と正しく渡していたのに、
 *   iframe の src が静的で lv を持たず【境界で捨てられて】いた。
 *   結果 laneTickProbe.lidMiss=4 ＝「レーンが空・描画関数が一度も呼ばれない」。
 *   ★片方(background)だけ直っていても、もう片方(iframe)が受けなければ意味が無い。
 *   この2つの関係を検査で結ぶ([[comparison-needs-two-origins-2026-08-07]])。
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const sidepanelHtml = readFileSync(join(root, 'extension', 'sidepanel.html'), 'utf8');
const sidepanelEntry = readFileSync(join(root, 'src', 'extension', 'sidepanel-entry.js'), 'utf8');
const backgroundJs = readFileSync(join(root, 'extension', 'background.js'), 'utf8');

describe('サイドパネルの lv 受け渡し', () => {
  it('★background が sidepanel.html へ lv を渡している(送り手が居る)', () => {
    expect(backgroundJs).toMatch(/sidepanel\.html\?lv=/);
  });

  it('★iframe は素の src を持たない(lv を足す前に読み込ませない)', () => {
    // src="popup.html..." が直に書かれていると、JS が lv を足す前にロードが始まり
    // 「lv 無しで起動 → 後から付け直し = 二重ロード」になる。
    expect(sidepanelHtml).not.toMatch(/<iframe[^>]*\ssrc="popup\.html/);
    // 代わりに data-nl-src で持つ。
    expect(sidepanelHtml).toMatch(/<iframe[^>]*data-nl-src="popup\.html\?inline=1&amp;dock=sidepanel"/);
  });

  it('★受け手(sidepanel-entry)が data-nl-src を読んで src を立てている', () => {
    expect(sidepanelEntry).toMatch(/querySelector\(\s*['"]iframe\[data-nl-src\]['"]\s*\)/);
    expect(sidepanelEntry).toMatch(/buildSidePanelIframeSrc\(/);
    expect(sidepanelEntry).toMatch(/setAttribute\(\s*['"]src['"]/);
  });

  it('★判定は純関数へ隔離されている(entry に正規表現を書かない)', () => {
    expect(sidepanelEntry).toMatch(
      /import\s*\{[^}]*buildSidePanelIframeSrc[^}]*\}\s*from\s*'\.\.\/lib\/sidepanelIframeSrc\.js'/
    );
  });

  it('★lv を足す処理は自己診断より前にある(読み込み開始を遅らせない)', () => {
    const wireAt = sidepanelEntry.indexOf('buildSidePanelIframeSrc(');
    const diagAt = sidepanelEntry.indexOf('function probeCenterPainter');
    expect(wireAt).toBeGreaterThan(-1);
    expect(diagAt).toBeGreaterThan(-1);
    expect(wireAt).toBeLessThan(diagAt);
  });

  it('★dock=sidepanel は保たれる(モード判定を変えない)', () => {
    // data-nl-src 側に dock=sidepanel が入っていること。ここが消えると
    // popup が INLINE_SIDE_PANEL ではなく embedWatch と誤判定される。
    expect(sidepanelHtml).toMatch(/data-nl-src="[^"]*dock=sidepanel/);
  });
});
