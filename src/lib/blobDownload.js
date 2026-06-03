/**
 * Blob を指定ファイル名で保存する。
 *
 * chrome.downloads + blob: URL は「ダウンロード前に保存場所を確認」設定時に
 * 保存ダイアログの既定名が UUID（createObjectURL の末尾）になることがある。
 * HTML/マーケレポートは <a download="..."> を正本にする。
 */

/**
 * @param {string} filename
 * @returns {string} ベース名のみ（パス不可・禁止文字除去）
 */
export function normalizeDownloadBasename(filename) {
  let base = String(filename || 'download.html')
    .replace(/\\/g, '/')
    .split('/')
    .pop() || 'download.html';
  base = base.replace(/[/\\:*?"<>|]/g, '_').replace(/\.\./g, '').trim();
  if (!base) base = 'download.html';
  if (!/\.\w{1,8}$/i.test(base)) base = `${base}.html`;
  return base.slice(0, 180);
}

/**
 * @param {Blob} blob
 * @param {string} filename
 * @param {Document} doc
 * @returns {{ ok: boolean, blobUrl: string, safeName: string }}
 */
export function triggerAnchorBlobDownload(blob, filename, doc = document) {
  if (!blob || !doc?.body) {
    return { ok: false, blobUrl: '', safeName: normalizeDownloadBasename(filename) };
  }
  const safeName = normalizeDownloadBasename(filename);
  const blobUrl = URL.createObjectURL(blob);
  try {
    const a = doc.createElement('a');
    a.href = blobUrl;
    a.download = safeName;
    a.rel = 'noopener';
    a.style.display = 'none';
    doc.body.appendChild(a);
    a.click();
    a.remove();
    return { ok: true, blobUrl, safeName };
  } catch {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      /* no-op */
    }
    return { ok: false, blobUrl: '', safeName };
  }
}
