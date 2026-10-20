import { escapeHtml } from '../shared/html/escape.js';

/** メディアキットを分析レポートの1章として埋め込むときの、CSS の囲い(id)。 */
export const MEDIA_KIT_EMBED_SCOPE = '#mkt-media-kit';

/**
 * CSS の全セレクタの前に scope を付ける(マーケ側の CSS・要素セレクタと混ざらないように)。
 * :root と body は scope 自身、`*` は scope 配下の全要素に読み替える。@media は中身を再帰で処理する。
 * メディアキットの CSS は単純(文字列内に波括弧を含まない)を前提にした最小実装。
 * @param {string} css
 * @param {string} scope
 * @returns {string}
 */
export function scopeCss(css, scope) {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    // 対応する閉じ括弧を探す(入れ子あり)
    let depth = 1;
    let j = open + 1;
    while (j < n && depth > 0) {
      const ch = css[j];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      j++;
    }
    const inner = css.slice(open + 1, j - 1);
    if (head.startsWith('@media') || head.startsWith('@supports')) {
      out += `${head}{${scopeCss(inner, scope)}}`;
    } else if (head.startsWith('@')) {
      out += `${head}{${inner}}`;
    } else {
      const sel = head
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          if (s === ':root' || s === 'html' || s === 'body') return scope;
          if (s === '*') return `${scope} *`;
          return `${scope} ${s}`;
        })
        .join(',');
      out += `${sel}{${inner}}`;
    }
    i = j;
  }
  return out;
}

/**
 * buildMediaKitHtml が作った単体 HTML から、CSS と <main> の中身を取り出す。
 * @param {string} kitHtml
 * @returns {{ css: string, bodyHtml: string } | null}
 */
export function extractMediaKitParts(kitHtml) {
  const html = String(kitHtml || '');
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  const mainMatch = html.match(/<main>([\s\S]*)<\/main>/);
  if (!styleMatch || !mainMatch) return null;
  return { css: styleMatch[1], bodyHtml: mainMatch[1] };
}

/**
 * 分析レポートの1章(#mkt-media-kit)としてメディアキットを出す。取り出せなければ空文字(章ごと出さない)。
 * @param {string} kitHtml
 * @returns {string}
 */
export function sectionMediaKitHtml(kitHtml) {
  const parts = extractMediaKitParts(kitHtml);
  if (!parts) return '';
  const css = scopeCss(parts.css, MEDIA_KIT_EMBED_SCOPE);
  return `<section class="mkt-section" id="mkt-media-kit-section">
<h2>${escapeHtml('メディアキット（共有用の実績サマリ）')}</h2>
<p class="mkt-note">スポンサーや仲間への共有用に、過去30日・60日・90日の配信実績をまとめた章です。</p>
<div id="mkt-media-kit"><style>${css}</style>${parts.bodyHtml}</div>
</section>`;
}
