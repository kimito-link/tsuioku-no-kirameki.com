// @ts-nocheck — テキスト/パス解析の純ロジック(I/O は呼び出し側)
/**
 * 公開ページ(LP/記事/docs)の「内部リンク健全性」を検証する純ロジック(2026-06-18)。
 *
 * 狙い(COUNCIL bug-proof-map-SYNTHESIS の第1コミット):
 *   公開HTML/MD の【相対内部リンク】の参照先が実在するかをディスク照合し、リンク切れを未然に防ぐ。
 *   外部リンク(http/https)は叩かない=ネットワーク非依存・プライバシー/CWS/オフライン安全。
 *
 * 純関数だけ置く(fs に触らない)。実在確認は呼び出し側が `exists(path)` を注入する。
 * これにより happy-dom 等を使わずテスト可能(scan-dead-lib.mjs と同じ自前静的解析の流儀)。
 */

/**
 * 1ファイル分のテキストから「相対内部リンク」を抽出する。
 * - HTML: href="..." / src="..."(.html/.md/相対パスのみ)
 * - Markdown: [text](path) / 直書き path
 * 除外: http(s):// / // / mailto: / tel: / data: / # アンカーのみ / 空。
 *
 * @param {string} text ファイル本文
 * @param {{ html?: boolean }} [opts] html=true なら href/src 属性を見る(既定は拡張子で自動判定不可なので明示)
 * @returns {string[]} 相対リンク(クエリ/アンカーは除去済み・重複は残す=出現箇所の手掛かり)
 */
export function extractInternalLinks(text, opts = {}) {
  const s = String(text || '');
  const out = [];
  const isHtml = opts.html === true;

  /** @param {string} raw */
  const consider = (raw) => {
    let v = String(raw || '').trim();
    if (!v) return;
    // 外部・特殊スキームは除外
    if (/^(https?:)?\/\//i.test(v)) return;
    if (/^(mailto:|tel:|data:|javascript:|#)/i.test(v)) return;
    // クエリ・アンカーを落とす
    v = v.split('#')[0].split('?')[0].trim();
    if (!v) return;
    // 相対の文書リンクだけ対象(.html / .md / 拡張子なしディレクトリ links は対象外にして誤検知を避ける)
    if (!/\.(html?|md)$/i.test(v)) return;
    out.push(v);
  };

  if (isHtml) {
    const re = /(?:href|src)\s*=\s*"([^"]+)"|(?:href|src)\s*=\s*'([^']+)'/gi;
    let m;
    while ((m = re.exec(s)) != null) consider(m[1] || m[2]);
  } else {
    // Markdown のリンク [text](path) と <path>
    const reMd = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let m;
    while ((m = reMd.exec(s)) != null) consider(m[1]);
    const reAngle = /<([^>\s:]+\.(?:html?|md))>/gi;
    while ((m = reAngle.exec(s)) != null) consider(m[1]);
  }
  return out;
}

/**
 * 参照元ファイルからの相対リンクを、リポジトリ相対の正規パスへ解決する(純粋・OS非依存)。
 * 例: from="tsuioku-no-kirameki/articles/index.html", link="ndgr.html"
 *     → "tsuioku-no-kirameki/articles/ndgr.html"
 * 例: link="../privacy.html" → "tsuioku-no-kirameki/privacy.html"
 *
 * @param {string} fromRepoPath 参照元のリポジトリ相対パス(/ 区切り)
 * @param {string} link 抽出した相対リンク
 * @returns {string} 正規化したリポジトリ相対パス(/ 区切り)
 */
export function resolveRelativeLink(fromRepoPath, link) {
  const fromDir = String(fromRepoPath || '').split('/').slice(0, -1);
  const parts = String(link || '').split('/');
  const stack = [...fromDir];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

/**
 * リンクの解決候補を返す(著者の書き方が混在するため複数試す):
 *  ①参照元ディレクトリからの相対(href の正攻法)
 *  ②リポジトリルートからの相対(docs などで `docs/x.md` と root 起点で書く流儀)
 * いずれかが実在すれば健全とみなす。
 * @param {string} fromRepoPath
 * @param {string} link
 * @returns {string[]} 重複排除した解決候補(リポジトリ相対)
 */
export function resolveLinkCandidates(fromRepoPath, link) {
  const fileRel = resolveRelativeLink(fromRepoPath, link);
  // ルート起点候補: 先頭の ./ や / を除いた素のパスを正規化
  const rootRel = resolveRelativeLink('', link);
  return [...new Set([fileRel, rootRel].filter(Boolean))];
}

/**
 * 複数ファイルの内部リンクを検証し、参照先がどの候補でも実在しないもの(リンク切れ)を返す純関数。
 *
 * @param {{ path: string, text: string }[]} files 検証対象(path=リポジトリ相対・/ 区切り)
 * @param {(repoPath: string) => boolean} exists リポジトリ相対パスが実在するか(呼び出し側が fs で注入)
 * @returns {{ from: string, link: string, resolved: string }[]} リンク切れ一覧(resolved=ファイル相対候補)
 */
export function findBrokenInternalLinks(files, exists) {
  const broken = [];
  const seen = new Set();
  for (const f of Array.isArray(files) ? files : []) {
    const from = String(f?.path || '');
    if (!from) continue;
    const isHtml = /\.html?$/i.test(from);
    const links = extractInternalLinks(f.text, { html: isHtml });
    for (const link of links) {
      const candidates = resolveLinkCandidates(from, link);
      const key = `${from}\t${link}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!candidates.some((c) => exists(c))) {
        broken.push({ from, link, resolved: candidates[0] });
      }
    }
  }
  return broken;
}
