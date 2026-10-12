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
