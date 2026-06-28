// テキストを「確実に」クリップボードへ入れるためのフォールバック付きコピー。
//   status 状態速報の各コピーボタンが「押してもコピーされない」問題の根治
//   (council なし=実コードで原因特定: navigator.clipboard 失敗時に従来は textarea を
//    select するだけ=ユーザーが Ctrl+C を押さないと入らず「コピーされない」と感じる)。
//
//   方針(星野ロミ式=詰ませない):
//     1) navigator.clipboard.writeText を試す(モダン・非同期)。
//     2) 失敗したら document.execCommand('copy') を試す(クリックハンドラ内なら同期で実際にコピーされる)。
//     3) それも失敗したら textarea を select 状態にして「あとは Ctrl+C」に逃がす。
//   いずれの段で成功したかを返すので、呼び出し側は適切なメッセージを出せる。

/**
 * @typedef {'clipboard'|'execCommand'|'selected'|'failed'} CopyOutcome
 *   clipboard   = navigator.clipboard で成功(自動コピー済み)
 *   execCommand = execCommand('copy') で成功(自動コピー済み)
 *   selected    = 自動コピーは不可だが textarea を選択した(ユーザーが Ctrl+C する)
 *   failed      = テキスト空 or 何もできなかった
 */

/**
 * テキストを可能な限り確実にコピーする。
 *
 * @param {string} text コピーしたい本文
 * @param {{
 *   clipboard?: { writeText?: (t: string) => Promise<void> } | null,
 *   doc?: Document | null,
 *   selectEl?: HTMLTextAreaElement | HTMLInputElement | null
 * }} [io] 副作用の注入(テスト用)。既定は globalThis の navigator.clipboard / document。
 * @returns {Promise<CopyOutcome>}
 */
export async function copyTextWithFallback(text, io = {}) {
  const body = typeof text === 'string' ? text : String(text == null ? '' : text);
  if (!body) return 'failed';

  const g = /** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : {});
  const clipboard =
    io.clipboard !== undefined ? io.clipboard : g.navigator ? g.navigator.clipboard : null;
  const doc = io.doc !== undefined ? io.doc : g.document || null;

  // 1) モダン clipboard API。
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(body);
      return 'clipboard';
    } catch {
      /* フォールバックへ */
    }
  }

  // 2) execCommand('copy')。select 対象があればそれを、無ければ一時 textarea を使う。
  if (doc && typeof doc.execCommand === 'function') {
    const el = io.selectEl || null;
    try {
      if (el && typeof el.select === 'function') {
        el.focus();
        el.select();
        if (doc.execCommand('copy')) return 'execCommand';
      } else if (doc.body && typeof doc.createElement === 'function') {
        const ta = doc.createElement('textarea');
        ta.value = body;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.left = '-9999px';
        doc.body.appendChild(ta);
        ta.focus();
        ta.select();
        let ok = false;
        try {
          ok = doc.execCommand('copy');
        } finally {
          ta.remove();
        }
        if (ok) return 'execCommand';
      }
    } catch {
      /* フォールバックへ */
    }
  }

  // 3) 最後の砦: select 対象があれば選択状態にして Ctrl+C に逃がす。
  const el = io.selectEl || null;
  if (el && typeof el.select === 'function') {
    try {
      el.focus();
      el.select();
      return 'selected';
    } catch {
      /* no-op */
    }
  }
  return 'failed';
}
