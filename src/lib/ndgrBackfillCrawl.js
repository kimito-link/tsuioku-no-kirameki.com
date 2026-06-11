/**
 * v0.1.404: コメント過去ログ一括バックフィルの「巡回エンジン」（純ロジック）。
 *
 * 目的（ユーザー要望「ウルトラC」）:
 *   途中から配信を開いても、配信開始まで遡って過去コメントを取り込みたい。
 *   NDGR の view エンドポイントは ChunkedEntry を返し、その中の `backward` URI を
 *   辿ると「さらに過去」の ChunkedEntry が得られる。各 ChunkedEntry の `segment`
 *   URI を fetch すると、その時刻帯の実コメント（ChunkedMessage stream）が取れる。
 *   これを backward が尽きる（＝配信開始）まで連鎖的に辿る。
 *
 * 実機 PoC（2026-05-27 lv350560887）で確定した前提:
 *   - NDGR host = mpn.live.nicovideo.jp（watch ページと別オリジン = cross-origin）。
 *   - CORS は `credentials:'omit'` 必須（include だと Failed to fetch）。`*` CORS。
 *   - `?at=now` → 9 バイト（next ポインタ varint）。`?at={unixtime}` → ChunkedEntry。
 *   - backward fetch → さらに前の backward URI が在る = 配信開始まで遡及可能。
 *   - rate limit は PoC 未測定 → 連続巡回時は throttle 必須（BAN 回避）。
 *
 * 設計（2026-05-27 会議室で確定）:
 *   - この関数は「純ロジック」。fetch / sleep / now を引数で受け取り、副作用は
 *     yield のみ。これにより実 I/O ゼロで（フィクスチャ fetch で）単体テストできる
 *     （decodeChunkedEntry のフィクスチャ純テストと同じ思想）。
 *   - chat の抽出は decodePackedSegment（既存）で行う。chat → 保存行への整形は
 *     呼び出し側が ndgrChatRows.js の ndgrChatsToMergeRows で行う想定（gift システム
 *     メッセージ guard と vpos 保持はそこに在る）。本エンジンは生の NdgrChat[] を流す。
 *   - hot path（page-intercept の fetch patch / reader ループ）には一切入らない。
 *     呼び出し側（content world）が opt-in でこの generator を回す。
 *
 * @module ndgrBackfillCrawl
 */

import { decodeChunkedEntry } from './ndgrDecode.js';
import { decodePackedSegmentNav } from './ndgrDecode.js';
import { decodeChunkedMessage } from './ndgrDecode.js';
import { splitLengthDelimitedMessages } from './lengthDelimitedStream.js';
import { parseGiftCommentText } from './parseGiftComment.js';

/**
 * 巡回の各種上限（保守的な初期値）。PoC で rate limit 未測定のため、意図的に
 * 低めに設定し、実機 e2e で 429 が出ないことを確認してから緩める運用。
 *
 * @typedef {{
 *   segments: number,
 *   elapsedMs: number,
 *   bytes: number,
 *   rows: number
 * }} NdgrBackfillCaps
 */

/** @type {Readonly<NdgrBackfillCaps>} */
export const NDGR_BACKFILL_DEFAULT_CAPS = Object.freeze({
  // backward hop（= PackedSegment fetch）の総数。1 hop ≒ 数十秒〜数分の時間窓。実機で
  // 18h 配信は数千 hop 必要（segment窓が短いと 4000+）。最長尺でも遡りきれるよう 20000 に。
  // 実際の終了は通常 backward_exhausted（next.uri 無し＝配信開始）。bytes/rows が最終防波堤。
  segments: 20_000,
  // 経過時間の上限。長尺（18h・数千 hop）でも遡りきれるよう許容（進捗UI前提）。
  // v0.1.417: 10分→15分。実機で 13% 等の途中終了（cap_elapsed 疑い）を減らし完走率を上げる。
  //   進捗はりんく演出で可視化され、タブ非表示で abort されるので長くても無害。
  elapsedMs: 900_000,
  // 累計受信バイトの上限。長尺でも数十 MB 想定。60MB は安全マージン。
  bytes: 60_000_000,
  // 取り込み chat 行の累計上限（storage 膨張の最終防波堤）。
  rows: 100_000
});

/**
 * 各 fetch 間の最小待機（直列・並列度 1）。実機で 200ms だと 18h 配信を 5 分で遡りきれず
 * 39% 止まりだった（数千 hop ×200ms が時間 cap を超過）。広く使われている参考実装
 * NDGRClient は backward 間 10ms。それより安全側の 30ms（約33req/s）にする。mpn.live は
 * CDN 系。429/403 を受けたら NDGR_BACKFILL_BACKOFF_MS で必ず減速・最終的に停止する。
 * v0.1.417: 30ms→15ms。同じ 10 分でも 2 倍の hop を進められ、長尺の完走率を上げる。
 *   NDGRClient の 10ms より安全側を保ちつつ、429/403 backoff の安全網は不変（混雑時は自動減速）。
 */
export const NDGR_BACKFILL_FETCH_GAP_MS = 15;

/**
 * 巡回の起点を「現在より何秒前」にするか。`?at=now` の nextAt は未来方向ポインタで
 * backward が出ないため、封済みになっている過去（この秒数前）を起点に View を読む。
 * 直近この秒数ぶんは RT 記録が拾うので、起点を少し過去にしても取りこぼさない。
 */
export const NDGR_BACKFILL_SEED_LAG_SEC = 90;

/**
 * 1 本の backward 連鎖は時刻区画（バケット）ごとに next=N で終端する。配信開始まで届かせるには、
 * 終端のたびに「さらに前の時刻」から再シードして次の区画を辿る。その再シード回数の上限。
 *
 * ⭐v0.1.431: 旧コメントは「1 区画＝数十分」と想定し 200 で足りるとしていたが、実機 lv350604301 で
 *   バケットは実測**約 30〜45 秒**と判明（旧 200 では ~46 分配信でも途中で cap_reseeds に達し得た）。
 *   バケット幅 50s で再シードするので、所要回数 ≒ 配信秒数 / 50。18h 配信なら 64800/50 ≈ 1296 回。
 *   余裕を見て 4000 にする（真の終了は通常 reached_start。cap_elapsed/bytes/rows と hidden 中断が
 *   最終防波堤なので、回数 cap で長尺を途中打ち切りしないことを優先）。
 */
export const NDGR_BACKFILL_MAX_RESEEDS = 4000;
/** 再シード時刻を「最古コメント実時刻 − この秒数」にして区画の取りこぼしを防ぐ。 */
export const NDGR_BACKFILL_RESEED_BUFFER_SEC = 5;
/** 配信開始時刻が不明なときの再シード後退幅（秒・保守的な固定窓）。 */
export const NDGR_BACKFILL_RESEED_STEP_SEC = 1200;
/**
 * v0.1.431: 1 つの ChunkedEntry / backward 連鎖がカバーする時間区画（バケット）の幅（秒）。
 *
 * ⭐実機 lv350604301（爆速配信・2026-05-27）で決定的に観測: NDGR の `?at={t}` 応答は
 *   約 30〜45 秒ごとのバケットに量子化されている。例えば `at=600` も `at=595`（=最古 vpos−5s
 *   バッファ）も**同一のバケット＝同一 backward URI**を返す。つまり旧来の「最古 vpos − 5s」
 *   再シードは、たった今読み終えたバケットに舞い戻り、その backward URI が既に visited のため
 *   入口が見つからず no_progress 扱い→数回リトライ後に 34% 等で停止していた（32%停止の真因）。
 *
 *   そこで再シードは「直前に種をまいた at」より**最低でも 1 バケット分前**へ必ず下げる。実機
 *   検証では at をバケット幅ぶん戻すと 57 ホップで 46 分配信の冒頭(+26秒)まで重複ゼロで到達した。
 *   余裕を見て実測上限 45s よりやや大きい 50s にする（隙間に落ちても次バケットに入れる）。
 */
export const NDGR_BACKFILL_RESEED_BUCKET_STEP_SEC = 50;
/**
 * v0.1.429: 「配信開始に到達した」と判定する最古 vpos のしきい値（センチ秒）。
 * 最古コメントの vpos がこの値以下＝配信開始〜30秒以内なら、本当に最初まで遡れたとみなす。
 * これ以外の「進めなかった」は reached_start にせず、起点を戻してリトライ/no_progress に倒す。
 */
export const NDGR_BACKFILL_NEAR_START_VPOS_CS = 3000; // 30秒 ×100(センチ秒)
/**
 * v0.1.434: 「配信開始に到達した」と判定するのに必要な、開始近傍(NEAR_START_VPOS_CS 以内)の
 * vpos を持つ chat の最小件数。
 *
 *   なぜ単一最小値ではダメか（誤判定の真因）: 運営アナウンス / システムメッセージ / ギフトの
 *   お知らせ等は vpos=0 や極小になりがち。これが配信【中盤】の区画に 1 件紛れると、その区画の
 *   最小 vpos が極小になり「最小 vpos ≤ 30秒」が成立 → まだ序盤まで程遠いのに reached_start
 *   （『ぜんぶ届いた』）を誤発火していた（実機で 47%/51% 停止）。
 *
 *   一方、本当の配信開始区画には冒頭の低 vpos コメントが【複数】ある（vpos≈0 が大量）。そこで
 *   「開始近傍の vpos が 2 件以上」を要求すれば、外れ値 1 件では発火せず、真の開始は確実に通る。
 *   ⛔ vpos=0 を一律無視するのは不可（真の開始では実際に vpos≈0 が大量にあり、取り逃す）。
 */
