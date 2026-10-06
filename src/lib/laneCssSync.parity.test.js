import { describe, expect, it } from 'vitest';
import {
  LANE_CSS_FILES,
  collectLaneCss,
  extractStyleBlocks,
  extractVenueSyncCss,
  loadAllLaneCss,
  normalizeSelector,
  readNormalized,
  stripCssComments
} from '../../tests/helpers/laneCssSource.js';

/**
 * 応援レーンCSSの3コピー(popup.html / app/live-view.html / venueBar.js の LANE_CSS_SYNC 区間)の
 * 「集合」照合(v0.1.1570)。輸入1件が触る CSS を足し忘れた/ずれたら、どのファイルに何が無いかを赤で名指しする。
 *
 *   ・比較するのはセレクタ集合・--nl-lane-* トークン名・@keyframes 名・reduced-motion で animation:none になる規則。
 *     ★値は比較しない(会場・別窓は意図して寸法/色が違う。例: live-view の後列 anon=26px)。
 *   ・「意図的な差」は下の EXPECTED_SELECTOR_DIFFS に【理由つきで】宣言する。宣言に無い差は赤・
 *     宣言したのに差が無くなったら(=古くなった宣言)も赤。テスト内に if で握りつぶさない。
 *   ・抽出が0件なら throw(空振り=恒真の緑を許さない)。
 */

/**
 * セレクタが存在するファイルの組(P=popup / L=live-view / V=venue)。'PLV' 以外は全てここに宣言する。
 * status: 'intended'=意図した差 / 'unreviewed'=意図か取りこぼしか未確認(コードは変えていない・要判断)
 */
const EXPECTED_SELECTOR_DIFFS = [
  // --- たぬ姉段(匿名が多い段)の後列LOD。会場は wrapTileEl のため【子孫形】、popup/live-view は【直接子形】 ---
  { sel: "#sceneStoryUserLaneTanu", has: 'PL-', status: 'intended', why: 'たぬ姉段の gap。会場は段の器が別(venueBar の段構造)' },
  { sel: "#sceneStoryUserLaneTanu > .nl-story-userlane-cell:nth-child(n + 25)[data-thumb='0']", has: 'PL-', status: 'intended', why: '後列LOD(直接子形)。会場は下の子孫形(laneDensityLod.wiring.test.js)' },
  { sel: "#sceneStoryUserLaneTanu > .nl-story-userlane-cell:nth-child(n + 25)[data-thumb='0'] .nl-story-userlane-avatar", has: 'PL-', status: 'intended', why: '同上' },
  { sel: "#sceneStoryUserLaneTanu > .nl-story-userlane-cell:nth-child(n + 25)[data-thumb='0'] .nl-story-userlane-meta", has: 'PL-', status: 'intended', why: '同上' },
  { sel: ".nl-story-userlane--tanu > :nth-child(n + 25) .nl-story-userlane-cell[data-thumb='0']", has: '--V', status: 'intended', why: '後列LOD(子孫形)。会場は席ラッパ(.nlsb-seat)で包むため' },
  { sel: ".nl-story-userlane--tanu > :nth-child(n + 25) .nl-story-userlane-cell[data-thumb='0'] .nl-story-userlane-avatar", has: '--V', status: 'intended', why: '同上' },
  { sel: ".nl-story-userlane--tanu > :nth-child(n + 25) .nl-story-userlane-cell[data-thumb='0'] .nl-story-userlane-meta", has: '--V', status: 'intended', why: '同上' },
  // --- 窓化(v0.1.1475)。live-view も wrapTileEl 無しで class が付くため v0.1.1576 で CSS を写した。会場は judgeLaneWindow が isVenue で窓にしない ---
  { sel: '#sceneStoryUserLaneTanu.nl-story-userlane--windowed', has: 'PL-', status: 'intended', why: '窓化は会場では行わない(laneWindowVerdict.js: venue-has-own-scroll)。popup と live-view は同じ規則' },
  // --- 中身LOD。会場には配線しない(laneContentLod.wiring.test.js)。現在は LANE_CONTENT_LOD_ENABLED=false ---
  { sel: '.nl-story-userlane-cell--hollow', has: 'PL-', status: 'intended', why: '中身LODの枠だけタイル。会場は3D変形で可視判定が崩れる前科があり配線しない' },
  // --- 段の器。会場は自前の surface 規則(区間外)で組む ---
  { sel: '.nl-story-userlane-stack .nl-story-userlane-tier-wrap .nl-story-userlane', has: 'PL-', status: 'intended', why: '段の max-height/overflow-y。会場は自前の段規則(区間外)' },
  { sel: '.nl-story-userlane-stack > .nl-story-userlane', has: 'PL-', status: 'intended', why: '同上' },
  { sel: '.nl-story-userlane-tier-break', has: 'PL-', status: 'intended', why: '段の折り返し。会場は使わない' },
  { sel: '.nl-story-userlane::-webkit-scrollbar', has: '--V', status: 'intended', why: '会場は横スクロールバーを出さない(v0.1.1133)' },
  // --- inline / dark ---
  { sel: 'html.nl-inline body .nl-story-userlane-meta', has: 'PL-', status: 'intended', why: '会場は常に inline 相当=基本規則に 142px/11px を持つ' },
  { sel: 'html.nl-inline body .nl-story-userlane-stack .nl-story-userlane', has: '-L-', status: 'intended', why: 'live-view 固有の inline 余白' },
  { sel: 'html.nl-skin-panel-dark .nl-story-userlane-guide__count', has: 'PL-', status: 'intended', why: '会場は常に light 面(dark 規則を持たない)' },
  { sel: 'html.nl-skin-panel-dark .nl-story-userlane-guide__line', has: 'PL-', status: 'intended', why: '同上' },
  { sel: 'html.nl-skin-panel-dark .nl-story-userlane-meta__id', has: 'PL-', status: 'intended', why: '同上' },
  { sel: 'html.nl-skin-panel-dark .nl-story-userlane-meta__name', has: 'PL-', status: 'intended', why: '同上' },
  { sel: 'html.nl-skin-panel-dark .nl-story-userlane-tier-hint', has: 'PL-', status: 'intended', why: '同上' },
  { sel: 'html.nl-skin-panel-dark body.nl-compact .nl-story-userlane-guide__line', has: 'PL-', status: 'intended', why: '同上' }
];

