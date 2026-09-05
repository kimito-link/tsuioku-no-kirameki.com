/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】storage キーごとの「どのくらいの間隔で読めばよいか」の宣言と判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】status の読み取り間隔の根拠はこのファイルのみ
 *
 * statusReadPolicy.js — 読む頻度を【書き手の更新間隔】から導く。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ なぜ要るか(2026-08-19 ユーザー「50年後楽できる設計に」)
 *
 *   status.html の refresh() は「毎回読む(コア5)」と「12秒に1回(extras 27)」の
 *   **2階級しか無く、どちらに居るべきかの基準がコードに書かれていなかった**。
 *   その結果、引っ越しが人の判断で3回起きて、根拠がどこにも残っていない:
 *     v0.1.909  laneDiag をコアに足す → 重くなった → extras へ
 *     v0.1.924  voiceDiag/venueSeatsDiag が v0.1.902 以降ずっとコアに居た → extras へ
 *     2026-06-23 fastDiag を full(40KB) から lite(1KB) へ
 *   ＝**次に read を足す人が、また一から考える**。これが「50年後つらい」の正体。
 *
 * ■ 判断の軸は【書き手の更新間隔】ただ1つ
 *   - 鮮度要求は主観(「1秒でも飛べば困る」vs「10秒平気」)＝基準にならない。
 *   - 実測所要は競合で 1ms↔217ms と揺れる＝追従すると振動してデバッグ不能になる。
 *   - ★書き手の間隔だけが【コードにハードコードされた不変の事実】。
 *
 *       readIntervalMs = writeIntervalMs × slack
 *
 *   階級を増やさない(連続量1本)。新しい read を足す人が答えるのは
 *   **「その値は誰がどのくらいの間隔で書くか」だけ**。
 *
 * ■ ★形骸化させないための設計(このリポには前科がある)
 *   diagChannelRegistry.js は 2026-08-12 に新設されて以来【1度も触られず登録1件のまま】。
 *   「登録すれば守られる・しなければ何も起きない」オプトインの台帳は必ず死ぬ。
 *   そこで:
 *     1. **未登録でも動く(fail-open=毎回読む)**＝登録漏れで壊れない(現状と同じ挙動)。
 *        ★fail-closed(読まない)は却下。読まない=画面が空=
 *          [[unobserved-must-not-hide-the-cell-2026-08-15]] に真正面から抵触する。
 *     2. **未登録の数をテストで固定する**(statusReadPolicy.test.js の KNOWN_UNPOLICIED)。
 *        増やすと赤・減らすのは自由。個別に塞がず【数で固定】する
 *        ([[fail-open-recurs-under-new-names-2026-08-12]])。
 *     3. **書き手の実装位置を宣言に残す**。引っ越しの根拠がコードに残る(過去3回は残らなかった)。
 * ───────────────────────────────────────────────────────────────────────────
 *
 * @module statusReadPolicy
 */

/**
 * 「書き手が事実上書かない(人の操作でしか書かれない)」ことを表す番兵。
 * ★Infinity にしない: JSON 化や Number 演算で NaN/null に化けて
 *   「間隔0＝毎回読む」に静かに反転する事故を避ける(実害の型は v0.1.1383 で経験済み)。
 */
export const WRITE_INTERVAL_HUMAN_MS = 60_000;

/**
 * 既定の slack(書き手の間隔の何倍まで古くてよいか)。
 * 1.0 = 書き手と同じ間隔で読む(＝取りこぼさない最小)。
 */
export const DEFAULT_SLACK = 1;

/**
 * 読み取り間隔の上限(ms)。どんなに書き手が遅くてもこれ以上は空けない。
 * ★12秒 = extras の EXTRAS_REFETCH_MS と揃える(このリポで実績のある間引き幅)。
 * ★backfillBottleneck.METER_SILENT_MS(15秒)より短くする=鮮度判定が壊れる側に入らない。
 */
export const READ_INTERVAL_CAP_MS = 12_000;

/**
 * @typedef {{
 *   writeIntervalMs: number,
 *   slack?: number,
 *   writtenBy: string,
 *   why: string
 * }} ReadPolicyEntry
 */

/**
 * 読み取り間隔の宣言。**キーは status-entry.js の read の呼び名**。
 *
 * ★載せる基準: 「書き手の更新間隔」が実コードで確認できること。
 *   確認できないものは載せない(推測で載せると嘘の間引きになる)。
 * ★載せないもの(意図的・2026-08-19 の会議の結論):
 *   - summaries    … livesData の土台。古いと全カード/全セルが古くなる
 *   - fastDiagLite … 健全度セル・北極星・マインドマップの主入力
 *   - backfill     … **取り込み進捗そのもの**。ユーザーはこれを見に来ている＝絶対に譲らない
 *   - lives        … chrome.tabs.query 経路で storage を触らない＝間引く意味がない
 *
 * @type {Readonly<Record<string, ReadPolicyEntry>>}
 */