export const NDGR_BACKFILL_NEAR_START_MIN_HITS = 2;
/**
 * v0.1.429: 「前回より古い区画へ進めなかった」ときに、起点をさらに大きく戻して再挑戦する
 * 最大連続回数。これを超えても進めなければ no_progress で終える（reached_start とは言わない）。
 *
 * v0.1.455: 4 → 12 に引き上げ。真因修正で「空区画（コメントの無い時間帯の隙間／運営コメント
 *   だけの区画）」もこのリトライ経路に合流させたため、連続した無コメント区間を飛び越えるには
 *   より多くの試行が要る。1 回のリトライで起点を 1 バケット（≒50秒）前へ戻すので、12 回で
 *   最大 ≒600秒（10分）ぶんの空区間を飛び越えられる。進捗が 1 回でもあれば streak は 0 に
 *   リセットされる（連続空振りのみカウント）ので、正常配信での無駄な遡りは増えない。
 *
 * ⭐fix/ndgr-no-progress-bridge（2026-06-01・実機で確定）: 12 → 240 に引き上げ。
 *   実機（歌枠・ギフト多め）で `seg=16 rows=5102 done=1 stop=no_progress`、記録が公式の約68%で
 *   頭打ちになる症状を data-nls-backfill で観測。真因は「12×50秒＝10分」の橋渡し予算が短すぎる
 *   こと：歌枠の長い間奏／雑談など【コメントが疎な区間】や、コメントが少ない時間帯で NDGR が
 *   1 区画に広い時間幅をまとめた【幅広バケット】（同一 backward URI が 50秒ステップでは何度も
 *   visited で即 break）を、10 分ぶんしか跨げず途中で no_progress に倒れていた。
 *   240×50秒＝12,000秒（約200分）まで橋渡しできるようにし、現実的な疎区間・幅広バケットを
 *   跨いで配信開始まで遡り切れるようにする。
 *   ⚠️ 後退（区画スキップ）防止のためステップ幅は 50秒のまま据え置き（幅を広げると populated
 *      バケットを飛び越して取りこぼす）。1 reseed は ?at fetch 1 回（≒15〜30ms）で軽く、総量は
 *      caps.elapsedMs(15分)/segments/bytes で有界。正常完了は通常 reached_start / backward_exhausted
 *      で早期終了するので、この引き上げは「途中で詰まった配信」だけを救済し正常配信は不変。
 */
export const NDGR_BACKFILL_NO_PROGRESS_RETRY_MAX = 240;

/** 429/403 を受けたときの backoff 待機列（ms）。これを使い切ったら巡回中断。 */
export const NDGR_BACKFILL_BACKOFF_MS = Object.freeze([2_000, 4_000, 8_000]);

/**
 * v0.1.458: 一過性失敗（タイムアウト/ネットワーク失敗/5xx/空応答）のリトライ待機列（ms）。
 *
 * 会議⑧（世界調査）で判明: NDGRClient/NdgrClientSharp の backward 巡回は fetch が1回でも
 *   失敗すると全ループが死ぬ（リトライ皆無）。一方 YouTube/Twitch の成熟ツール(chat-downloader)
 *   は max 15 回・指数バックオフでリトライする。我々は backfill が best-effort で「1回失敗＝
 *   その先を諦める」だったため、一過性のタイムアウト/瞬断で取得率が落ちていた可能性がある。
 *   そこで限定回数（3回）・指数バックオフで再試行してから諦める。429/403 は別系統
 *   （NDGR_BACKFILL_BACKOFF_MS）で扱うのでここには含めない（サーバー拒否は長めに待つ）。
 *   ⚠️ ハング型はリトライより per-request タイムアウト（backfillFetchBinary 側）が主因対策で、
 *   これは「タイムアウト後に数回だけ救済する」補助。回数を抑えて総待機時間の暴発を防ぐ。
 */
export const NDGR_BACKFILL_TRANSIENT_RETRY_MS = Object.freeze([500, 1_000, 2_000]);

/**
 * 巡回の終了理由。
 * @typedef {(
 *   'backward_exhausted' | 'reached_start' | 'cap_reseeds' | 'visited_revisit' |
 *   'cap_segments' | 'cap_elapsed' | 'cap_bytes' | 'cap_rows' | 'aborted' |
 *   'rate_limited' | 'no_view_base' | 'no_entry' | 'no_progress'
 * )} NdgrBackfillStopReason
 */

/**
 * generator が segment ごとに yield する進捗イベント。
 * @typedef {{
 *   chats: import('./ndgrDecode.js').NdgrChat[],
 *   segmentsFetched: number,
 *   rowsSeen: number,
 *   bytesFetched: number,
 *   minCommentNo: number|null,
 *   minVposReached?: number|null
 * }} NdgrBackfillProgress
 */

/**
 * "view base + at" を組み立てる（base に既存クエリは無い前提＝PoC で確認）。
 * @param {string} viewBase
 * @param {string|number} at
 * @returns {string}
 */
function buildViewAtUrl(viewBase, at) {
  const b = String(viewBase || '');
  const sep = b.includes('?') ? '&' : '?';
  return `${b}${sep}at=${encodeURIComponent(String(at))}`;
}

/**
 * AbortSignal が中断済みかを安全に判定。
 * @param {AbortSignal|undefined} signal
 * @returns {boolean}
 */
function isAborted(signal) {
  return !!(signal && signal.aborted);
}

/**
 * fetchBinary を throttle + backoff 付きで呼ぶ。成功で Uint8Array、レート制限が
 * backoff を使い切ったら null を返す（呼び出し側が rate_limited で停止する）。
 *
 * @param {object} ctx
 * @param {(url: string, opts: { signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, bytes: Uint8Array }>} ctx.fetchBinary
 * @param {(ms: number) => Promise<void>} ctx.sleep
 * @param {AbortSignal|undefined} ctx.signal
 * @param {number} ctx.gapMs
 * @param {string} url
 * @param {boolean} isFirst 最初の fetch は gap を入れない
 * @returns {Promise<{ bytes: Uint8Array|null, rateLimited: boolean }>}
 */
async function fetchWithThrottle(ctx, url, isFirst) {
  if (!isFirst) await ctx.sleep(ctx.gapMs);
  if (isAborted(ctx.signal)) return { bytes: null, rateLimited: false };

  let backoffIdx = 0; // 429/403 用の backoff インデックス
  let transientIdx = 0; // v0.1.458: タイムアウト/ネットワーク失敗/5xx/空応答 用のリトライ
  for (;;) {
    let res;
    try {
      res = await ctx.fetchBinary(url, { signal: ctx.signal });
    } catch {
      // v0.1.458: ネットワーク失敗・per-request タイムアウト（backfillFetchBinary が
      //   AbortError を throw）等の一過性失敗。crawl 全体が abort されたのでなければ、
      //   限定回数だけ指数バックオフでリトライしてから諦める（YouTube/Twitch 流。旧実装は
      //   1回失敗＝即諦めで取得率が落ちていた）。
      if (isAborted(ctx.signal)) return { bytes: null, rateLimited: false };
      if (transientIdx < NDGR_BACKFILL_TRANSIENT_RETRY_MS.length) {
        await ctx.sleep(NDGR_BACKFILL_TRANSIENT_RETRY_MS[transientIdx]);
        transientIdx += 1;
        if (isAborted(ctx.signal)) return { bytes: null, rateLimited: false };
        continue;
      }
      // リトライを使い切った → これ以上の遡及は諦める（best-effort）。
      return { bytes: null, rateLimited: false };
    }
    if (res && res.ok && res.bytes && res.bytes.length > 0) {
      return { bytes: res.bytes, rateLimited: false };
    }
    const status = res ? res.status : 0;
    // 429/403 はサーバーが嫌がっているサイン。backoff して限られた回数だけ再試行。
    if ((status === 429 || status === 403) && backoffIdx < NDGR_BACKFILL_BACKOFF_MS.length) {
      await ctx.sleep(NDGR_BACKFILL_BACKOFF_MS[backoffIdx]);
      backoffIdx += 1;
      if (isAborted(ctx.signal)) return { bytes: null, rateLimited: false };
      continue;
    }
    if (status === 429 || status === 403) {
      // backoff を使い切った → これ以上叩かない。
      return { bytes: null, rateLimited: true };
    }
    // v0.1.458: 5xx（サーバー一時障害）と「ok だが空応答」も一過性とみなしてリトライ。
    //   NDGR/CDN が一瞬詰まって空や 5xx を返すケースを救済する（旧実装は即打ち切り）。
    if ((status >= 500 || status === 0 || !res || !res.bytes || res.bytes.length === 0) &&
        transientIdx < NDGR_BACKFILL_TRANSIENT_RETRY_MS.length) {
      await ctx.sleep(NDGR_BACKFILL_TRANSIENT_RETRY_MS[transientIdx]);
      transientIdx += 1;
      if (isAborted(ctx.signal)) return { bytes: null, rateLimited: false };
      continue;
    }
    // その他のエラー（404 等・恒久的）は best-effort で打ち切り。
    return { bytes: null, rateLimited: false };
  }
}

