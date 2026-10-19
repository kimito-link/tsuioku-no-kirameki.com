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

  /**
   * ★v0.1.1421: v1419 の data-nl-src 方式は【撤回】した(src を JS で付ける設計は単一障害点。スクリプトが走らなければ
   *   パネルが永久に空=全面真っ黒になった)。
   * ★v0.1.1693: 縞(黒い幕)を縮めるため、ユーザー判断で「親の最初の描画のあとに src を付ける」方式へ【再度】移した。
   *   v1419 と違い、単一障害点にしない守りを重ねている(この検査が機械で固定する):
   *     ①極小の別スクリプト(sidepanel-iframe-boot)へ隔離し、重い本体より【前】に読む
   *     ②保険タイマーで必ず読み込ませる(関門が開かなくても・壊れても)
   *     ③出荷物にそのスクリプトが入っていることを stage-submission が必須にする
   */
  it('★★iframe の src は極小の別スクリプトが必ず付ける(v0.1.1693: 守りを重ねた data-nl-src 方式)', () => {
    expect(sidepanelHtml).toMatch(
      /<iframe[^>]*\sdata-nl-src="popup\.html\?inline=1&amp;dock=sidepanel"/
    );
    // 静的な src は持たない(持つと二重ロード=親の最初の描画が再び遅れる)。
    expect(sidepanelHtml).not.toMatch(/<iframe[^>]*\ssrc=/);
  });

  it('★★守り①: 極小スクリプトは本体より【前】に読む・どちらも外部ファイル(CSP でインライン不可)', () => {
    const bootAt = sidepanelHtml.indexOf('<script src="dist/sidepanel-iframe-boot.js"></script>');
    const mainAt = sidepanelHtml.indexOf('<script src="dist/sidepanel.js"></script>');
    expect(bootAt).toBeGreaterThan(-1);
    expect(mainAt).toBeGreaterThan(-1);
    expect(bootAt).toBeLessThan(mainAt);
  });

  it('★★守り②: 保険(必ず読み込ませる)・失敗しても素の src(ローダーと極小スクリプト)', () => {
    const loader = readFileSync(join(root, 'src', 'lib', 'sidepanelIframeLoader.js'), 'utf8');
    const boot = readFileSync(join(root, 'src', 'extension', 'sidepanel-iframe-boot-entry.js'), 'utf8');
    // 保険タイマーを最初に立てる(以降の処理が失敗しても動く)
    const failsafeAt = loader.indexOf('IFRAME_FAILSAFE_MS);');
    const gateAt = loader.indexOf('const gateDone');
    expect(failsafeAt).toBeGreaterThan(-1);
    expect(failsafeAt).toBeLessThan(gateAt);
    // 極小スクリプトの catch でも素の src を付ける
    expect(boot).toMatch(/\} catch \{[\s\S]*setAttribute\('src'/);
  });

  it('★★守り③: 出荷物に dist/sidepanel-iframe-boot.js が入っていることを必須にする(無いとパネルが空)', () => {
    const stage = readFileSync(join(root, 'scripts', 'stage-submission.py'), 'utf8');
    expect(stage).toContain("'dist/sidepanel-iframe-boot.js'");
    const build = readFileSync(join(root, 'scripts', 'build.mjs'), 'utf8');
    expect(build).toContain("entryPoints: ['src/extension/sidepanel-iframe-boot-entry.js']");
    expect(build).toContain("outfile: 'extension/dist/sidepanel-iframe-boot.js'");
  });

  it('★lv を付ける・無いときだけ自力探索する(極小スクリプトが担う。本体は src に触れない=二重に付けない)', () => {
    const boot = readFileSync(join(root, 'src', 'extension', 'sidepanel-iframe-boot-entry.js'), 'utf8');
    expect(boot).toMatch(/querySelector\(\s*['"]iframe\[data-nl-src\]['"]\s*\)/);
    expect(boot).toMatch(/buildSidePanelIframeSrc\(/);
    expect(sidepanelEntry).not.toMatch(/setAttribute\(\s*['"]src['"]/);
    // 本体は iframe を src の有無に関係なく見つける(覆い・診断のため)
    expect(sidepanelEntry).toMatch(/document\.querySelector\(\s*['"]iframe['"]\s*\)/);
  });

  it('★判定は純関数へ隔離されている(entry に正規表現を書かない)', () => {
    const boot = readFileSync(join(root, 'src', 'extension', 'sidepanel-iframe-boot-entry.js'), 'utf8');
    expect(boot).toMatch(
      /import\s*\{[^}]*buildSidePanelIframeSrc[^}]*\}\s*from\s*'\.\.\/lib\/sidepanelIframeSrc\.js'/
    );
  });

  it('★dock=sidepanel は保たれる(モード判定を変えない)', () => {
    // data-nl-src に dock=sidepanel が入っていること。ここが消えると
    // popup が INLINE_SIDE_PANEL ではなく embedWatch と誤判定される。
    expect(sidepanelHtml).toMatch(/<iframe[^>]*data-nl-src="[^"]*dock=sidepanel/);
  });
});
