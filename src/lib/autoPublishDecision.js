/**
 * ③WEB(純Web公開コピー)が古くなる前に自動で再 publish すべきかを判定する純関数(v0.1.1016)。
 *
 * 背景(ユーザー要望 2026-07-01「POP=応援プレビュー=WEB を同一まで持っていって・手動ボタンの往復を無くす」):
 *   3画面パリティが 🟢 同一にならない唯一の常連原因は ③WEB の web_stale(公開送信が古い)。
 *   ①POP・②応援プレビューは鏡が数秒ごとに新鮮化されるのに、③WEB だけは「🌐このURLをWEBでも公開する」を
 *   手で押さないと更新されず、押し忘れると常に 🟡 保留になる。配信中は status が数秒ごとに再描画し
 *   最新 jsonBlob を組んでいるので、その拍子に【古くなりかけたら自動で1回 POST する】ことで、手動ボタン無しで
 *   ③WEB を新鮮に保てる=常に 🟢 に寄る。
 *
 * ★v0.1.1242(CWS提出ブロッカー BLOCKING-1): 最優先ゲートとして optedIn(明示同意)を追加した。
 *   旧実装のゲートは hasKeys/hasPayload/hasWatchTab/inFlight の4つだけで【同意の条件が
 *   一つも無く】、status ページを開いて視聴しているだけで 120秒ごとに自動送信されていた。
 *   送信内容には第三者(視聴者)のユーザーID・名前・コメント本文が含まれる
 *   (commentTimelineMirror.js の TimelineMirrorRow)。にもかかわらず privacy.html /
 *   docs/releases/cws-submission-texts.md / description-ja.txt / privacy-justifications-ja.txt
 *   の4文書はいずれも「自動送信しない」と明記しており、開示と実挙動が真逆だった。
 *   これは CWS の User Data Policy 違反(修正再提出でなくアイテム停止級)であり、
 *   AGENTS.md §53「データ送信は利用者の明確な同意(オプトイン)に基づく設計とする」にも反する。
 *   **既定OFF**。利用者が明示的に有効化するまで、他の条件が何であれ送信しない。
 *
 * 設計(誤発射しない・無駄打ちしない):
 *   - 未同意(optedIn !== true)なら常に false。★他のどのゲートよりも先に見る。
 *   - キー未設定(公開機能が無いビルド)なら常に false。
 *   - watch タブが無い(配信を見ていない=鏡が動いていない)なら false。止まった状態を送り続けない。
 *   - 送信中(inFlight)なら false。多重 POST を防ぐ。
 *   - まだ一度も送っていない(everSent=false)なら true(初回は送る価値がある)。
 *   - 前回送信から intervalMs 以上経過していれば true。web_stale 閾値(既定180秒)より短い間隔(既定120秒)で
 *     打つことで「古い」と判定される前に先回りして新鮮化する。
 *   - 直近の送信が失敗(lastOk=false)でも、intervalMs 経過していれば再試行してよい(一時的失敗の回復)。
 *
 * これは判定だけの純関数。実 POST(uploadStatusSnapshot)や storage 記録は呼び出し側(status-entry)が行う。
 *
 * @module autoPublishDecision
 */

/** web_stale と判定される既定閾値(parityVerdict.js の DEFAULT_FRESH_MS と揃える)。 */
export const WEB_STALE_MS = 180_000;
/** 自動 publish の既定間隔。web_stale 閾値より短くして「古い」判定の前に先回りする。 */
export const DEFAULT_AUTO_PUBLISH_INTERVAL_MS = 120_000;

/**
 * @param {{
 *   optedIn?: boolean,          // ★利用者が「WEB公開」を明示的に有効化したか(既定OFF・最優先)
 *   hasKeys?: boolean,          // 公開キー(ingestKey/viewToken)が揃っているか
 *   hasWatchTab?: boolean,      // 視聴中の配信があるか(鏡が新鮮に動いている前提)
 *   hasPayload?: boolean,       // 送信できる jsonBlob が組めているか
 *   inFlight?: boolean,         // いま自動送信を実行中か(多重防止)
 *   everSent?: boolean,         // 過去に一度でも送信したか
 *   lastSentAtMs?: number,      // 前回送信時刻(ms)。0/未定義なら未送信扱い
 *   nowMs?: number,
 *   intervalMs?: number         // 自動送信の最短間隔(既定 DEFAULT_AUTO_PUBLISH_INTERVAL_MS)
 * }} input
 * @returns {{ publish: boolean, reason: string }}
 */
export function shouldAutoPublish(input) {
  const a = input && typeof input === 'object' ? input : {};
  const intervalMs = Number(a.intervalMs) > 0 ? Number(a.intervalMs) : DEFAULT_AUTO_PUBLISH_INTERVAL_MS;
  const nowMs = Number(a.nowMs) || 0;

  // ★最優先ゲート: 明示同意が無ければ、他の条件が何であれ送らない(既定OFF)。
  //   `=== true` で真偽値のみ受ける("true"/1 のような紛れを同意扱いにしない)。
  if (a.optedIn !== true) return { publish: false, reason: 'no_consent' };
  if (a.hasKeys !== true) return { publish: false, reason: 'no_keys' };
  if (a.hasPayload !== true) return { publish: false, reason: 'no_payload' };
  if (a.hasWatchTab !== true) return { publish: false, reason: 'no_watch' };
  if (a.inFlight === true) return { publish: false, reason: 'in_flight' };

  // まだ一度も送っていない=初回は送る。
  if (a.everSent !== true) return { publish: true, reason: 'first_publish' };

  const lastAt = Number(a.lastSentAtMs) || 0;
  if (lastAt <= 0) return { publish: true, reason: 'first_publish' };
  if (nowMs <= 0) return { publish: false, reason: 'no_now' };

  const ageMs = nowMs - lastAt;
  if (ageMs >= intervalMs) return { publish: true, reason: 'interval_elapsed' };

  return { publish: false, reason: 'fresh_enough' };
}
