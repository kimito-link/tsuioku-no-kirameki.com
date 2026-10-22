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
/** 自動 publish の既定間隔。web_stale 閾値より短くして「古い」判定の前に先回りする。
 *  ★v0.1.1729 から「中身が前回の送信と同じとき」の生存確認の間隔(=変化が無くても最長これで1回送る)。 */
export const DEFAULT_AUTO_PUBLISH_INTERVAL_MS = 120_000;
/**
 * ★v0.1.1729(スマホ化 第1段): 中身が前回の送信から【変わったとき】の最短間隔。
 *   スマホの WEB版が「最大3分遅れて動いていないように見える」原因の片方が 120秒間隔だった。
 *   変化があるときだけ 20秒まで縮め、変化が無いときは 120秒のまま(通信量を増やさない)。
 *   送信担当の描き直しは、スマホが開いていなければ10秒周期(statusRefreshInterval.js)なので、これより短くしても意味が無い。
 */
export const CHANGED_AUTO_PUBLISH_INTERVAL_MS = 20_000;
/**
 * ★v0.1.1736(速さ 第2段): スマホが開いている間(サーバーの目印・30秒)は、中身が変わったら5秒で送る。
 *   送信担当もその間は5秒ごとに描き直す(statusRefreshInterval.js shouldRunPublisherTick)。誰も見ていなければ20秒のまま。
 */
export const VIEWER_ACTIVE_PUBLISH_INTERVAL_MS = 5_000;
/**
 * v0.1.1738: 「スマホで開いている」を覚えておく長さ。中身が変わらないと送信は120秒ごとなので、
 *   サーバーの目印(30秒)のままだと30秒で速い送信が切れていた。次の送信の返事が来るまで持つよう 150秒。
 *   閉じたら、その後の送信の返事(viewerActive:false)ですぐ解除する。
 */
export const VIEWER_ACTIVE_STICKY_MS = 150_000;

/**
 * v0.1.1738: 送信の返事から「スマホで開いている期限」と「gzip で送ってよいか」を決める。
 *   古いサーバーは viewerActive / gzipOk を返さない=どちらも false 扱い(gzip を解けないサーバーに送らない)。
 * @param {unknown} ack POST の返事(JSON)
 * @param {number} nowMs
 * @returns {{ viewingUntilMs: number, gzipOk: boolean }}
 */
export function readPublishAck(ack, nowMs) {
  const a = ack && typeof ack === 'object' ? /** @type {Record<string, unknown>} */ (ack) : {};
  return {
    viewingUntilMs: a.viewerActive === true ? (Number(nowMs) || 0) + VIEWER_ACTIVE_STICKY_MS : 0,
    gzipOk: a.gzipOk === true
  };
}

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
 *   intervalMs?: number,        // 中身が同じときの間隔(既定 DEFAULT_AUTO_PUBLISH_INTERVAL_MS)
 *   changed?: boolean,          // ★v0.1.1729 中身が前回の送信から変わったか(true のときだけ短い間隔)
 *   changedIntervalMs?: number, // 中身が変わったときの間隔(既定 CHANGED_AUTO_PUBLISH_INTERVAL_MS)
 *   failStreak?: number         // ★v0.1.1729 自動送信が続けて失敗した回数(0=直近は成功)
 * }} input
 * @returns {{ publish: boolean, reason: string }}
 */
export function shouldAutoPublish(input) {
  const a = input && typeof input === 'object' ? input : {};
  const intervalMs = Number(a.intervalMs) > 0 ? Number(a.intervalMs) : DEFAULT_AUTO_PUBLISH_INTERVAL_MS;
  const changedIntervalMs =
    Number(a.changedIntervalMs) > 0 ? Number(a.changedIntervalMs) : CHANGED_AUTO_PUBLISH_INTERVAL_MS;
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
  // ★v0.1.1729: 中身が変わっていれば短い間隔で送る(`=== true` のみ。不明は「同じ」側=送りすぎない)。
  //   続けて失敗しているときは 20→40→80→120秒 と広げる(サーバーが落ちているときに20秒おきに叩き続けない)。
  if (a.changed === true && ageMs >= changedIntervalWithBackoff(changedIntervalMs, intervalMs, a.failStreak)) {
    return { publish: true, reason: 'changed' };
  }

  return { publish: false, reason: 'fresh_enough' };
}

/**
 * ★v0.1.1729: 中身が変わったときの間隔に、失敗の連続回数ぶんの待ちを足す(倍々・上限は生存確認の間隔)。
 * @param {number} changedIntervalMs
 * @param {number} intervalMs
 * @param {unknown} failStreak
 * @returns {number}
 */
export function changedIntervalWithBackoff(changedIntervalMs, intervalMs, failStreak) {
  const n = Number(failStreak) > 0 ? Math.min(Math.floor(Number(failStreak)), 10) : 0;
  return Math.min(changedIntervalMs * 2 ** n, intervalMs);
}

/**
 * 「前回の送信の時刻」を、保存された記録と【このページが最後に送信を始めた時刻】の新しい方にする。
 *
 * ★なぜ(2026-10-15・サイドパネル内の送信担当を常駐させる版で計測して発覚):
 *   送信の結果の記録(publishOutcomeRec)は、補助情報(extras)の12秒間引きで読まれるため、送信した直後も最大12秒は
 *   【古いまま】。描画は2秒ごとなので、その間「前回から2分たった」と何度も判定され、2分ごとに4〜6回(各130KB)が
 *   2秒間隔で連続して送られていた(実測: 08:19:12〜19 に4回・08:21:20〜22 に2回)。
 *   このページが自分で送信を始めた時刻を覚えておけば、記録の更新を待たずに、次の2分まで送らない。
 * @param {unknown} recordAtMs 保存された記録の時刻(0/未定義なら無し)
 * @param {unknown} launchedAtMs このページが最後に送信を始めた時刻(0/未定義なら無し)
 * @returns {number} 新しい方(どちらも無ければ 0)
 */
export function latestPublishTime(recordAtMs, launchedAtMs) {
  const a = Number(recordAtMs) > 0 ? Number(recordAtMs) : 0;
  const b = Number(launchedAtMs) > 0 ? Number(launchedAtMs) : 0;
  return Math.max(a, b);
}