/** 応援レーンのトークン(アクセント色 --nl-lane-accent-* は北極星レーン用でタイルでは使わないので対象外)。 */
const REQUIRED_TOKENS = ['--nl-lane-avatar', '--nl-lane-avatar-anon', '--nl-lane-stats', '--nl-lane-pulse-gift', '--nl-lane-pulse-hot'];

const css = loadAllLaneCss();

describe('抽出が空振りしない(0件の緑を許さない)', () => {
  it('3ファイルすべてで、応援レーンのセレクタ・keyframes・reduced-motion が1件以上取れている', () => {
    for (const [name, c] of Object.entries(css)) {
      expect(c.selectors.size, `${name} セレクタ`).toBeGreaterThan(30);
      expect([...c.keyframes].filter((k) => k.startsWith('nl-lane-')).length, `${name} keyframes`).toBeGreaterThan(0);
      expect(c.reducedMotionNone.size, `${name} reduced-motion`).toBeGreaterThan(0);
    }
  });

  it('輸入済みの代表セレクタが3ファイル全部で取れている(抽出器がタイル規則を読めている証拠)', () => {
    for (const sel of [
      '.nl-story-userlane-cell',
      ".nl-story-userlane-cell[data-thumb='0'] .nl-story-userlane-avatar",
      '.nl-story-userlane-meta[data-stats]::after',
      '.nl-story-userlane-cell[data-pulse]::after',
      '.nl-story-userlane-cell.is-gifted',
      '.nl-story-userlane-cell.is-hot',
      '.nl-story-userlane-guide__legend'
    ]) {
      for (const [name, c] of Object.entries(css)) expect(c.selectors.has(sel), `${name}: ${sel}`).toBe(true);
    }
  });
});

