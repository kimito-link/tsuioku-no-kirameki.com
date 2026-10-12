/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】popup の保存通知(onChanged)で「描き直しの引き金にしてよいか」の分類の一部
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】「間引き側に回すキー」の一覧はこのファイルのみ
 *
 * 設計 V3(docs/handoff/stable-update-model-IMPLEMENTATION-HANDOFF.md)の一部。
 *
 * ★なぜ要るか(2026-10-12 実測・同じ配信を60秒)
 *   サイドパネルの描き直し 214 回のうち、`allHighFreq=false`(= 450ms 間引きを素通りして即時実行)
 *   になった storage_changed の主犯は、描き直しに使われない診断キーと、書き込みが多いデータキーだった:
 *     nls_backfill_live_metric_v1 ×9 / nls_user_comment_profile_v1 ×8 / nls_gift_* ×5 / nls_instant_push_diag_v1 ×3 …
 *   ・診断キーは selfWrittenStorageKeys.js(=描き直さない)へ(そちらに追加済み)。
 *   ・データキーは「描き直しは要るが、1回ごとに即時でなくてよい」=間引き側(throttle)へ。ここで判定する。
 *
 * 未知のキーは従来どおり即時側(設定トグルの即時反映を壊さない)。ここに足すのは実測で名指しされたものだけ。
 */

const THROTTLED_EXTRA_PATTERNS = Object.freeze([
  // 全員分のプロフィール表(約330KB)。popup 自身も書くため、変更のたびの即時描き直しは不要。
  /^nls_user_comment_profile_v\d+$/i,
  // content がギフトの度に書く。表示は 450ms 遅れても支障がない。
  /^nls_gift_history_throws_lv\d{1,15}$/i,
  /^nls_gift_subapp_history_lv\d{1,15}$/i
]);

/**
 * 高頻度に書かれるが即時でなくてよい(間引き側へ回す)キーか。
 * @param {unknown} key
 * @returns {boolean}
 */
export function isThrottledExtraStorageKey(key) {
  const k = String(key == null ? '' : key);
  if (!k) return false;
  return THROTTLED_EXTRA_PATTERNS.some((re) => re.test(k));
}

/*
 * ★v0.1.1604(設計V3b): 「描き直しは要るが、1回が重いので 3 秒に1回で足りる」キー(=遅い側)。
 *   実データ入り(実機の保存データ 43MB を複製した環境)で、サイドパネルの safeRefresh が 30 秒に 74 回(2.5回/秒)。
 *   描き直し1回=約 0.35 秒(保存データの読み込み約 40 回を含む)なので、メインスレッドの 87% を使い切っていた。
 *   主犯(30秒): score_announce_diag ×14 / report_preview ×14 / live_broadcaster_ctx ×12 / live_ended ×7 / event_dom ×6。
 *   前2者は診断・自己書き込み(selfWrittenStorageKeys.js へ)。残りは描画が読むが、最後の1回が 3 秒以内に
 *   必ず描かれれば足りる(コメント本文は別経路=高頻度側のまま 450ms)。演出(event_dom)は別の即時経路で反映済み。
 */
const SLOW_PATTERNS = Object.freeze([
  /^nls_live_broadcaster_ctx_v\d+$/i,
  /^nls_live_ended_lv\d{1,15}$/i,
  /^nls_event_dom_lv\d{1,15}$/i
]);

/**
 * 遅い側(3 秒に1回)でよいキーか。
 * @param {unknown} key
 * @returns {boolean}
 */
export function isSlowStorageKey(key) {
  const k = String(key == null ? '' : key);
  if (!k) return false;
  return SLOW_PATTERNS.some((re) => re.test(k));
}