export const STATUS_READ_POLICY = Object.freeze({
  /*
   * popupDiag: popup の「AI診断コピー」が書く別キー(nls_ai_share_popup_diag)。
   * ★書き手は popup-entry.js:19444 の 1 箇所だけで、**popup を開いたときにしか走らない**。
   *   status-entry.js:1266-1267 のコメントも「popup を開いたときだけ更新される」と明言。
   *   ＝診断ページを見ている間、この値は【変わらない】。
   *   2秒ごとに読んでも同じ値を取り直すだけなので、
   *   **情報を1bitも失わずに read を減らせる**(譲るのではなく無駄を消す)。
   */
  popupDiag: {
    writeIntervalMs: WRITE_INTERVAL_HUMAN_MS,
    writtenBy: 'popup-entry.js:19444 (AI診断コピー時のみ)',
    why: 'popup を開いたときだけ書かれる=診断ページを見ている間は不変'
  },

  /*
   * watchTabMap: 開いている watch タブの一覧(`chrome.tabs.query`)。
   *
   * ★v0.1.1447: 「書き手」は storage ではなく **人のタブ操作**。
   *   タブを開く/閉じる/切り替えるのは人の手＝popupDiag と同じ性質(分〜時間の間隔)。
   *
   * ★実測(2026-08-19 ユーザー実機): `tabs.query` 単独で **最悪1000ms**(watchタブは1個だけ)。
   *   これは storage 競合ではなく **browser プロセスの応答待ち**
   *   (`status-entry.js:1140-1145` のコメントが切り分け根拠を明記)。
   *   ＝**キー数でもLevelDBでもないので、間引く以外に打つ手がない**。
   *
   * ★`windowId` で現在ウィンドウに絞る案は【却下】: このクエリは
   *   **全ウィンドウの watch タブを探すのが目的**(別ウィンドウの配信を見失う)。
   */
  watchTabMap: {
    writeIntervalMs: WRITE_INTERVAL_HUMAN_MS,
    writtenBy: 'chrome.tabs.query (人がタブを開閉したときだけ変わる)',
    why: 'タブ操作は人の手=分〜時間の間隔。実測で1000ms(browserプロセス待ち)'
  },

  /*
   * lives: 視聴中の配信一覧。中身は `chrome.tabs.query`(watchTabMap と同じ実体)。
   *
   * ★当初これを宣言から外した(「storage を触らないから間引く意味がない」)が、
   *   **その前提が誤りだった**。storage を触らなくても browser プロセス待ちで1秒かかる。
   *
   * ★ただし間隔は **短く**する(2秒→4秒)。ここは画面の土台(livesData)なので、
   *   12秒も空けると「配信を開いたのに出てこない」になる。
   *   ＝**呼ぶ回数を半分にしつつ、体感の鮮度は守る**。
   */
  lives: {
    writeIntervalMs: 4_000,
    writtenBy: 'chrome.tabs.query (人がタブを開閉したときだけ変わる)',
    why: '土台なので12秒は空けられない。半減に留めて browser プロセス待ちを減らす'
  }
});

/**
 * 宣言から「次に読むまで空けてよい間隔(ms)」を出す。
 *
 * @param {string} key
 * @returns {number} 0 = 宣言が無い(毎回読む)
 */
export function readIntervalMsFor(key) {
  const entry = STATUS_READ_POLICY[String(key ?? '')];
  if (!entry) return 0; // ★fail-open: 未登録は毎回読む(現状の挙動と同じ)
  const write = Number(entry.writeIntervalMs);
  if (!Number.isFinite(write) || write <= 0) return 0;
  const slackRaw = Number(entry.slack);
  const slack = Number.isFinite(slackRaw) && slackRaw > 0 ? slackRaw : DEFAULT_SLACK;
  return Math.min(READ_INTERVAL_CAP_MS, Math.round(write * slack));
}

/**
 * 「いま実際に読むべきか」を判定する。false なら前回値(peek)を使う。
 *
 * ★時刻は呼び出し側が渡す(テスト可能性)。このモジュールは Date.now を呼ばない。
 * ★lastReadAt が 0/未設定 = まだ一度も読んでいない → **必ず読む**
 *   (「読んでいない」を「読んだが古い」と混同しない
 *    ＝[[zero-count-may-mean-unmeasured-2026-08-04]])。
 *
 * @param {string} key
 * @param {{ lastReadAt?: number, now: number }} ctx
 * @returns {boolean}
 */
export function shouldReadNow(key, ctx) {
  const now = Number(ctx?.now);
  if (!Number.isFinite(now)) return true; // 時刻が読めないなら読む(安全側)
  const intervalMs = readIntervalMsFor(key);
  if (intervalMs <= 0) return true; // 未登録=毎回読む
  const last = Number(ctx?.lastReadAt);
  if (!Number.isFinite(last) || last <= 0) return true; // 未読=必ず読む
  return now - last >= intervalMs;
}
