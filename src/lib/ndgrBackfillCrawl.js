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
 */
export const NDGR_BACKFILL_NO_PROGRESS_RETRY_MAX = 4;

/** 429/403 を受けたときの backoff 待機列（ms）。これを使い切ったら巡回中断。 */
export const NDGR_BACKFILL_BACKOFF_MS = Object.freeze([2_000, 4_000, 8_000]);

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
 *   minCommentNo: number|null
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

  let backoffIdx = 0;
  for (;;) {
    let res;
    try {
      res = await ctx.fetchBinary(url, { signal: ctx.signal });
    } catch {
      // ネットワーク失敗・Abort 等。これ以上の遡及は諦める（best-effort）。
      return { bytes: null, rateLimited: false };
    }
    if (res && res.ok && res.bytes) {
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
    // その他のエラー（404 等）は best-effort で打ち切り。
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
 * @param {AbortSignal} [opts.signal] タブ非表示 / SPA 遷移での中断用。
 * @returns {AsyncGenerator<NdgrBackfillProgress, { stopReason: NdgrBackfillStopReason, segmentsFetched: number, rowsSeen: number, bytesFetched: number }, void>}
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
  const caps = { ...NDGR_BACKFILL_DEFAULT_CAPS, ...(opts?.caps || {}) };
  const gapMs =
    typeof opts?.fetchGapMs === 'number' && opts.fetchGapMs >= 0
      ? opts.fetchGapMs
      : NDGR_BACKFILL_FETCH_GAP_MS;
  const signal = opts?.signal;

  let segmentsFetched = 0;
  let rowsSeen = 0;
  let bytesFetched = 0;

  const summary = () => ({ segmentsFetched, rowsSeen, bytesFetched });
  /** @param {NdgrBackfillStopReason} reason */
  const done = (reason) => ({ stopReason: reason, ...summary() });

  if (!viewBase) return done('no_view_base');
  if (typeof fetchBinary !== 'function') return done('no_view_base');

  const ctx = { fetchBinary, sleep, signal, gapMs };

  // --- 1) ?at=now で現在地点ポインタ（nextAt）を得る ---
  if (isAborted(signal)) return done('aborted');
  const nowRes = await fetchWithThrottle(ctx, buildViewAtUrl(viewBase, 'now'), true);
  if (nowRes.rateLimited) return done('rate_limited');
  if (!nowRes.bytes || nowRes.bytes.length === 0) return done('no_entry');
  bytesFetched += nowRes.bytes.length;
  const nowNav = decodeChunkedEntry(nowRes.bytes);
  if (nowNav.nextAt == null) return done('no_entry');

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
  /** @type {number|null} これまでに遡れた最古コメントの vpos（センチ秒）。再シード判定用。 */
  let globalMinVpos = null;
  /**
   * @type {boolean} v0.1.434: 直近に「本当に古い区画へ進めた」とき、その区画が開始区画らしかったか
   *   （chainLooksLikeStreamStart の結果）。副経路（入口が尽きた時）の reached_start 判定に使う。
   *   globalMinVpos は区画をまたいだ単一最小値で外れ値 1 件に汚染されうるため、単一最小値でなく
   *   「最後に取り込めた区画が開始近傍 vpos を複数持っていたか」をこのフラグで記録して参照する。
   */
  let reachedStreamStartChain = false;
  /**
   * @type {number|null} v0.1.431: 直前に「種をまいた at（秒）」。次の再シードは必ずこれより
   *   最低 1 バケット分（NDGR_BACKFILL_RESEED_BUCKET_STEP_SEC）前へ下げ、同じバケットへ
   *   舞い戻って visited 詰まり→偽 no_progress になるのを防ぐ（爆速配信 34% 停止の真因）。
   */
  let lastSeedAtSec = null;
  /** @type {number} v0.1.429: 「古い区画へ進めなかった」連続回数（起点を戻してリトライする）。 */
  let noProgressStreak = 0;
  /** @type {{ rateLimited?: boolean, aborted?: boolean }} ヘルパからの異常通知 */
  const abend = {};

  /**
   * ?at={startAt} から View を読み、backward が出るまで next を辿って入口 URI を返す。
   * 見つからなければ ''。rate limit/abort は abend に立てて呼び出し側で停止する。
   * @param {number} startAt
   * @returns {Promise<string>}
   */
  const seekBackwardUri = async (startAt) => {
    let viewAt = startAt;
    for (let hop = 0; hop < 20; hop += 1) {
      if (isAborted(signal)) { abend.aborted = true; return ''; }
      if (now() - t0 >= caps.elapsedMs) { abend.aborted = true; return ''; }
      const atUrl = buildViewAtUrl(viewBase, viewAt);
      if (visited.has(atUrl)) return '';
      visited.add(atUrl);
      const entryRes = await fetchWithThrottle(ctx, atUrl, false);
      if (entryRes.rateLimited) { abend.rateLimited = true; return ''; }
      if (!entryRes.bytes || entryRes.bytes.length === 0) return '';
      bytesFetched += entryRes.bytes.length;
      const entryNav = decodeChunkedEntry(entryRes.bytes);
      if (entryNav.backwardUri) return entryNav.backwardUri;
      if (entryNav.nextAt == null || entryNav.nextAt === viewAt) return '';
      viewAt = entryNav.nextAt;
    }
    return '';
  };

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
    // 配信開始の少し後（最初の数十秒）も候補に。ここは確実に backward を持つはず。
    seedCandidates.push(programStartSec + 60);
  }
  let seedAtSec = nowSec - NDGR_BACKFILL_SEED_LAG_SEC;
  let initialBackwardUri = '';
  for (const cand of seedCandidates) {
    if (cand <= 0) continue;
    initialBackwardUri = await seekBackwardUri(cand);
    if (abend.aborted) return done('aborted');
    if (abend.rateLimited) return done('rate_limited');
    if (initialBackwardUri) { seedAtSec = cand; lastSeedAtSec = cand; break; }
  }
  if (!initialBackwardUri) return done('backward_exhausted');

  // === 外側ループ: 「?at={時刻} で backward 連鎖を辿る」を、配信開始に届くまで時刻を
  //   遡らせて繰り返す。1 本の backward 連鎖は時刻区画ごとに next=N で終端する（実機で
  //   約60%で打ち切られた真因）。終端しても配信開始でなければ、これまでの最古 vpos から
  //   さらに前の ?at で再シードして次の区画を取りに行く。新しく遡れなくなったら終了。===
  for (let reseed = 0; reseed < NDGR_BACKFILL_MAX_RESEEDS; reseed += 1) {
    if (isAborted(signal)) return done('aborted');
    if (now() - t0 >= caps.elapsedMs) return done('cap_elapsed');

    // 入口 URI: 初回は探索済み、再シード後は seedAtSec から探す。
    let backwardUri;
    if (reseed === 0) {
      backwardUri = initialBackwardUri;
    } else {
      lastSeedAtSec = seedAtSec; // この at で種をまいた（次回はこれより 1 バケット前へ）
      backwardUri = await seekBackwardUri(seedAtSec);
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
        return done('reached_start');
      }
      noProgressStreak += 1;
      if (noProgressStreak > NDGR_BACKFILL_NO_PROGRESS_RETRY_MAX) {
        return done('no_progress');
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
        yield {
          chats,
          segmentsFetched,
          rowsSeen,
          bytesFetched,
          minCommentNo: minNo
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
    if (chainMinVpos == null) {
      // この区画で 1 件も vpos が取れなかった＝これ以上の手掛かり無し。初回なら入口問題、
      // 再シード後なら『取り切った』とは言い切れないので no_progress。
      return done(reseed === 0 ? 'backward_exhausted' : 'no_progress');
    }
    // 配信開始近傍に到達したら本当の完了。v0.1.434: 単一最小 vpos ではなく「開始近傍(NEAR_START_VPOS_CS
    //   以内)の vpos が複数あるか」で判定する。運営/system/gift の極小 vpos が中盤の区画に 1 件紛れても
    //   発火しない（47%/51% で『ぜんぶ届いた』誤表示の真因）。真の開始区画は冒頭の低 vpos が複数→通る。
    if (chainLooksLikeStreamStart(chainChats, { nearStartCs: NDGR_BACKFILL_NEAR_START_VPOS_CS })) {
      return done('reached_start');
    }
    const madeProgress = globalMinVpos == null || chainMinVpos < globalMinVpos;
    if (!madeProgress) {
      // 進めなかった。即 reached_start にせず、起点をさらに大きく戻してリトライする。
      noProgressStreak += 1;
      if (noProgressStreak > NDGR_BACKFILL_NO_PROGRESS_RETRY_MAX) {
        // 何度戻しても古い区画に入れない＝ここで諦める。ただし配信開始とは限らないので
        // reached_start とは言わない（『ぜんぶ届いた』を出さない）。
        return done('no_progress');
      }
      // v0.1.431: 起点を「直前の種より 1 バケット分ずつ」前へ戻す（旧 1200s×streak は配信開始を
      //   飛び越え programStart 張り付き→毎回同じ場所→偽 no_progress だった）。
      seedAtSec = nextSeedAtSec(seedAtSec - NDGR_BACKFILL_RESEED_BUCKET_STEP_SEC);
      continue; // 同じ reseed 予算内で次の起点を試す
    }
    // 進めた。最古 vpos を更新し、no-progress 連続カウンタをリセット。
    noProgressStreak = 0;
    globalMinVpos = chainMinVpos;
    // v0.1.434: この「実際に遡れた区画」が開始区画らしかったかを記録。入口が尽きた時（副経路）の
    //   reached_start 判定に使う。単一最小値ではなく開始近傍 vpos の複数性で見るので外れ値に強い。
    reachedStreamStartChain = chainLooksLikeStreamStart(chainChats, {
      nearStartCs: NDGR_BACKFILL_NEAR_START_VPOS_CS
    });
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