/**
 * chat 配列から最小 commentNo（no）を求める。空なら null。
 * @param {import('./ndgrDecode.js').NdgrChat[]} chats
 * @returns {number|null}
 */
function minNoOf(chats) {
  /** @type {number|null} */
  let min = null;
  for (const c of chats) {
    if (!c || c.no == null) continue;
    const n = Number(c.no);
    if (!Number.isFinite(n)) continue;
    if (min == null || n < min) min = n;
  }
  return min;
}

/**
 * chat 配列から最小 vpos（センチ秒・配信開始からの経過）を求める。空/不明なら null。
 * 再シード時刻の算出（最古コメントの実時刻）に使う。
 * @param {import('./ndgrDecode.js').NdgrChat[]} chats
 * @returns {number|null}
 */
function minVposOf(chats) {
  /** @type {number|null} */
  let min = null;
  for (const c of chats) {
    if (!c || c.vpos == null) continue;
    const v = Number(c.vpos);
    if (!Number.isFinite(v) || v < 0) continue;
    if (min == null || v < min) min = v;
  }
  return min;
}

/**
 * v0.1.436: 「この chat は記録パスで保存される一般コメントか」を判定する既定フィルタ。
 *
 *   chainLooksLikeStreamStart の vpos 集計は「記録に残るコメント」だけを母集団にすべきで、
 *   記録パス(ndgrChatRows.js の ndgrChatsToMergeRows: no==null skip + parseGiftCommentText
 *   skip) で除外される運営/system/gift お知らせを reached_start 投票から外す必要がある
 *   （実機 55% で『ぜんぶ届いた』誤発火の追加真因＝中盤区画に運営/gift が 2 件以上紛れて
 *   minHits=2 をすり抜けていた）。
 *
 *   ⛔ no==null だけでは gift をすり抜ける場合がある（gift 行は送信者 uid を no に持つ実例が
 *      存在する＝backfillRemoveGiftSystemMessages.js のコメント参照）。だから 2 段ガード。
 *
 * @param {import('./ndgrDecode.js').NdgrChat} chat
 * @returns {boolean} 記録パスで保存される一般コメントなら true。運営/system/gift は false。
 */
function defaultIsPersistableChat(chat) {
  if (!chat || chat.no == null) return false; // 運営/system 候補
  const text = typeof chat.content === 'string' ? chat.content : '';
  if (text && parseGiftCommentText(text)) return false; // gift お知らせ
  return true;
}

/**
 * v0.1.434: この区画(chats)が「配信の開始区画」らしいかを判定する純関数。
 *
 *   真の開始区画には冒頭の低 vpos コメントが【複数】ある（配信開始直後に挨拶等で vpos≈0 が
 *   大量に流れる）。一方、配信【中盤】の区画に運営/システム/ギフトお知らせが 1 件だけ紛れると
 *   その vpos も極小になりがちで、「単一最小 vpos ≤ 開始近傍」では中盤を開始と誤判定してしまう
 *   （実機 47%/51% で『ぜんぶ届いた』誤表示の真因）。
 *
 *   そこで「開始近傍(nearStartCs 以内)の vpos を持つ chat が minNearStartHits 件以上」を要求する。
 *   外れ値 1 件では発火せず、低 vpos が複数ある真の開始区画は確実に通る。vpos の有効性判定は
 *   minVposOf と揃える（null / 非有限 / 負を無視）。
 *
 *   v0.1.436 追補: 投票母集団は「記録パスで保存される一般コメント」に揃える（isPersistableChat）。
 *     運営/system/gift お知らせ(vpos=0/極小)が中盤区画に複数紛れて minHits=2 をすり抜ける
 *     ケースを根治（実機 55% で『ぜんぶ届いた』誤発火）。既定 = defaultIsPersistableChat。
 *
 * @param {import('./ndgrDecode.js').NdgrChat[]} chats 1 区画ぶんの chat 配列。
 * @param {{
 *   nearStartCs?: number,
 *   minNearStartHits?: number,
 *   isPersistableChat?: (chat: import('./ndgrDecode.js').NdgrChat) => boolean
 * }} [opts]
 *   nearStartCs: 開始近傍とみなす vpos しきい値（センチ秒・既定 NDGR_BACKFILL_NEAR_START_VPOS_CS）。
 *   minNearStartHits: 開始近傍 vpos の必要件数（既定 NDGR_BACKFILL_NEAR_START_MIN_HITS）。
 *   isPersistableChat: 母集団フィルタ（既定 defaultIsPersistableChat＝記録パスと同等の 2 段ガード）。
 *     テストで挙動を完全制御する用途や、将来の persist 仕様変更にも追従できるよう注入可能にする。
 * @returns {boolean} 開始区画らしければ true。空配列 / 全 vpos 欠落 / 近傍が件数未満なら false。
 */
export function chainLooksLikeStreamStart(chats, opts) {
  if (!Array.isArray(chats) || chats.length === 0) return false;
  const nearStartCs =
    typeof opts?.nearStartCs === 'number' && opts.nearStartCs >= 0
      ? opts.nearStartCs
      : NDGR_BACKFILL_NEAR_START_VPOS_CS;
  const minHits =
    typeof opts?.minNearStartHits === 'number' && opts.minNearStartHits >= 1
      ? Math.floor(opts.minNearStartHits)
      : NDGR_BACKFILL_NEAR_START_MIN_HITS;
  const isPersistable =
    typeof opts?.isPersistableChat === 'function'
      ? opts.isPersistableChat
      : defaultIsPersistableChat;
  let hits = 0;
  for (const c of chats) {
    if (!isPersistable(c)) continue; // v0.1.436: 運営/system/gift は投票母集団から外す
    if (!c || c.vpos == null) continue;
    const v = Number(c.vpos);
    if (!Number.isFinite(v) || v < 0) continue;
    if (v <= nearStartCs) {
      hits += 1;
      if (hits >= minHits) return true;
    }
  }
  return false;
}

/**
 * NDGR を backward 方向に巡回し、過去コメント（NdgrChat[]）を segment ごとに yield
 * する async generator。実 I/O は注入された fetchBinary / sleep / now のみ。
 *
 * 巡回フロー:
 *   1. `?at=now` → nextAt（現在地点の long-poll ポインタ）。
 *   2. `?at={nextAt}` → 最初の ChunkedEntry。
 *   3. ChunkedEntry の segment URI を順に fetch → decodePackedSegment → chats を yield。
 *   4. ChunkedEntry の backward URI を直接 fetch して 1 つ前の ChunkedEntry へ（→ 3 へ）。
 *   5. backward URI が無い（配信開始に到達）/ cap / visited / known-min で停止。
 *
 * @param {object} opts
 * @param {string} opts.viewBase NDGR view エンドポイントのベース URL（`?at=` 前）。
 * @param {(url: string, o: { signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, bytes: Uint8Array }>} opts.fetchBinary
 *   URL を fetch して `{ ok, status, bytes }` を返す注入関数。呼び出し側が
 *   `credentials:'omit'` で叩く責務を持つ（cross-origin 必須）。
 * @param {(ms: number) => Promise<void>} [opts.sleep] throttle/backoff 用。既定は実 setTimeout。
 * @param {() => number} [opts.now] 経過時間計測用。既定は Date.now。
 * @param {Partial<NdgrBackfillCaps>} [opts.caps] 上限の上書き。
 * @param {number} [opts.fetchGapMs] fetch 間の待機 ms。
 * @param {number|null} [opts.programStartSec] 配信開始の unixtime（秒）。区画終端での
 *   再シード時刻を「配信開始 + 最古コメント vpos」で精密に算出するのに使う。不明なら
 *   固定窓で後退する（精度は落ちるが動作する）。
 * @param {number|null} [opts.resumeFromVpos] v0.1.456 レジューム: 前回到達した最古コメント
 *   vpos（センチ秒）。非 null かつ programStartSec が分かるとき、初回 seed 探索の候補先頭に
 *   「配信開始 + この vpos の少し前」を積んで前回の続きから掘る。無ければ従来の seed 探索。
 * @param {AbortSignal} [opts.signal] タブ非表示 / SPA 遷移での中断用。
 * @returns {AsyncGenerator<NdgrBackfillProgress, { stopReason: NdgrBackfillStopReason, segmentsFetched: number, rowsSeen: number, bytesFetched: number, minVposReached: number|null }, void>}
 */