describe('セレクタ集合: 3ファイルの差は宣言した意図的な差と【完全に一致】する', () => {
  const flagsOf = (s) =>
    (css.popup.selectors.has(s) ? 'P' : '-') + (css.liveView.selectors.has(s) ? 'L' : '-') + (css.venue.selectors.has(s) ? 'V' : '-');
  const all = new Set([...css.popup.selectors, ...css.liveView.selectors, ...css.venue.selectors]);
  const actual = new Map([...all].map((s) => [s, flagsOf(s)]).filter(([, f]) => f !== 'PLV'));
  const expected = new Map(EXPECTED_SELECTOR_DIFFS.map((d) => [d.sel, d.has]));

  it('宣言に無い差が無い(新しく足した規則が一部のファイルにしか無い=輸入の写し忘れ)', () => {
    const undeclared = [...actual].filter(([s, f]) => expected.get(s) !== f).map(([s, f]) => `${f}  ${s}`);
    expect(undeclared, 'P=popup / L=live-view / V=venue(区間)。無いファイルは - で表示').toEqual([]);
  });

  it('宣言したのに差が無くなった/変わった宣言が無い(古い宣言を残さない)', () => {
    const stale = [...expected].filter(([s, f]) => actual.get(s) !== f).map(([s, f]) => `宣言 ${f} だが実際は ${actual.get(s) ?? 'PLV(差なし)'}  ${s}`);
    expect(stale).toEqual([]);
  });

  it('宣言には全て理由があり、status は intended/unreviewed のどちらか', () => {
    for (const d of EXPECTED_SELECTOR_DIFFS) {
      expect(d.why.length, d.sel).toBeGreaterThan(1);
      expect(['intended', 'unreviewed']).toContain(d.status);
    }
  });
});

describe('keyframes と reduced-motion', () => {
  const laneKeyframes = (c) => [...c.keyframes].filter((k) => k.startsWith('nl-lane-')).sort();
  it('nl-lane-* の @keyframes 名が3ファイルで一致', () => {
    expect(laneKeyframes(css.liveView)).toEqual(laneKeyframes(css.popup));
    expect(laneKeyframes(css.venue)).toEqual(laneKeyframes(css.popup));
  });
  it('prefers-reduced-motion で animation:none になるクラス集合が3ファイルで一致', () => {
    const f = (c) => [...c.reducedMotionNone].sort();
    expect(f(css.liveView)).toEqual(f(css.popup));
    expect(f(css.venue)).toEqual(f(css.popup));
  });
});

