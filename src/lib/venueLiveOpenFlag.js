/**
 * venueLiveOpenFlag.js — 「会場モードがいま開いているか」を鏡の供給側へ伝える値。
 *
 * ■ ユーザーの症状(2026-08-17)「会場モードが忠実にでてないね」
 *   実機の会場診断: 席を持つ参加者 3人 / 画面表示中 3人
 *   ところが状態速報は `会場一致 ⚪鏡stale(656s) link7 gift0 ad4 konta0 tanu332`
 *   ＝**11分前・別配信の 332人**が居座っていた。いま3人なのに332人と言う。
 *
 * ■ 真因(コードで確定・実データ不要)
 *   v0.1.1394 で「①POPが隠れていても、会場が開いていれば鏡は書く」と根治した:
 *     popup-entry.js
 *       if (decideHiddenWork({ docHidden: true, venueOpen: isVenueOpenCached() }).publish)
 *   ところが `isVenueOpenCached()` が読む `nls_venue_open` を
 *   **書く側が存在しない**(venueBar.js:6817 が丸ごとコメントアウト):
 *       // ユーザー要望により状態を復元しなくなったため、保存も無効化する
 *       // void chrome.storage.local.set({ [OPEN_STORAGE_KEY]: open })
 *   ＝ venueOpen は常に false → publish 分岐が**一度も通らない** →
 *     会場は永久に古い鏡を見る。**判定はあるのに配線が無い片肺**。
 *   [[unwired-judgement-is-systemic-2026-08-12]]
 *
 * ■ なぜ「復元しない」判断と両立するか(ここが設計の肝)
 *   保存が無効化されたのは【次回起動時に会場を開いた状態へ復元しない】ため。
 *   これはユーザー要望で、変えてはいけない。
 *   ★しかし鏡の供給側が知りたいのは「**いま**開いているか」であって
 *     「次回も開くか」ではない。**目的が違う2つを1つのキーが担っていた**。
 *   → 別キーに分ける。この値は【生存中だけ意味を持つ現在状態】で、
 *     時刻付き＋失効ありにして復元には使えない形にする。
 *   [[shared-key-needs-a-consumer-registry-2026-08-06]]
 *
 * 掟: storage も DOM も触らない(呼び出し側が渡す=テスト可能)。
 *
 * @module venueLiveOpenFlag
 */

/**
 * 「いま開いているか」の storage キー。
 * ★`nls_venue_open`(復元用・書き込み無効)とは【別物】。混ぜないこと。
 */
export const KEY_VENUE_LIVE_OPEN = 'nls_venue_live_open_v1';

/**
 * 書き込む値を作る。
 *
 * @param {boolean} open いま開いたか(true)/閉じたか(false)
 * @param {number} nowMs 現在時刻(epoch ms)
 * @returns {{ open: boolean, at: number }}
 */
export function buildVenueLiveOpenValue(open, nowMs) {
  const at = Number.isFinite(Number(nowMs)) ? Math.floor(Number(nowMs)) : 0;
  return { open: open === true, at };
}

/**
 * 「会場が開いている」と信じてよいかを判定する。
 *
 * ★時刻で失効させる理由: 会場タブがクラッシュ/強制終了すると `false` を書けずに
 *   終わる。その残骸を信じ続けると、会場が閉じているのに①POPが毎tick鏡を書き続け、
 *   v0.1.1394→1397 で撤回した「余計な負荷」を再発させる
 *   (実測: 描き直し14,965回・self_write_skipped 89%)。
 *   会場が生きていれば定期的に書き直されるので、失効は安全側に働く。
 *
 * @param {unknown} raw storage の生値
 * @param {number} nowMs 現在時刻
 * @param {number} [maxAgeMs] これより古い印は信じない(既定90秒)
 * @returns {boolean}
 */
export function isVenueLiveOpen(raw, nowMs, maxAgeMs = 90_000) {
  if (!raw || typeof raw !== 'object') return false;
  const o = /** @type {{ open?: unknown, at?: unknown }} */ (raw);
  if (o.open !== true) return false;
  const at = Number(o.at);
  const now = Number(nowMs);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return false;
  const age = now - at;
  // 未来の時刻(時計ズレ)は 0 扱いにして通す。過去に古すぎるものだけ落とす。
  if (age < 0) return true;
  return age <= Math.max(0, Number(maxAgeMs) || 0);
}