export async function* crawlNdgrBackward(opts) {
  const viewBase = String(opts?.viewBase || '').trim();
  const fetchBinary = opts?.fetchBinary;
  const sleep =
    typeof opts?.sleep === 'function'
      ? opts.sleep
      : (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
  const now = typeof opts?.now === 'function' ? opts.now : () => Date.now();
  const programStartSec =
    typeof opts?.programStartSec === 'number' && opts.programStartSec > 0
      ? Math.floor(opts.programStartSec)
      : null;
  // v0.1.456 レジューム: 前回の巡回で到達した最古コメント vpos（センチ秒）。非 null かつ
  //   programStartSec が分かるとき、初回 seed 探索の候補先頭に「配信開始 + この vpos の少し前」
  //   を積み、前回の続きから掘り始める（同じ区画の取り直しを避ける）。無効値は無視して従来動作。
  const resumeFromVpos =
    typeof opts?.resumeFromVpos === 'number' &&
    Number.isFinite(opts.resumeFromVpos) &&
    opts.resumeFromVpos > 0
      ? Math.floor(opts.resumeFromVpos)
      : null;
  const caps = { ...NDGR_BACKFILL_DEFAULT_CAPS, ...(opts?.caps || {}) };
  const gapMs =
    typeof opts?.fetchGapMs === 'number' && opts.fetchGapMs >= 0
      ? opts.fetchGapMs
      : NDGR_BACKFILL_FETCH_GAP_MS;
  const signal = opts?.signal;

  let segmentsFetched = 0;
  let rowsSeen = 0;
  let bytesFetched = 0;
  // v0.1.456 レジューム: この巡回で到達した最古コメント vpos。summary() / done() が参照する
  //   ため、早期 return（no_view_base/aborted/no_entry 等）が呼ばれる前にここで宣言する
  //   （let の TDZ 回避）。実値は下の resumeFromVpos 確定後に再代入する。
  /** @type {number|null} これまでに遡れた最古コメントの vpos（センチ秒）。再シード判定用。 */
  let globalMinVpos = null;

  // v0.1.456 レジューム: この巡回で到達した最古コメント vpos を呼び出し側へ返すため
  //   summary に含める。呼び出し側（content-entry runNdgrBackfillOnce）はこれを per-liveId
  //   storage に保存し、「もう一度」押下や自動リトライ時に opts.resumeFromVpos として渡す。
  //   これにより毎回ゼロから seed 探索して同じ区画を取り直し dedupe で弾かれる無駄
  //   （実機 125→135→143 しか増えない）を解消し、押すたびに続きから前進できる。
  const summary = () => ({
    segmentsFetched,
    rowsSeen,
    bytesFetched,
    minVposReached: globalMinVpos
  });
  /**
   * v0.1.443: `reached_start` 発火時に、どんな chats(vpos 一覧)が判定の根拠だったかを
   *   診断情報として戻り値に含める。実機で「40%なのに『ぜんぶ届いた』」誤判定の真因を
   *   後追いで特定するためのもの(描画パスには触らない・既存呼出は無視できる optional)。
   * @param {NdgrBackfillStopReason} reason
   * @param {{ reachedStartChats?: import('./ndgrDecode.js').NdgrChat[], reachedStartPath?: 'main'|'side', crawl?: object, seek?: string[], cands?: number[] }} [diag]
   */
  const done = (reason, diag) => ({ stopReason: reason, ...summary(), diagnostics: diag || null });

  /** @type {{ nowBytes: number|null, nowNextAt: number|null }} v0.1.640 診断: crawl 入口の fetch/decode 結果。 */
  const _crawlDiag = { nowBytes: null, nowNextAt: null };
  /** @type {string[]} v0.1.640 診断: 入口探索(seekBackwardUri)の各 hop の fetch/decode 結果。 */
  const _seekDiag = [];

  if (!viewBase) return done('no_view_base');
  if (typeof fetchBinary !== 'function') return done('no_view_base');

  const ctx = { fetchBinary, sleep, signal, gapMs };

  // --- 1) ?at=now で現在地点ポインタ（nextAt）を得る ---
  if (isAborted(signal)) return done('aborted');
  const nowRes = await fetchWithThrottle(ctx, buildViewAtUrl(viewBase, 'now'), true);
  // v0.1.640 診断: ?at=now の fetch 結果(ISOLATED world で fetch が通るか・何バイト返るか)。
  _crawlDiag.nowBytes = nowRes.bytes ? nowRes.bytes.length : (nowRes.rateLimited ? -429 : 0);
  if (nowRes.rateLimited) return done('rate_limited', { crawl: _crawlDiag });
  if (!nowRes.bytes || nowRes.bytes.length === 0) return done('no_entry', { crawl: _crawlDiag });
  bytesFetched += nowRes.bytes.length;
  const nowNav = decodeChunkedEntry(nowRes.bytes);
  _crawlDiag.nowNextAt = nowNav.nextAt;
  if (nowNav.nextAt == null) return done('no_entry', { crawl: _crawlDiag });

  // --- 2) backward 連鎖の入口 URI（backward.segment.uri）を探す ---
  //   ⭐ 実機で確定（2026-05-27）: 起点は「過去の実時刻」にする。`?at=now` が返す nextAt は
  //   未来方向の long-poll ポインタで、それを起点に next を辿っても backward は出ない
  //   （実機 v0.1.409 で backward_exhausted seg=0）。一方 `?at={少し過去の unixtime}` で
  //   叩くと、その時刻帯の ChunkedEntry に backward.segment.uri が埋まる（v0.1.408 実機で
  //   bwd=Y を確認）。そこで現在より NDGR_BACKFILL_SEED_LAG_SEC 秒前を起点に View を読み、
  //   backward が無ければ next を辿って探す。出たら過去への入口。以降は Backward API
  //   （PackedSegment・下記 3）を辿る。直近 lag 秒ぶんは RT 記録が拾うので取りこぼさない。
  const t0 = now();
  /** @type {Set<string>} 再訪防止（backward URI / at URL を一意キーに） */
  const visited = new Set();
  const nowSec = Math.floor(t0 / 1000);
  // v0.1.456 レジューム: globalMinVpos は上で宣言済み（TDZ 回避）。ここで前回到達点
  //   (resumeFromVpos)を代入する。これにより「続きから」掘ったときの madeProgress 判定
  //   （chainMinVpos < globalMinVpos）が前回の最古点を基準にでき、前回より古い区画に
  //   入れたときだけ前進扱いになる。resumeFromVpos が null なら従来どおり null のまま。
  globalMinVpos = resumeFromVpos;
  /**
   * @type {boolean} v0.1.434: 直近に「本当に古い区画へ進めた」とき、その区画が開始区画らしかったか
   *   （chainLooksLikeStreamStart の結果）。副経路（入口が尽きた時）の reached_start 判定に使う。
   *   globalMinVpos は区画をまたいだ単一最小値で外れ値 1 件に汚染されうるため、単一最小値でなく
   *   「最後に取り込めた区画が開始近傍 vpos を複数持っていたか」をこのフラグで記録して参照する。
   */
  let reachedStreamStartChain = false;
  /**
   * @type {import('./ndgrDecode.js').NdgrChat[]|null} v0.1.443: フラグが true になった時の chats の
   *   スナップショット。副経路発火時の診断情報として戻り値に含めるためのもの（描画パス非干渉）。
   */
  let reachedStreamStartChats = null;
  /**
   * @type {number|null} v0.1.431: 直前に「種をまいた at（秒）」。次の再シードは必ずこれより
   *   最低 1 バケット分（NDGR_BACKFILL_RESEED_BUCKET_STEP_SEC）前へ下げ、同じバケットへ
   *   舞い戻って visited 詰まり→偽 no_progress になるのを防ぐ（爆速配信 34% 停止の真因）。
   */
  let lastSeedAtSec = null;
  /** @type {number} v0.1.429: 「古い区画へ進めなかった」連続回数（起点を戻してリトライする）。 */
  let noProgressStreak = 0;
  /**
   * @type {boolean} v0.1.691: この巡回で一度でも「より古い区画へ進めた」（madeProgress）か。
   *   リトライ予算超過時の終了理由の出し分けに使う。一度も chat で前進できていない＝入口問題
   *   として backward_exhausted を診断付きで正直に報告し、前進歴があれば従来どおり no_progress。
   */
  let everMadeProgress = false;
  /** @type {{ rateLimited?: boolean, aborted?: boolean }} ヘルパからの異常通知 */
  const abend = {};

  /**
   * ?at={startAt} から View を読み、backward が出るまで next を辿って入口 URI を返す。
   * 見つからなければ backwardUri=''。rate limit/abort は abend に立てて呼び出し側で停止する。
   *
   * v0.1.457 previous 回収: backward が見つかった ChunkedEntry に含まれる previous URI
   *   （直近過去の MessageSegment・ライブ最前〜backward 入口の隙間を埋める）も一緒に返す。
   *   呼び出し側が backward 連鎖を辿る前にこれを回収して取得率を上げる（世界実装＝
   *   NdgrClientSharp が必須にしている処理）。previous が無ければ空配列。
   * @param {number} startAt
   * @returns {Promise<{ backwardUri: string, previousUris: string[] }>}
   */
  const seekBackwardUri = async (startAt) => {
    let viewAt = startAt;
    for (let hop = 0; hop < 20; hop += 1) {
      if (isAborted(signal)) { abend.aborted = true; return { backwardUri: '', previousUris: [] }; }
      if (now() - t0 >= caps.elapsedMs) { abend.aborted = true; return { backwardUri: '', previousUris: [] }; }
      const atUrl = buildViewAtUrl(viewBase, viewAt);
      if (visited.has(atUrl)) { if (_seekDiag.length < 30) _seekDiag.push(`h${hop}:visited`); return { backwardUri: '', previousUris: [] }; }
      visited.add(atUrl);
      const entryRes = await fetchWithThrottle(ctx, atUrl, false);
      if (entryRes.rateLimited) { if (_seekDiag.length < 30) _seekDiag.push(`h${hop}:rl`); abend.rateLimited = true; return { backwardUri: '', previousUris: [] }; }
      if (!entryRes.bytes || entryRes.bytes.length === 0) { if (_seekDiag.length < 30) _seekDiag.push(`h${hop}:empty`); return { backwardUri: '', previousUris: [] }; }
      bytesFetched += entryRes.bytes.length;
      const entryNav = decodeChunkedEntry(entryRes.bytes);
      if (_seekDiag.length < 30) _seekDiag.push(`h${hop}:b=${entryRes.bytes.length}:bwd=${entryNav.backwardUri ? 'Y' : 'N'}:nx=${entryNav.nextAt}`);
      if (entryNav.backwardUri) {
        return {
          backwardUri: entryNav.backwardUri,
          previousUris: Array.isArray(entryNav.previousUris) ? entryNav.previousUris : []
        };
      }
      if (entryNav.nextAt == null || entryNav.nextAt === viewAt) {
        return { backwardUri: '', previousUris: [] };
      }
      viewAt = entryNav.nextAt;
    }
    return { backwardUri: '', previousUris: [] };
  };

  /**
   * v0.1.457 previous 回収: previous URI 群（直近過去の MessageSegment）を fetch して
   *   chats を yield する。MessageSegment URI の中身は ChunkedMessage の length-delimited
   *   stream なので、splitLengthDelimitedMessages でフレーム分割 → decodeChunkedMessage で
   *   各フレームを decode → chats を集約（backward の PackedSegment とは別形式）。
   *
   *   backward と同じ防波堤（caps の elapsedMs/bytes/segments/rows・visited 二重 fetch 防止・
   *   rate limit/abort）を適用する。停止すべきときは done(...) を返す（呼び出し側が return）。
   *   取得失敗（403/404・空）は best-effort でスキップ（公式チャンネル耐性）。
   *
   * @param {string[]} uris
   * @returns {AsyncGenerator<NdgrBackfillProgress, ReturnType<typeof done>|null, void>}
   */
  async function* drainPreviousUris(uris) {
    for (const uri of uris) {
      if (!uri || visited.has(uri)) continue;
      visited.add(uri);
      if (isAborted(signal)) return done('aborted');
      if (now() - t0 >= caps.elapsedMs) return done('cap_elapsed');
      if (bytesFetched >= caps.bytes) return done('cap_bytes');
      if (segmentsFetched >= caps.segments) return done('cap_segments');

      const res = await fetchWithThrottle(ctx, uri, false);
      if (res.rateLimited) return done('rate_limited');
      if (!res.bytes || res.bytes.length === 0) continue; // 取得失敗はスキップ（best-effort）
      bytesFetched += res.bytes.length;
      segmentsFetched += 1;

      // MessageSegment URI の中身 = ChunkedMessage の length-delimited stream。
      /** @type {import('./ndgrDecode.js').NdgrChat[]} */
      const chats = [];
      try {
        const frames = splitLengthDelimitedMessages(res.bytes);
        for (const frame of frames) {
          const decoded = decodeChunkedMessage(frame);
          if (decoded && Array.isArray(decoded.chats) && decoded.chats.length) {
            chats.push(...decoded.chats);
          }
        }
      } catch {
        // decode 失敗はスキップ（壊れたフレームで巡回を止めない）。
        continue;
      }

      if (chats.length) {
        rowsSeen += chats.length;
        const minNo = minNoOf(chats);
        const minVpos = minVposOf(chats);
        // previous chats も最古 vpos に反映（レジューム minVposReached / reached_start に統合）。
        if (
          minVpos != null &&
          (globalMinVpos == null || minVpos < globalMinVpos)
        ) {
          globalMinVpos = minVpos;
        }
        yield {
          chats,
          segmentsFetched,
          rowsSeen,
          bytesFetched,
          minCommentNo: minNo,
          minVposReached: globalMinVpos
        };
        if (rowsSeen >= caps.rows) return done('cap_rows');
      }
    }
    return null; // 正常完走（停止理由なし＝呼び出し側は続行）
  }

  /**
   * v0.1.431: 次の再シード at（秒）を決める。`desiredAtSec`（vpos 由来の理想点）を尊重しつつ、
   * 直前に種をまいた at（lastSeedAtSec）より必ず最低 1 バケット分前へ下げる（単調減少を保証）。
   * これにより、量子化された NDGR バケット（≒30〜45秒）の中で「同じバケットに舞い戻る」のを
   * 防ぐ（同一バケットは同一 backward URI を返し visited 詰まり→偽 no_progress を起こす）。
   *
   * ⚠️ programStart で「切り上げ」はしない: 切り上げると lastSeedAtSec より後ろに戻り得て
   *   単調減少が壊れる（種が programStart 前のテスト/異常配信で再シードが前進してしまう）。
   *   programStart を少し下回る at は NDGR が冒頭バケットか空を返し自然に終端するので無害。
   * @param {number} desiredAtSec
   * @returns {number}
   */
  const nextSeedAtSec = (desiredAtSec) => {
    let next = Math.floor(desiredAtSec);
    if (lastSeedAtSec != null) {
      const ceil = lastSeedAtSec - NDGR_BACKFILL_RESEED_BUCKET_STEP_SEC;
      if (next > ceil) next = ceil; // 直前の種より最低 1 バケット前に強制（単調減少）
    }
    return next;
  };

  // === 初回の入口探し: 起点が「過去への入口」を持たないことがある（押すタイミングで
  //   ライブ最先端に近すぎる等）。1 回で諦めず、起点を順に深い過去へずらして確実に
  //   入口を見つける（実機「1 回目0件のムラ」の根治）。配信開始時刻が分かればそれも候補に。===
  /** @type {number[]} 起点候補（現在からの秒数 lag）。浅い→深い順に試す。 */
  const seedLags = [
    NDGR_BACKFILL_SEED_LAG_SEC, 300, 900, 1800, 3600, 7200, 21600, 43200
  ];
  /** @type {number[]} 実際に試す at（秒）。programStart 近傍も末尾に足す。 */
  const seedCandidates = seedLags.map((lag) => nowSec - lag);
  if (programStartSec != null) {
    // v0.1.660: タイムシフト/録画再生では nowSec(現在時刻)が配信の実時間と大きくズレ、
    //   nowSec-lag の候補が全て「配信時間外」を指して入口が見つからず backward_exhausted に
    //   なっていた(実機 lv350689631・タイムシフト再生・公式779なのに記録15=2%停止)。
    //   programStart からの経過時間にわたって複数候補を足し、配信時間内の入口を確実に拾う。
    //   従来の programStartSec+60 単点だけだと、その時刻の区画にたまたま入口が無いと失敗した。
    for (const offset of [60, 300, 900, 1800, 3600, 7200, 14400, 28800]) {
      seedCandidates.push(programStartSec + offset);
    }
  }
  // v0.1.456 レジューム: 前回到達点(resumeFromVpos)と programStart が分かるとき、候補の
  //   先頭に「配信開始 + 最古オフセット − バッファ」を積む。最優先で前回の続きから掘り始め、
  //   入口が見つからなければ後続の従来候補（浅い→深い lag）に自然にフォールバックする。
  //   resumeFromVpos があっても programStart 不明なら従来どおり（at を算出できないため）。
  if (resumeFromVpos != null && programStartSec != null) {
    const resumeAtSec =
      programStartSec + Math.floor(resumeFromVpos / 100) - NDGR_BACKFILL_RESEED_BUFFER_SEC;
    if (resumeAtSec > 0) seedCandidates.unshift(resumeAtSec);
  }
  let seedAtSec = nowSec - NDGR_BACKFILL_SEED_LAG_SEC;
  let initialBackwardUri = '';
  // v0.1.457 previous 回収: 初回 seed で backward が見つかった ChunkedEntry の previous URI。
  //   backward 連鎖を辿る前に回収して「ライブ最前〜入口の隙間」を埋める。
  /** @type {string[]} */
  let initialPreviousUris = [];
  for (const cand of seedCandidates) {
    if (cand <= 0) continue;
    const seek = await seekBackwardUri(cand);
    if (abend.aborted) return done('aborted');
    if (abend.rateLimited) return done('rate_limited');
    if (seek.backwardUri) {
      initialBackwardUri = seek.backwardUri;
      initialPreviousUris = seek.previousUris;
      seedAtSec = cand;
      lastSeedAtSec = cand;
      break;
    }
  }
  if (!initialBackwardUri) return done('backward_exhausted', { crawl: _crawlDiag, seek: _seekDiag.slice(0, 30), cands: seedCandidates.slice(0, 10) });

  // === 外側ループ: 「?at={時刻} で backward 連鎖を辿る」を、配信開始に届くまで時刻を
  //   遡らせて繰り返す。1 本の backward 連鎖は時刻区画ごとに next=N で終端する（実機で
  //   約60%で打ち切られた真因）。終端しても配信開始でなければ、これまでの最古 vpos から
  //   さらに前の ?at で再シードして次の区画を取りに行く。新しく遡れなくなったら終了。===
  for (let reseed = 0; reseed < NDGR_BACKFILL_MAX_RESEEDS; reseed += 1) {
    if (isAborted(signal)) return done('aborted');
    if (now() - t0 >= caps.elapsedMs) return done('cap_elapsed');

    // v0.1.457 previous 回収: 初回 seed で得た previous（ライブ最前〜入口の隙間）を、
    //   backward 連鎖を辿る最初の反復の冒頭で1回だけ回収する（会議⑦＝案B・最小変更。
    //   再シードごとの回収は不要＝再シードは backward で過去を辿るため）。
    if (reseed === 0 && initialPreviousUris.length) {
      const stop = yield* drainPreviousUris(initialPreviousUris);
      initialPreviousUris = []; // 二重回収しない
      if (stop) return stop;
    }

    // 入口 URI: 初回は探索済み、再シード後は seedAtSec から探す。
    let backwardUri;
    if (reseed === 0) {
      backwardUri = initialBackwardUri;
    } else {
      lastSeedAtSec = seedAtSec; // この at で種をまいた（次回はこれより 1 バケット前へ）
      const seek = await seekBackwardUri(seedAtSec);
      backwardUri = seek.backwardUri;
    }
    if (abend.aborted) return done('aborted');
    if (abend.rateLimited) return done('rate_limited');
    // 入口が無い場合の扱い（v0.1.430 真因追補: 高速・大量配信で 32% 等で止まる）:
    //   旧実装は「再シードで入口が見つからない＝配信開始到達(reached_start)」としていた。だが
    //   高速配信では、再シード時刻が区画の隙間に落ちたり候補 URL が既 visited だと、まだ古い
    //   コメントが残っていても入口が見つからないことがある（= 偽の reached_start・32% 停止の主因）。
    //   そこで「入口が見つからない」も即終了せず、起点をさらに前へ大きく戻して数回リトライする。
    //   本当に配信開始まで遡れたか（最古 vpos が近傍か）で reached_start を判定し、retry を
    //   使い切っても入口が出ないなら no_progress（嘘の達成を出さない）。
    if (!backwardUri) {
      if (reseed === 0) return done('backward_exhausted');
      // 既に配信開始近傍まで遡れているなら、入口が無いのは自然＝本当の reached_start。
      // v0.1.434: 単一最小 vpos(globalMinVpos)ではなく「最後に遡れた区画が開始区画らしかったか」を
      //   見る。外れ値 1 件で globalMinVpos が極小化していても、その区画が開始近傍 vpos を複数
      //   持たなければフラグは立たず、正しく no_progress（→ partial）に倒れる。
      if (reachedStreamStartChain) {
        // v0.1.443: 副経路発火時の判定根拠を診断情報として残す。
        return done('reached_start', {
          reachedStartChats: reachedStreamStartChats ? reachedStreamStartChats.slice() : [],
          reachedStartPath: 'side'
        });
      }
      noProgressStreak += 1;
      if (noProgressStreak > NDGR_BACKFILL_NO_PROGRESS_RETRY_MAX) {
        // v0.1.691: 一度も chat を取れていない＝入口問題として正直に報告（診断付き）。
        // 1件でも取れたことがあるなら従来どおり no_progress。
        return done(
          everMadeProgress ? 'no_progress' : 'backward_exhausted',
          { crawl: _crawlDiag, seek: _seekDiag.slice(0, 30), cands: seedCandidates.slice(0, 10) }
        );
      }
      // v0.1.431: 起点を「直前の種より 1 バケット分ずつ」前へ戻して再探索する。旧実装は
      //   1200s×streak も戻し、46 分級の配信では配信開始を飛び越して programStart に張り付き、
      //   毎回同じ場所＝ no_progress 即終了だった。バケット幅で着実に隣のバケットへ降ろす。
      seedAtSec = nextSeedAtSec(seedAtSec - NDGR_BACKFILL_RESEED_BUCKET_STEP_SEC);
      continue;
    }

    // --- 3) backward URI を PackedSegment として next.uri で辿る（1 区画ぶん） ---
    let chainMinVpos = null;
    /**
     * @type {import('./ndgrDecode.js').NdgrChat[]} v0.1.434: この区画で取り込んだ chat を貯める。
     *   reached_start 判定を「単一最小 vpos」でなく「開始近傍 vpos が複数あるか」で行うため、区画の
     *   chat 配列を chainLooksLikeStreamStart に渡せるようにする。再シードのたびにリセット（1 区画ぶん）。
     */
    const chainChats = [];
    for (;;) {
      if (isAborted(signal)) return done('aborted');
      if (now() - t0 >= caps.elapsedMs) return done('cap_elapsed');
      if (bytesFetched >= caps.bytes) return done('cap_bytes');
      if (segmentsFetched >= caps.segments) return done('cap_segments');
      if (visited.has(backwardUri)) break; // この区画は辿り終えた
      visited.add(backwardUri);

      const bwRes = await fetchWithThrottle(ctx, backwardUri, false);
      if (bwRes.rateLimited) return done('rate_limited');
      if (!bwRes.bytes || bwRes.bytes.length === 0) break; // この区画終わり
      bytesFetched += bwRes.bytes.length;
      segmentsFetched += 1;

      const { results, nextUri } = decodePackedSegmentNav(bwRes.bytes);
      /** @type {import('./ndgrDecode.js').NdgrChat[]} */
      const chats = [];
      for (const r of results) {
        if (r && Array.isArray(r.chats) && r.chats.length) chats.push(...r.chats);
      }

      if (chats.length) {
        rowsSeen += chats.length;
        chainChats.push(...chats); // v0.1.434: 区画の chat を集約（開始区画らしさの判定に使う）
        const minNo = minNoOf(chats);
        const minVpos = minVposOf(chats);
        if (minVpos != null && (chainMinVpos == null || minVpos < chainMinVpos)) {
          chainMinVpos = minVpos;
        }
        // v0.1.456 レジューム: この時点で到達している最古 vpos（過去区画の globalMinVpos と
        //   今 chain の chainMinVpos の小さい方）を載せる。呼び出し側が persist バッチ境界で
        //   coalesce 保存し、途中中断でも続きから再開できるようにする。
        const minVposSoFar =
          globalMinVpos == null
            ? chainMinVpos
            : chainMinVpos == null
              ? globalMinVpos
              : Math.min(globalMinVpos, chainMinVpos);
        yield {
          chats,
          segmentsFetched,
          rowsSeen,
          bytesFetched,
          minCommentNo: minNo,
          minVposReached: minVposSoFar
        };
        if (rowsSeen >= caps.rows) return done('cap_rows');
      }

      if (!nextUri) break; // この区画の終端（next=N）。外側ループで再シードする。
      backwardUri = nextUri;
    }

    // === 再シード判定（v0.1.429 真因修正: 早期終了で途中参加が数%しか取れないバグ）===
    //   旧実装は「この区画で前回より古い vpos へ進めなかった」を即 reached_start（配信開始
    //   到達）とみなして終了していた。だが「進めなかった」≠「配信開始」: 途中参加だと
    //   再シード起点(programStart+最古vpos-5s)で見つかる区画が前回と重なり/1区画戻れない
    //   ことが頻発し、まだ vpos が大きい(配信序盤まで程遠い)のに『着いた』と誤判定→数%で停止
    //   ＋『ぜんぶ届いた』誤表示。実機で途中参加の全配信で 1〜5% 再現。
    //
    //   正しい停止＝(A) 真に古いものが無い: chainMinVpos が配信開始近傍(<=NEAR_START_VPOS)に
    //   到達 → reached_start。(B) backward 入口が尽きた(backwardUri 無し)→ 上の if で既に処理。
    //   「進めなかっただけ」は (C) 起点をさらに大きく戻して数回リトライ。リトライしても進めない
    //   なら reached_start ではなく no_progress で終える(嘘の達成を言わない)。
    // ⚡ v0.1.455 真因修正（数値トレースで確定・ユーザー実機 2026-05-29 で 12%/33%/78% にばらつき停止）:
    //   旧実装は「この区画で 1 件も vpos が取れなかった（chainMinVpos==null＝空区画）」を、
    //   reseed>0 なら即 no_progress で**一発終了**していた（リトライ無し）。だが空区画は
    //   「配信開始に着いた」ではなく「再シード起点がたまたまコメントの無い時間帯の隙間や
    //   運営コメントだけの区画に落ちただけ」のことが頻発する。一度引くだけで諦めるため、
    //   配信のどの地点でも突然停止し（どこで空区画を引くかは運次第＝12%/33%/78% のばらつき）、
    //   「もう一度」を押しても同じ起点で同じ空区画に落ちて決定的に同じ所で死ぬ（902→907）。
    //   修正: 空区画も「進めなかった」と同じリトライ経路に合流させ、起点をさらに前へ戻して
    //   次の区画を試す（＝空区画を飛び越えて遡り続ける）。リトライ上限を超えたら no_progress。
    //   v0.1.691: 当時 reseed===0（初回）の空区画だけは即 backward_exhausted とする特例を残して
    //   いたが、初回 seed がたまたま空区画（若い/短い配信の序盤疎区間）に落ちると一発死するため
    //   撤去した。初回の空区画も同じリトライ経路に合流させる。
    //
    //   配信開始近傍に到達したら本当の完了。v0.1.434: 単一最小 vpos ではなく「開始近傍
    //   (NEAR_START_VPOS_CS 以内)の vpos が複数あるか」で判定する。運営/system/gift の極小 vpos が
    //   中盤の区画に 1 件紛れても発火しない（47%/51% で『ぜんぶ届いた』誤表示の真因）。真の開始
    //   区画は冒頭の低 vpos が複数→通る。空区画（chainChats 空）は当然この判定を通らない。
    if (chainMinVpos != null &&
        chainLooksLikeStreamStart(chainChats, { nearStartCs: NDGR_BACKFILL_NEAR_START_VPOS_CS })) {
      // v0.1.443: 主経路発火時の判定根拠を診断情報として残す（実機で誤判定の真因確定用）。
      return done('reached_start', { reachedStartChats: chainChats.slice(), reachedStartPath: 'main' });
    }
    // v0.1.455: 「空区画(chainMinVpos==null)」も「前回より古い vpos へ進めなかった」も、どちらも
    //   『進捗が無かった』として同じリトライ経路で扱う（空区画を飛び越えて遡り続ける）。
    const madeProgress =
      chainMinVpos != null && (globalMinVpos == null || chainMinVpos < globalMinVpos);
    if (!madeProgress) {
      // v0.1.691: 旧「reseed===0 かつ空区画なら即 backward_exhausted」特例はここから撤去（上の
      //   v0.1.455 コメント参照）。初回の空区画もリトライ経路に合流させる。
      // 進めなかった／空区画だった。即終了せず、起点をさらに前へ戻してリトライする。
      noProgressStreak += 1;
      if (noProgressStreak > NDGR_BACKFILL_NO_PROGRESS_RETRY_MAX) {
        // 何度戻しても古い区画に入れない＝ここで諦める。ただし配信開始とは限らないので
        // reached_start とは言わない（『ぜんぶ届いた』を出さない）。
        // v0.1.691: 一度も chat を取れていない＝入口問題として正直に報告（診断付き・
        //   data-nls-backfill-diag に出る）。1件でも取れたことがあるなら従来どおり no_progress。
        return done(
          everMadeProgress ? 'no_progress' : 'backward_exhausted',
          { crawl: _crawlDiag, seek: _seekDiag.slice(0, 30), cands: seedCandidates.slice(0, 10) }
        );
      }
      // v0.1.431: 起点を「直前の種より 1 バケット分ずつ」前へ戻す（旧 1200s×streak は配信開始を
      //   飛び越え programStart 張り付き→毎回同じ場所→偽 no_progress だった）。
      seedAtSec = nextSeedAtSec(seedAtSec - NDGR_BACKFILL_RESEED_BUCKET_STEP_SEC);
      continue; // 同じ reseed 予算内で次の起点を試す
    }
    // 進めた。最古 vpos を更新し、no-progress 連続カウンタをリセット。
    noProgressStreak = 0;
    everMadeProgress = true; // v0.1.691: 予算超過時の終了理由出し分け用（前進歴あり）
    globalMinVpos = chainMinVpos;
    // v0.1.434: この「実際に遡れた区画」が開始区画らしかったかを記録。入口が尽きた時（副経路）の
    //   reached_start 判定に使う。単一最小値ではなく開始近傍 vpos の複数性で見るので外れ値に強い。
    reachedStreamStartChain = chainLooksLikeStreamStart(chainChats, {
      nearStartCs: NDGR_BACKFILL_NEAR_START_VPOS_CS
    });
    // v0.1.443: フラグが立った瞬間の chats を診断用に保存（副経路発火時に戻り値で参照する）。
    if (reachedStreamStartChain) {
      reachedStreamStartChats = chainChats.slice();
    }
    // 次の区画は「最古コメントの実時刻より少し前」から。vpos(センチ秒)→秒に直して
    //   配信開始(秒) + 最古オフセット - バッファ を理想点にしつつ、v0.1.431 では
    //   nextSeedAtSec で「直前の種より最低 1 バケット前」に強制する。これが無いと、量子化された
    //   NDGR バケット（≒30〜45秒）内で oldestOffset-5s が同じバケットに舞い戻り、その backward URI
    //   が既に visited → 入口なし → 偽 no_progress で 34% 等で停止していた（爆速配信の真因）。
    if (programStartSec != null) {
      const oldestOffsetSec = Math.floor(chainMinVpos / 100);
      seedAtSec = nextSeedAtSec(
        programStartSec + oldestOffsetSec - NDGR_BACKFILL_RESEED_BUFFER_SEC
      );
    } else {
      // 配信開始不明: 直前の種から 1 バケットぶん確実に戻す（相対）。
      seedAtSec = nextSeedAtSec(seedAtSec - NDGR_BACKFILL_RESEED_BUCKET_STEP_SEC);
    }
  }
  return done('cap_reseeds');
}

/**
 * NDGR を backward / previous ポインタだけで決定論的に巡回する新バックフィルエンジン。
 *
 * 旧 crawlNdgrBackward と同じ generator 契約を保つが、`reached_start` の判定に
 * chainLooksLikeStreamStart / vpos 近傍ヒューリスティックは使わない。未訪問の
 * backward / previous ポインタが尽きた時だけ reached_start とする。
 *
 * @param {object} opts
 * @param {string} opts.viewBase NDGR view エンドポイントのベース URL（`?at=` 前）。
 * @param {(url: string, o: { signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, bytes: Uint8Array }>} opts.fetchBinary
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 * @param {() => number} [opts.now]
 * @param {Partial<NdgrBackfillCaps>} [opts.caps]
 * @param {number} [opts.fetchGapMs]
 * @param {number|null} [opts.programStartSec]
 * @param {number|null} [opts.resumeFromVpos]
 * @param {AbortSignal} [opts.signal]
 * @returns {AsyncGenerator<NdgrBackfillProgress, { stopReason: NdgrBackfillStopReason, segmentsFetched: number, rowsSeen: number, bytesFetched: number, minVposReached: number|null, diagnostics: object|null }, void>}
 */
export async function* crawlNdgrBackwardDeterministic(opts) {
  const viewBase = String(opts?.viewBase || '').trim();
  const fetchBinary = opts?.fetchBinary;
  const sleep =
    typeof opts?.sleep === 'function'
      ? opts.sleep
      : (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
  const now = typeof opts?.now === 'function' ? opts.now : () => Date.now();
  const programStartSec =
    typeof opts?.programStartSec === 'number' && opts.programStartSec > 0
      ? Math.floor(opts.programStartSec)
      : null;
  const resumeFromVpos =
    typeof opts?.resumeFromVpos === 'number' &&
    Number.isFinite(opts.resumeFromVpos) &&
    opts.resumeFromVpos > 0
      ? Math.floor(opts.resumeFromVpos)
      : null;
  const caps = { ...NDGR_BACKFILL_DEFAULT_CAPS, ...(opts?.caps || {}) };
  const gapMs =
    typeof opts?.fetchGapMs === 'number' && opts.fetchGapMs >= 0
      ? opts.fetchGapMs
      : NDGR_BACKFILL_FETCH_GAP_MS;
  const signal = opts?.signal;

  let segmentsFetched = 0;
  let rowsSeen = 0;
  let bytesFetched = 0;
  /** @type {number|null} */
  let globalMinVpos = resumeFromVpos;
  const t0 = now();

  const summary = () => ({
    segmentsFetched,
    rowsSeen,
    bytesFetched,
    minVposReached: globalMinVpos
  });
  const done = (/** @type {NdgrBackfillStopReason} */ reason) => ({
    stopReason: reason,
    ...summary(),
    diagnostics: /** @type {object|null} */ (null)
  });

  if (!viewBase) return done('no_view_base');
  if (typeof fetchBinary !== 'function') return done('no_view_base');
  if (isAborted(signal)) return done('aborted');

  const ctx = { fetchBinary, sleep, signal, gapMs };
  /** @type {Set<string>} view/backward/previous の再訪防止キー。 */
  const visited = new Set();
  /** @type {string[]} */
  const backwardQueue = [];
  /** @type {string[]} */
  const previousQueue = [];

  /** @returns {NdgrBackfillStopReason|''} */
  const limitReason = () => {
    if (isAborted(signal)) return 'aborted';
    if (now() - t0 >= caps.elapsedMs) return 'cap_elapsed';
    if (bytesFetched >= caps.bytes) return 'cap_bytes';
    if (segmentsFetched >= caps.segments) return 'cap_segments';
    return '';
  };

  /**
   * @param {'backward'|'previous'} kind
   * @param {string} uri
   * @param {boolean} [front]
   * @returns {boolean}
   */
  const enqueuePointer = (kind, uri, front = false) => {
    const u = String(uri || '').trim();
    if (!u) return false;
    const key = `${kind}:${u}`;
    if (visited.has(key)) return false;
    visited.add(key);
    if (kind === 'backward') {
      if (front) backwardQueue.unshift(u);
      else backwardQueue.push(u);
      return true;
    }
    previousQueue.push(u);
    return true;
  };

  /** @param {{ backwardUri?: string, previousUris?: string[] }} entry */
  const enqueueEntryPointers = (entry) => {
    let added = false;
    if (entry && entry.backwardUri) {
      added = enqueuePointer('backward', entry.backwardUri) || added;
    }
    const prevs = Array.isArray(entry?.previousUris) ? entry.previousUris : [];
    for (const uri of prevs) {
      added = enqueuePointer('previous', uri) || added;
    }
    return added;
  };

  /**
   * ?at={startAt} から ChunkedEntry を読み、backward / previous の未訪問ポインタを返す。
   * backward が無い entry では nextAt を最大 20 hop だけ辿る（旧エンジンと同じ入口探索）。
   *
   * @param {number} startAt
   * @returns {Promise<{ entry: { backwardUri: string, previousUris: string[] }|null, stopReason: NdgrBackfillStopReason|'' }>}
   */
  const seekEntryPointers = async (startAt) => {
    let viewAt = startAt;
    for (let hop = 0; hop < 20; hop += 1) {
      const before = limitReason();
      if (before) return { entry: null, stopReason: before };
      const url = buildViewAtUrl(viewBase, viewAt);
      const key = `view:${url}`;
      if (visited.has(key)) return { entry: null, stopReason: '' };
      visited.add(key);

      const entryRes = await fetchWithThrottle(ctx, url, false);
      if (entryRes.rateLimited) return { entry: null, stopReason: 'rate_limited' };
      if (isAborted(signal)) return { entry: null, stopReason: 'aborted' };
      if (!entryRes.bytes || entryRes.bytes.length === 0) {
        return { entry: null, stopReason: '' };
      }
      bytesFetched += entryRes.bytes.length;
      if (bytesFetched >= caps.bytes) return { entry: null, stopReason: 'cap_bytes' };

      const entryNav = decodeChunkedEntry(entryRes.bytes);
      const previousUris = Array.isArray(entryNav.previousUris) ? entryNav.previousUris : [];
      if (entryNav.backwardUri || previousUris.length) {
        return {
          entry: {
            backwardUri: entryNav.backwardUri || '',
            previousUris
          },
          stopReason: ''
        };
      }
      if (entryNav.nextAt == null || entryNav.nextAt === viewAt) {
        return { entry: null, stopReason: '' };
      }
      viewAt = entryNav.nextAt;
    }
    return { entry: null, stopReason: '' };
  };

  const nowRes = await fetchWithThrottle(ctx, buildViewAtUrl(viewBase, 'now'), true);
  if (nowRes.rateLimited) return done('rate_limited');
  if (isAborted(signal)) return done('aborted');
  if (!nowRes.bytes || nowRes.bytes.length === 0) return done('no_entry');
  bytesFetched += nowRes.bytes.length;
  if (bytesFetched >= caps.bytes) return done('cap_bytes');
  const nowNav = decodeChunkedEntry(nowRes.bytes);
  if (nowNav.nextAt == null) return done('no_entry');

  const nowSec = Math.floor(t0 / 1000);
  const seedLags = [
    NDGR_BACKFILL_SEED_LAG_SEC, 300, 900, 1800, 3600, 7200, 21600, 43200
  ];
  const seedCandidates = seedLags.map((lag) => nowSec - lag);
  if (programStartSec != null) seedCandidates.push(programStartSec + 60);
  if (resumeFromVpos != null && programStartSec != null) {
    const resumeAtSec =
      programStartSec + Math.floor(resumeFromVpos / 100) - NDGR_BACKFILL_RESEED_BUFFER_SEC;
    if (resumeAtSec > 0) seedCandidates.unshift(resumeAtSec);
  }

  /** @type {number|null} 直近に ?at seed した実時刻（秒）。再シードを単調に古くする。 */
  let lastSeedAtSec = null;
  /** @type {number} キュー枯渇後の ?at 再シード試行回数。 */
  let reseedAttempts = 0;
  /** @type {number} 連続して未訪問 entry に進めなかった回数。 */
  let noProgressStreak = 0;
  /** @type {number} 初回 seed 後に、新しい entry へ橋渡しできた回数。 */
  let successfulReseeds = 0;

  /**
   * @param {number} desiredAtSec
   * @returns {number}
   */
  const nextSeedAtSec = (desiredAtSec) => {
    let next = Math.floor(desiredAtSec);
    if (!Number.isFinite(next)) {
      next = (lastSeedAtSec ?? (nowSec - NDGR_BACKFILL_SEED_LAG_SEC)) -
        NDGR_BACKFILL_RESEED_BUCKET_STEP_SEC;
    }
    if (lastSeedAtSec != null) {
      const ceiling = lastSeedAtSec - NDGR_BACKFILL_RESEED_BUCKET_STEP_SEC;
      if (next > ceiling) next = ceiling;
    }
    return next;
  };

  /**
   * これまで到達した最古コメントの実時刻を優先し、算出できないときは直近 seed から
   * 1 bucket ずつ後退する。停止判定には使わず、次の ChunkedEntry 入口探索にだけ使う。
   *
   * @returns {number}
   */
  const nextReseedAtSec = () => {
    if (programStartSec != null && globalMinVpos != null) {
      return nextSeedAtSec(programStartSec + Math.floor(globalMinVpos / 100));
    }
    return nextSeedAtSec(
      (lastSeedAtSec ?? (nowSec - NDGR_BACKFILL_SEED_LAG_SEC)) -
        NDGR_BACKFILL_RESEED_BUCKET_STEP_SEC
    );
  };

  /**
   * キュー枯渇時に、前 bucket の ChunkedEntry を ?at で取り直す。
   * - 新しい pointer が得られたらキューへ積む。
   * - entry は返ったが pointer がすべて visited の場合は、少なくとも一度 bucket を
   *   跨いだ後だけ true exhaustion とみなし reached_start を許す。
   * - entry 自体が無い/空振りは bounded retry の対象で、reached_start とは言わない。
   *
   * @returns {Promise<NdgrBackfillStopReason|''>}
   */
  const reseedWhenIdle = async () => {
    if (reseedAttempts >= NDGR_BACKFILL_MAX_RESEEDS) return 'cap_reseeds';
    const seedAtSec = nextReseedAtSec();
    reseedAttempts += 1;
    lastSeedAtSec = seedAtSec;

    const seek = await seekEntryPointers(seedAtSec);
    if (seek.stopReason) return seek.stopReason;
    if (seek.entry) {
      if (enqueueEntryPointers(seek.entry)) {
        successfulReseeds += 1;
        noProgressStreak = 0;
        return '';
      }
      if (rowsSeen > 0 && successfulReseeds > 0) {
        return 'reached_start';
      }
    }

    noProgressStreak += 1;
    if (noProgressStreak > NDGR_BACKFILL_NO_PROGRESS_RETRY_MAX) return 'no_progress';
    return '';
  };

  let seeded = false;
  for (const cand of seedCandidates) {
    if (cand <= 0) continue;
    const seek = await seekEntryPointers(cand);
    if (seek.stopReason) return done(seek.stopReason);
    if (seek.entry && enqueueEntryPointers(seek.entry)) {
      lastSeedAtSec = cand;
      seeded = true;
      break;
    }
  }
  if (!seeded) return done('backward_exhausted');

  for (;;) {
    const before = limitReason();
    if (before) return done(before);
    if (!backwardQueue.length && !previousQueue.length) {
      if (rowsSeen <= 0) return done('backward_exhausted');
      const stop = await reseedWhenIdle();
      if (stop) return done(stop);
      continue;
    }

    if (backwardQueue.length) {
      const uri = backwardQueue.shift();
      if (!uri) continue;
      const bwRes = await fetchWithThrottle(ctx, uri, false);
      if (bwRes.rateLimited) return done('rate_limited');
      if (isAborted(signal)) return done('aborted');
      if (!bwRes.bytes || bwRes.bytes.length === 0) continue;
      bytesFetched += bwRes.bytes.length;
      segmentsFetched += 1;

      const { results, nextUri } = decodePackedSegmentNav(bwRes.bytes);
      /** @type {import('./ndgrDecode.js').NdgrChat[]} */
      const chats = [];
      for (const r of results) {
        if (r && Array.isArray(r.chats) && r.chats.length) chats.push(...r.chats);
      }
      if (chats.length) {
        rowsSeen += chats.length;
        const minVpos = minVposOf(chats);
        if (minVpos != null && (globalMinVpos == null || minVpos < globalMinVpos)) {
          globalMinVpos = minVpos;
        }
        yield {
          chats,
          segmentsFetched,
          rowsSeen,
          bytesFetched,
          minCommentNo: minNoOf(chats),
          minVposReached: globalMinVpos
        };
        if (rowsSeen >= caps.rows) return done('cap_rows');
      }
      if (nextUri) enqueuePointer('backward', nextUri, true);
      if (bytesFetched >= caps.bytes) return done('cap_bytes');
      if (segmentsFetched >= caps.segments && (backwardQueue.length || previousQueue.length)) {
        return done('cap_segments');
      }
      continue;
    }

    const uri = previousQueue.shift();
    if (!uri) continue;
    const prevRes = await fetchWithThrottle(ctx, uri, false);
    if (prevRes.rateLimited) return done('rate_limited');
    if (isAborted(signal)) return done('aborted');
    if (!prevRes.bytes || prevRes.bytes.length === 0) continue;
    bytesFetched += prevRes.bytes.length;
    segmentsFetched += 1;

    /** @type {import('./ndgrDecode.js').NdgrChat[]} */
    const chats = [];
    try {
      const frames = splitLengthDelimitedMessages(prevRes.bytes);
      for (const frame of frames) {
        const decoded = decodeChunkedMessage(frame);
        if (decoded && Array.isArray(decoded.chats) && decoded.chats.length) {
          chats.push(...decoded.chats);
        }
      }
    } catch {
      // 壊れた previous segment は best-effort で捨て、他のポインタ巡回を続ける。
    }

    if (chats.length) {
      rowsSeen += chats.length;
      const minVpos = minVposOf(chats);
      if (minVpos != null && (globalMinVpos == null || minVpos < globalMinVpos)) {
        globalMinVpos = minVpos;
      }
      yield {
        chats,
        segmentsFetched,
        rowsSeen,
        bytesFetched,
        minCommentNo: minNoOf(chats),
        minVposReached: globalMinVpos
      };
      if (rowsSeen >= caps.rows) return done('cap_rows');
    }
    if (bytesFetched >= caps.bytes) return done('cap_bytes');
    if (segmentsFetched >= caps.segments && (backwardQueue.length || previousQueue.length)) {
      return done('cap_segments');
    }
  }
}