describe('--nl-lane-* トークンの定義(名前と、popup/live-view の light+dark+mega 局所の数)', () => {
  const venueSrc = readNormalized(LANE_CSS_FILES.venue);
  it('必須トークンが3ファイルで定義されている(会場は区間外の変数ブロックも含めファイル全体で探す)', () => {
    for (const t of REQUIRED_TOKENS) {
      expect(css.popup.tokenDefs.get(t) || 0, `popup ${t}`).toBeGreaterThan(0);
      expect(css.liveView.tokenDefs.get(t) || 0, `live-view ${t}`).toBeGreaterThan(0);
      expect(new RegExp(`${t}\\s*:`).test(stripCssComments(venueSrc)), `venue ${t}`).toBe(true);
    }
  });
  it('popup と live-view の定義数が一致する(light/dark/mega の入れ忘れを検出)。差は --nl-lane-avatar-anon だけ(live-view は inline で上書きしない=意図的に 26px)', () => {
    for (const t of REQUIRED_TOKENS) {
      if (t === '--nl-lane-avatar-anon') continue;
      expect(css.liveView.tokenDefs.get(t) || 0, t).toBe(css.popup.tokenDefs.get(t) || 0);
    }
    expect(css.popup.tokenDefs.get('--nl-lane-avatar-anon')).toBeGreaterThan(css.liveView.tokenDefs.get('--nl-lane-avatar-anon'));
  });
  it('stats/pulse の light と dark が popup と live-view に2つ以上ずつある', () => {
    for (const t of ['--nl-lane-stats', '--nl-lane-pulse-gift', '--nl-lane-pulse-hot']) {
      expect(css.popup.tokenDefs.get(t), `popup ${t}`).toBeGreaterThanOrEqual(2);
      expect(css.liveView.tokenDefs.get(t), `live-view ${t}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('抽出器そのものの自己検査(fail-closed・偽陽性/偽陰性の芽)', () => {
  it('コメント内のセレクタ・{ } を拾わない', () => {
    const c = collectLaneCss(stripCssComments('/* .nl-story-userlane-x { color: red } */ .nl-story-userlane-a { color: blue }'));
    expect([...c.selectors]).toEqual(['.nl-story-userlane-a']);
  });
  it('カンマ区切り・引用符・> の空白を正規化し、会場の接頭辞を外す', () => {
    expect(normalizeSelector('.nlsb-venue-lane-stack .nl-story-userlane-cell[data-thumb="0"]>.x')).toBe(".nl-story-userlane-cell[data-thumb='0'] > .x");
    expect(normalizeSelector('.nlsb-venue-lane-stack.nl-story-userlane-stack')).toBe('.nl-story-userlane-stack');
    const c = collectLaneCss('.nl-story-userlane-a, .nl-story-userlane-b { color: red }');
    expect([...c.selectors].sort()).toEqual(['.nl-story-userlane-a', '.nl-story-userlane-b']);
  });
  it('@media 内の規則も読み、reduced-motion の animation:none を別集合に取る・@keyframes は名前だけ', () => {
    const c = collectLaneCss('@keyframes nl-lane-x { 0% { top: 0 } 100% { top: 1px } } @media (prefers-reduced-motion: reduce) { .nl-story-userlane-a { animation: none; } } .nl-story-userlane-b { animation: spin 1s; }');
    expect([...c.keyframes]).toEqual(['nl-lane-x']);
    expect([...c.reducedMotionNone]).toEqual(['.nl-story-userlane-a']);
    expect(c.selectors.has('.nl-story-userlane-b')).toBe(true);
  });
  it('会場形の死んだコピー(popup 内の .nlsb-venue-lane-stack 規則)は dropVenuePrefixed で捨てられる', () => {
    const c = collectLaneCss('.nlsb-venue-lane-stack .nl-story-userlane-a { color: red } .nl-story-userlane-b { color: red }', { dropVenuePrefixed: true });
    expect([...c.selectors]).toEqual(['.nl-story-userlane-b']);
  });
  it('{ } が対応していない CSS は throw する', () => {
    expect(() => collectLaneCss('.nl-story-userlane-a { color: red ')).toThrow();
  });
  it('行頭の素の <style> だけを取り、コメント中の "<style>" 言及は取らない。<style> が無ければ throw', () => {
    const html = '<!-- <style> の話 -->\n<head>\n    <style>\n      .nl-story-userlane-a { color: red }\n    </style>\n</head>';
    expect(extractStyleBlocks(html)).toContain('.nl-story-userlane-a');
    expect(extractStyleBlocks(html)).not.toContain('の話');
    expect(() => extractStyleBlocks('<p>no style</p>')).toThrow();
  });
  it('LANE_CSS_SYNC 区間: END 欠落・順序逆・${ ・バッククォートは throw(slice(begin,-1) で全文を見て緑になる穴を塞ぐ)', () => {
    const ok = '/* LANE_CSS_SYNC_BEGIN x */\n.a{}\n/* LANE_CSS_SYNC_END */';
    expect(extractVenueSyncCss(ok)).toContain('.a{}');
    expect(() => extractVenueSyncCss('/* LANE_CSS_SYNC_BEGIN x */\n.a{}')).toThrow();
    expect(() => extractVenueSyncCss('/* LANE_CSS_SYNC_END */ /* LANE_CSS_SYNC_BEGIN x */')).toThrow();
    expect(() => extractVenueSyncCss('/* LANE_CSS_SYNC_BEGIN x */ .a{ content: "${x}" } /* LANE_CSS_SYNC_END */')).toThrow();
    expect(() => extractVenueSyncCss('/* LANE_CSS_SYNC_BEGIN x */ .a{ content: `x` } /* LANE_CSS_SYNC_END */')).toThrow();
    // 文章中の "LANE_CSS_SYNC_BEGIN"(開始子 /* を伴わない)には当たらない
    expect(() => extractVenueSyncCss('* LANE_CSS_SYNC_BEGIN の説明 */ .a{}')).toThrow();
  });
});
