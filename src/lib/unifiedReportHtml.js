import { escapeHtml, escapeAttr } from '../shared/html/escape.js';

/**
 * 分析レポート(マーケ)とメディアキットを、1つの HTML にまとめる(CSS だけのタブ・script 無し)。
 * 各文書は iframe の srcdoc に入れる=それぞれの CSS・CSP(メディアキットは default-src 'none')が衝突しない。
 * 外側の文書には CSP を付けない(srcdoc は親の CSP を継承し、子の画像・スタイルを塞ぐため)。
 * 外側は script を一切持たない。
 *
 * @param {{ title: string, marketingHtml: string, mediaKitHtml?: string }} input
 * @returns {string}
 */
export function buildUnifiedReportHtml(input) {
  const title = String(input?.title ?? '').trim() || '追憶レポート';
  const marketingHtml = String(input?.marketingHtml ?? '');
  const mediaKitHtml = String(input?.mediaKitHtml ?? '');
  const hasKit = mediaKitHtml.length > 0;

  /** @param {string} id @param {string} doc @param {string} label */
  const frame = (id, doc, label) =>
    `<iframe id="${id}" class="panel" title="${escapeAttr(label)}" srcdoc="${escapeAttr(doc)}"></iframe>`;

  const tabs = hasKit
    ? `<input type="radio" name="tab" id="tab-mkt" checked>
<input type="radio" name="tab" id="tab-kit">
<nav class="tabs" aria-label="レポートの切り替え">
  <label for="tab-mkt">分析レポート</label>
  <label for="tab-kit">メディアキット</label>
  <span class="note">※印刷は、いま見ているタブだけが出ます。もう一方は切り替えてから印刷してください。</span>
</nav>`
    : '';

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - 追憶レポート</title>
<style>
  html, body { height: 100%; margin: 0; background: #f4f6f8; font-family: system-ui, "Hiragino Sans", "Yu Gothic UI", sans-serif; }
  body { display: flex; flex-direction: column; }
  input[type="radio"] { position: absolute; opacity: 0; pointer-events: none; }
  .tabs { display: flex; align-items: center; gap: 4px; padding: 8px 12px 0; background: #fff; border-bottom: 1px solid #dce3ea; }
  .tabs label { padding: 8px 16px; border: 1px solid #dce3ea; border-bottom: 0; border-radius: 8px 8px 0 0; background: #eef2f6; color: #3c4858; font-weight: 700; cursor: pointer; }
  .tabs .note { margin-left: auto; font-size: 11px; color: #6b7686; }
  #tab-mkt:checked ~ .tabs label[for="tab-mkt"],
  #tab-kit:checked ~ .tabs label[for="tab-kit"] { background: #fff; color: #0f8fd8; border-bottom: 2px solid #fff; margin-bottom: -1px; }
  #tab-mkt:focus-visible ~ .tabs label[for="tab-mkt"],
  #tab-kit:focus-visible ~ .tabs label[for="tab-kit"] { outline: 2px solid #0f8fd8; }
  .panel { flex: 1 1 auto; width: 100%; min-height: 0; border: 0; background: #fff; }
  ${hasKit ? '#frame-kit { display: none; }\n  #tab-kit:checked ~ #frame-kit { display: block; }\n  #tab-kit:checked ~ #frame-mkt { display: none; }' : ''}
  @media print {
    .tabs { display: none; }
    html, body { height: auto; }
    .panel { height: auto; }
  }
</style>
</head>
<body>
${tabs}
${frame('frame-mkt', marketingHtml, '分析レポート')}
${hasKit ? frame('frame-kit', mediaKitHtml, 'メディアキット') : ''}
</body>
</html>
`;
}
