/**
 * liveDetailView.js — `/live/` 配信詳細モーダルの純ロジック(DOM を触らない)。
 *
 * ★2026-09-26: council-fable(5体会議→Fable設計)で確定した設計の実装。
 *   正本設計書 = `_docs/live-detail-modal-DESIGN.md`。
 *   このファイルの責務は「URL クエリの読み書き」「配信データの検索」「バナー文言の状態遷移」
 *   だけ(check-layer.mjs の対象。document/window/fetch/location/history を参照しない)。
 *   DOM 操作・モーダルの開閉は呼び出し元(live-ranking-entry.js)が担う。
 */

import { LIVE_ID_RE, freshness } from './liveRankingView.js';

/**
 * `?lv=…&detail=1` を読む。lv が形に合わなければ lv:'' detail:false(エラーにしない)。
 * ★lv が無いのに detail=1 だけあっても detail:false にする(開く対象が無いため)。
 * @param {string} search location.search 相当(先頭 '?' の有無どちらでも可)
 * @returns {{ lv: string, detail: boolean }}
 */
export function readDetailQuery(search) {
  try {
    const params = new URLSearchParams(String(search || ''));
    const lv = String(params.get('lv') || '').trim().toLowerCase();
    const validLv = LIVE_ID_RE.test(lv) ? lv : '';
    const detail = validLv !== '' && params.get('detail') === '1';
    return { lv: validLv, detail };
  } catch {
    return { lv: '', detail: false };
  }
}

/**
 * 現在の search に lv と detail=1 を上書きした search 文字列('?' 付き)。他のパラメータは保つ。
 * ★lv が不正な形式なら search をそのまま返す(呼び出し側はこれを見て pushState しない判断ができる)。
 * @param {string} search
 * @param {string} lv
 * @returns {string}
 */
export function withDetail(search, lv) {
  const id = String(lv || '').trim().toLowerCase();
  if (!LIVE_ID_RE.test(id)) return String(search || '');
  try {
    const params = new URLSearchParams(String(search || ''));
    params.set('lv', id);
    params.set('detail', '1');
    const s = params.toString();
    return s ? `?${s}` : '';
  } catch {
    return String(search || '');
  }
}

/**
 * detail を除いた search('?' 付き。空なら '')。lv は残す(一覧の先頭固定は生かす)。
 * @param {string} search
 * @returns {string}
 */
export function withoutDetail(search) {
  try {
    const params = new URLSearchParams(String(search || ''));
    params.delete('detail');
    const s = params.toString();
    return s ? `?${s}` : '';
  } catch {
    return '';
  }
}

/**
 * data.lives から lv を探す。★大小文字・空白を正規化(liveRankingView.pinLiveFirst と同じ比較)。
 * 無ければ null。data が壊れていても例外を投げない(呼び出し側は必ず null 分岐を持つ設計)。
 * @param {unknown} data /api/live-ranking の応答
 * @param {string} lv
 * @returns {any|null}
 */
export function findLive(data, lv) {
  const id = String(lv || '').trim().toLowerCase();
  if (!id) return null;
  const lives = data && typeof data === 'object' && Array.isArray(/** @type {any} */ (data).lives)
    ? /** @type {any} */ (data).lives
    : null;
  if (!lives) return null;
  for (const l of lives) {
    const cur = String((l && l.liveId) || '').trim().toLowerCase();
    if (cur === id) return l;
  }
  return null;
}

/**
 * @typedef {'ok'|'missing'|'missing-empty'|'error'} DetailBannerKind
 */

/**
 * モーダル上部のバナー(1行)の状態と文言。表示判断をここに集める(呼び出し側は kind で
 * class を付けるだけ)。
 *
 * ★「find の外れは異常ではなく通常状態」という設計原則(配信は60秒ごとに終わる・
 *   MAX_LIVES=20から押し出される)に基づき、found:false を例外扱いしない。
 * ★found のときは fetchError を無視する(古いエラーを引きずらない)。
 * ★文言は「放送が終わった」と断定しない(圏外落ちの可能性もあるため両論で書く)。
 *
 * @param {{ found: boolean, snapshotAt: number, fetchError: string }} s
 * @param {number} nowMs
 * @returns {{ kind: DetailBannerKind, text: string }}
 */
export function detailBanner(s, nowMs) {
  const found = !!(s && s.found);
  const snapshotAt = Number(s && s.snapshotAt) || 0;
  const fetchError = String((s && s.fetchError) || '');
  if (found) return { kind: 'ok', text: '' };
  if (fetchError && snapshotAt > 0) {
    const f = freshness(snapshotAt, nowMs);
    const ago = f.text ? f.text.replace(/^⚠ /, '').replace(/ 更新$/, '') : '直前';
    return { kind: 'error', text: `最新の取得に失敗したわ（${fetchError}）。${ago}の情報を表示中` };
  }
  if (snapshotAt > 0) {
    const f = freshness(snapshotAt, nowMs);
    const ago = f.text ? f.text.replace(/^⚠ /, '').replace(/ 更新$/, '') : '直前';
    return {
      kind: 'missing',
      text: `この配信はいまの一覧に見当たらないわ（放送が終わったか、上位から外れたみたい）。最後に取れた${ago}の情報をそのまま出しているわ`
    };
  }
  return {
    kind: 'missing-empty',
    text: 'この配信の情報はいま取れていないわ。放送が終わったか、まだ一覧に載っていないみたい'
  };
}
