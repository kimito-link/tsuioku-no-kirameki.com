/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】WEB共有の鍵ファイル(JSON)の検査と取り出し
 * 【この箱に入らないもの】ファイル読み込み・storage・DOM
 * 【書けるstorageキー】なし
 * 【正本宣言】鍵ファイルの形の検査はこのファイルのみ
 *
 * ★なぜ(2026-10-14): 状態画面の「WEB共有の設定」へ鍵を貼れない環境がある(貼り付けが通らない・遠隔操作など)。
 *   貼り付けなしで入れられるよう、JSON ファイルを選ぶだけで読み込む入口を足した。値はログにも画面にも出さない。
 * @module shareKeysFile
 */

const MAX_LEN = 300;

/**
 * @param {unknown} text JSON 文字列 {"ingestKey":"…","viewToken":"…","appOrigin":"https://…"(省略可)}
 * @returns {{ ok: true, ingestKey: string, viewToken: string, appOrigin: string } | { ok: false, error: string }}
 */
export function parseShareKeysFile(text) {
  let obj;
  try {
    obj = JSON.parse(String(text ?? ''));
  } catch {
    return { ok: false, error: 'JSON として読めません' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: '形が違います' };
  const o = /** @type {Record<string, unknown>} */ (obj);
  const take = (/** @type {string} */ k) => (typeof o[k] === 'string' ? /** @type {string} */ (o[k]).trim() : '');
  const ingestKey = take('ingestKey');
  const viewToken = take('viewToken');
  const appOrigin = take('appOrigin');
  if (!ingestKey || !viewToken) return { ok: false, error: 'ingestKey と viewToken が必要です' };
  if (ingestKey.length > MAX_LEN || viewToken.length > MAX_LEN || appOrigin.length > MAX_LEN) {
    return { ok: false, error: '値が長すぎます' };
  }
  if (appOrigin && !/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(appOrigin)) {
    return { ok: false, error: 'appOrigin は https://ホスト名 の形にしてください' };
  }
  return { ok: true, ingestKey, viewToken, appOrigin };
}
