/**
 * laneCssSource — 応援レーン(タイル)CSS を3ファイル(popup.html / venueBar.js / app/live-view.html)から
 * 「集合」として取り出す純関数群。laneCssSync.parity.test.js が使う。
 *
 * ■ なぜ文字列 toContain の列挙でなく集合か
 *   手書き toContain は「新しいセレクタを足したとき、列挙も足さないと黙って通る」。
 *   ここでは 3 ファイルから規則を機械的に取り出し、集合差そのものを赤にする(契約に無い差は全部赤)。
 * ■ 値は比較しない(会場・別窓は意図して寸法/色が違う: 例 live-view の後列 anon=26px)。
 *   比較するのは「どのセレクタ/トークン名/keyframes/reduced-motion 無効化があるか」だけ。
 * ■ fail-closed: 見つからない・0件のときは throw(空集合の比較=恒真の緑を作らない)。
 *
 * @module laneCssSource
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 検査の対象は3ファイルに固定する(extension/status.html は死んだ古いコピーなので対象外)。 */
export const LANE_CSS_FILES = Object.freeze({
  popup: 'extension/popup.html',
  venue: 'src/extension/venueBar.js',
  liveView: 'app/live-view.html'
});

/** CRLF/LF 混在に耐えるため、読んだら必ず LF に正規化する。 */
export function readNormalized(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
}

/** CSS のブロックコメントを除去する(コメント内の同名セレクタ・`{` を拾わない)。 */
export function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** HTML から <style> 本体(行頭の素の <style> 〜 </style>)を連結して返す。コメント中の "<style>" 言及は拾わない。 */
export function extractStyleBlocks(html) {
  const re = /^[ \t]*<style[^>]*>[ \t]*$([\s\S]*?)^[ \t]*<\/style>[ \t]*$/gm;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  if (!out.length) throw new Error('<style> ブロックが見つからない');
  return out.join('\n');
}

/**
 * venueBar.js の LANE_CSS_SYNC 区間(BEGIN〜END)を返す。
 *   ★開始子まで含めて探す(文章中の "LANE_CSS_SYNC_BEGIN" に当たらない)。END が無い/順序が逆なら throw
 *   (END が無いまま slice(begin,-1) で全文を見て緑になる穴を塞ぐ)。
 *   ★区間内に `${` / バッククォート / バックスラッシュがあれば throw(テンプレ文字列の補間は静的に読めない)。
 */
export function extractVenueSyncCss(src) {
  const begin = src.indexOf('/* LANE_CSS_SYNC_BEGIN');
  const end = src.indexOf('/* LANE_CSS_SYNC_END */');
  if (begin < 0 || end < 0 || end <= begin) throw new Error('LANE_CSS_SYNC の BEGIN/END が揃っていない');
  const seg = src.slice(begin, end);
  if (/\$\{|`|\\/.test(seg)) throw new Error('LANE_CSS_SYNC 区間に ${ / バッククォート / バックスラッシュがある');
  return seg;
}

/** セレクタを比較用に正規化する。 */
export function normalizeSelector(sel) {
  let s = sel.replace(/\s+/g, ' ').trim().replace(/"/g, "'").replace(/\s*>\s*/g, ' > ');
  // 会場は全て .nlsb-venue-lane-stack 配下に写してある(stack 自身は連結形)。
  if (s.startsWith('.nlsb-venue-lane-stack ')) s = s.slice('.nlsb-venue-lane-stack '.length);
  else if (s.startsWith('.nlsb-venue-lane-stack.')) s = s.slice('.nlsb-venue-lane-stack'.length);
  return s;
}

/** 括弧対応で { } を読み、{prelude, body} の配列にする(1階層)。 */
function splitBlocks(css) {
  const blocks = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = -1;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0) bodyStart = i + 1;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        blocks.push({ prelude: css.slice(preludeStart, bodyStart - 1).trim(), body: css.slice(bodyStart, i) });
        preludeStart = i + 1;
      }
      if (depth < 0) throw new Error('CSS の { } が対応していない');
    } else if (ch === ';' && depth === 0) {
      preludeStart = i + 1; // @import 等
    }
  }
  if (depth !== 0) throw new Error('CSS の { } が閉じていない');
  return blocks;
}

const isLaneSelector = (s) => /nl-story-userlane|sceneStoryUserLane/.test(s);

/**
 * コメント除去済み CSS から、応援レーンに関する集合を取り出す。
 * @param {string} css
 * @param {{ dropVenuePrefixed?: boolean }} [opts] dropVenuePrefixed: `.nlsb-venue-lane-stack` で始まる規則を捨てる
 *   (popup.html には会場形の死んだコピーが残っている。popup の DOM には存在しない=比較に混ぜない)
 */
export function collectLaneCss(css, opts = {}) {
  const selectors = new Set();
  const keyframes = new Set();
  const reducedMotionNone = new Set();
  /** @type {Map<string, number>} */
  const tokenDefs = new Map();

  const visit = (text, inReducedMotion) => {
    for (const { prelude, body } of splitBlocks(text)) {
      if (prelude.startsWith('@keyframes')) {
        keyframes.add(prelude.replace('@keyframes', '').trim());
        continue;
      }
      if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
        visit(body, inReducedMotion || /prefers-reduced-motion:\s*reduce/.test(prelude));
        continue;
      }
      if (prelude.startsWith('@')) continue;
      const parts = prelude.split(',').map((p) => p.trim()).filter(Boolean);
      for (const raw of parts) {
        if (opts.dropVenuePrefixed && raw.startsWith('.nlsb-venue-lane-stack')) continue;
        if (!isLaneSelector(raw)) {
          // トークン定義(:root など)はセレクタが非レーンでも拾う
          for (const m of body.matchAll(/(--nl-lane-[a-z-]+)\s*:/g)) {
            if (!/^--nl-lane-accent-/.test(m[1])) tokenDefs.set(m[1], (tokenDefs.get(m[1]) || 0) + 1);
          }
          continue;
        }
        const sel = normalizeSelector(raw);
        selectors.add(sel);
        if (inReducedMotion && /animation:\s*none/.test(body)) reducedMotionNone.add(sel);
        for (const m of body.matchAll(/(--nl-lane-[a-z-]+)\s*:/g)) {
          if (!/^--nl-lane-accent-/.test(m[1])) tokenDefs.set(m[1], (tokenDefs.get(m[1]) || 0) + 1);
        }
      }
    }
  };
  visit(css, false);
  return { selectors, keyframes, reducedMotionNone, tokenDefs };
}

/** 3ファイル分を読んで集合にする(各ファイルで 0件なら throw)。 */
export function loadAllLaneCss() {
  const popup = collectLaneCss(stripCssComments(extractStyleBlocks(readNormalized(LANE_CSS_FILES.popup))), { dropVenuePrefixed: true });
  const liveView = collectLaneCss(stripCssComments(extractStyleBlocks(readNormalized(LANE_CSS_FILES.liveView))), { dropVenuePrefixed: true });
  const venue = collectLaneCss(stripCssComments(extractVenueSyncCss(readNormalized(LANE_CSS_FILES.venue))));
  for (const [name, c] of Object.entries({ popup, liveView, venue })) {
    if (c.selectors.size === 0) throw new Error(`${name}: 応援レーンのセレクタが0件(抽出の空振り)`);
  }
  return { popup, venue, liveView };
}
