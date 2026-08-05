// @ts-nocheck — MAIN world IIFE; DOM/ページ型が広く any 相当
/**
 * MAIN world エントリ（esbuild で単一 IIFE にバンドルされる）
 */
import {
  createLengthDelimitedStreamAccumulator,
  splitLengthDelimitedMessagesWithTail
} from '../lib/lengthDelimitedStream.js';
import { extractPairsFromBinaryUtf8 } from '../lib/interceptBinaryTextExtract.js';
import { decodeChunkedMessage, decodePackedSegment, ndgrStatisticsHasWireSignal } from '../lib/ndgrDecode.js';
import { ndgrChatsToMergeRows } from '../lib/ndgrChatRows.js';
import { createNdgrMessageDedupe } from '../lib/ndgrMessageDedupe.js';
import { anonymousNicknameFallback } from '../lib/nicoAnonymousDisplay.js';
import {
  collectInterceptSignalsFromObject,
  extractLearnUsersFromNicoUserIconUrlsInString
} from '../lib/niconicoInterceptLearn.js';
import { recordUnforwardedInterceptJsonForProbe } from '../lib/interceptVisitorProbeDebug.js';
import {
  dedupeViewerJoinUsersByUserId,
  normalizeViewerJoin,
  walkJsonForViewerJoinUsers
} from '../lib/interceptViewerJoinSignals.js';
import {
  generateNlsAuthToken,
  NLS_AUTH_TOKEN_ATTR
} from '../lib/nlsInterceptAuth.js';

(() => {
  'use strict';
  if (window.__NLS_PAGE_INTERCEPT__) return;
  const href = String(window.location?.href || '');
  const referrer = String(document.referrer || '');
  /** @param {string} raw */
  const parseUrl = (raw) => {
    try {
      return new URL(String(raw || ''));
    } catch {
      return null;
    }
  };
  /** @param {string} h */
  const isNicoHost = (h) =>
    String(h || '').endsWith('.nicovideo.jp') || String(h || '') === 'nicovideo.jp';
  /** @param {string} h */
  const isLocalHost = (h) =>
    String(h || '') === '127.0.0.1:3456' || String(h || '') === 'localhost:3456';
  /** @param {string} p */
  const isWatchLikePath = (p) =>
    String(p || '').startsWith('/watch/') || String(p || '').startsWith('/embed/');
  const here = parseUrl(href);
  const ref = parseUrl(referrer);
  const host = String(here?.host || window.location?.host || '');
  const path = String(here?.pathname || window.location?.pathname || '');
  const isAboutLikeFrame = /^(about:blank|about:srcdoc|blob:|data:)/i.test(href);
  const isRefWatchPage = Boolean(
    ref &&
      (isNicoHost(ref.host) || isLocalHost(ref.host)) &&
      isWatchLikePath(ref.pathname)
  );
  const isWatchPage =
    (isNicoHost(host) && isWatchLikePath(path)) ||
    (isAboutLikeFrame && isRefWatchPage);
  const isLocalDev =
    isLocalHost(host) || (isAboutLikeFrame && Boolean(ref && isLocalHost(ref.host)));
  if (!isWatchPage && !isLocalDev) return;
  window.__NLS_PAGE_INTERCEPT__ = true;

  // v0.1.234: NLS_INTERCEPT_* 経路の最低限の改ざん耐性として token 認証を導入。
  //   page-intercept (MAIN world) が起動時に生成し、`data-nls-page-token` 属性
  //   経由で content-entry (ISOLATED world) と共有する。各 postMessage に
  //   `_token` を同梱し、receiver は値が一致しないメッセージを drop する。
  //
  //   注: MAIN world の他 script は属性を読めば偽装できるため、これは「決定的な
  //   防御」ではなく「事故的衝突 / generic な spoof」を弾くための層。完全な
  //   isolation は MV3 + same-window 通信の制約上不可能。
  /** @type {string} */
  const NLS_AUTH_TOKEN = generateNlsAuthToken();
  try {
    document.documentElement.setAttribute(NLS_AUTH_TOKEN_ATTR, NLS_AUTH_TOKEN);
  } catch { /* no-op: attribute set 失敗時は token 一致が失敗、receiver 側で drop */ }

  /**
   * window.postMessage を token 同梱版でラップする。token は `_token` プロパティに
   * 入れる。target = '*' は同 window 内 broadcast。
   * @param {Record<string, unknown>} payload
   */
  const postNlsIntercept = (payload) => {
    try {
      window.postMessage({ ...payload, _token: NLS_AUTH_TOKEN }, '*');
    } catch { /* best-effort */ }
  };

  const MSG_TYPE = 'NLS_INTERCEPT_USERID';
  const MSG_STATISTICS = 'NLS_INTERCEPT_STATISTICS';
  const MSG_SCHEDULE = 'NLS_INTERCEPT_SCHEDULE';
  const MSG_CHAT_ROWS = 'NLS_INTERCEPT_CHAT_ROWS';
  const MSG_GIFT_USERS = 'NLS_INTERCEPT_GIFT_USERS';
  /** 視聴者入室・オーディエンス更新（DOM より優先して content で即時処理） */
  const MSG_VIEWER_JOIN = 'NLS_INTERCEPT_VIEWER_JOIN';

  /** @type {{ commentNo: string, text: string, userId: string, nickname?: string }[]} */
  let ndgrChatRowsBatch = [];
  /** @type {ReturnType<typeof setTimeout>|null} */
  let ndgrChatRowsTimer = null;
  /**
   * MAIN world での NDGR chat 行バッチ間隔。
   * 短すぎると postMessage / structured clone のオーバーヘッドが増える。
   * 長すぎると体感の「流れてこない」に繋がる。80ms はロミ式の折衷値。
   */
  const NDGR_CHAT_ROWS_BATCH_MS = 80;
  /** 1 メッセージが巨大になりすぎないよう分割（高流量・structured clone 負荷対策） */
  const NDGR_CHAT_ROWS_POST_CHUNK = 220;

  function postNdgrChatRowsChunks(all) {
    if (!all.length) return;
    const w = typeof window !== 'undefined' ? window : null;
    const schedule =
      w && typeof w.queueMicrotask === 'function'
        ? (fn) => w.queueMicrotask(fn)
        : (fn) => setTimeout(fn, 0);
    let i = 0;
    const pump = () => {
      if (i >= all.length) return;
      const payload = all.slice(i, i + NDGR_CHAT_ROWS_POST_CHUNK);
      i += payload.length;
      postNlsIntercept({ type: MSG_CHAT_ROWS, rows: payload });
      if (i < all.length) schedule(pump);
    };
    pump();
  }

  function scheduleNdgrChatRowsPost(rows) {
    if (!rows?.length) return;
    ndgrChatRowsBatch.push(...rows);
    if (ndgrChatRowsTimer != null) return;
    ndgrChatRowsTimer = setTimeout(() => {
      ndgrChatRowsTimer = null;
      const payload = ndgrChatRowsBatch;
      ndgrChatRowsBatch = [];
      if (payload.length) postNdgrChatRowsChunks(payload);
    }, NDGR_CHAT_ROWS_BATCH_MS);
  }

  /** @type {Map<string, { uid?: string, name?: string, av?: string }>} */
  const batch = new Map();
  /** @type {Map<string, { name?: string, av?: string }>} */
  const dirtyUsers = new Map();
  /** @type {number|null} */
  let timer = null;
  const diag = {
    enqueued: 0,
    posted: 0,
    wsMessages: 0,
    fetchHits: 0,
    xhrHits: 0,
    // v0.1.245: /v2/watch/member.json hook 発火回数（text/plain で来る JSON を強制 parse した件数）
    memberJsonHits: 0
  };

  function publishDiag() {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute('data-nls-page-intercept', '1');
    root.setAttribute('data-nls-page-intercept-enqueued', String(diag.enqueued));
    root.setAttribute('data-nls-page-intercept-posted', String(diag.posted));
    root.setAttribute('data-nls-page-intercept-ws', String(diag.wsMessages));
    root.setAttribute('data-nls-page-intercept-fetch', String(diag.fetchHits));
    root.setAttribute('data-nls-page-intercept-xhr', String(diag.xhrHits));
    root.setAttribute('data-nls-page-intercept-member-json', String(diag.memberJsonHits));
    if (href) root.setAttribute('data-nls-page-intercept-href', href.slice(0, 240));
    if (referrer) {
      root.setAttribute('data-nls-page-intercept-referrer', referrer.slice(0, 240));
    }
  }

  publishDiag();

  /** userId→nickname の補助マップ（ユーザー情報メッセージ用） */
  /** @type {Map<string, string>} */
  const knownNames = new Map();
  /** @type {Map<string, string>} */
  const knownAvatars = new Map();

  /** @type {Map<string, number>} uid → 最終 emit 時刻（短時間の重複 post 抑制） */
  const viewerJoinDedupeAt = new Map();
  const VIEWER_JOIN_SUPPRESS_MS = 2500;
  const VIEWER_JOIN_DEDUPE_MAP_MAX = 8000;

  function pruneViewerJoinDedupe(now) {
    if (viewerJoinDedupeAt.size <= VIEWER_JOIN_DEDUPE_MAP_MAX) return;
    const cutoff = now - VIEWER_JOIN_SUPPRESS_MS * 4;
    for (const [k, t] of viewerJoinDedupeAt) {
      if (t < cutoff) viewerJoinDedupeAt.delete(k);
    }
  }

  /**
   * JSON ルートから入室系ユーザを走査し、即時 postMessage（chat 行バッチより優先）
   * @param {unknown} parsed
   */
  function emitViewerJoinFromJsonRoot(parsed) {
    try {
      const raw = walkJsonForViewerJoinUsers(parsed, { maxDepth: 6, maxArray: 400 });
      const merged = dedupeViewerJoinUsersByUserId(raw);
      if (!merged.length) return;
      const now = Date.now();
      pruneViewerJoinDedupe(now);
      /** @type {{ userId: string, nickname: string, iconUrl: string, timestamp: number, source: string }[]} */
      const out = [];
      for (const v of merged) {
        const row = normalizeViewerJoin(
          {
            userId: v.userId,
            nickname: v.nickname,
            iconUrl: v.iconUrl
          },
          now
        );
        const uid = row.userId;
        if (!uid) continue;
        const last = viewerJoinDedupeAt.get(uid) || 0;
        if (now - last < VIEWER_JOIN_SUPPRESS_MS) continue;
        viewerJoinDedupeAt.set(uid, now);
        out.push(row);
      }
      if (out.length) {
        postNlsIntercept(
          { type: MSG_VIEWER_JOIN, viewers: out, priority: 'fast' }
        );
      }
    } catch {
      /* never break page */
    }
  }

  function flush() {
    const entries = [];
    for (const [no, v] of batch) {
      const uid = String(v?.uid || '').trim();
      const name =
        String(v?.name || '').trim() ||
        (uid ? String(knownNames.get(uid) || '').trim() : '');
      const av =
        String(v?.av || '').trim() ||
        (uid ? String(knownAvatars.get(uid) || '').trim() : '');
      if (!uid && !name && !av) continue;
      entries.push({
        no,
        ...(uid ? { uid } : {}),
        ...(name ? { name } : {}),
        ...(av ? { av } : {})
      });
    }
    batch.clear();
    const users = [];
    for (const [uid, meta] of dirtyUsers) {
      const name = String(meta?.name || '').trim();
      const av = String(meta?.av || '').trim();
      if (!uid || (!name && !av)) continue;
      users.push({
        uid,
        ...(name ? { name } : {}),
        ...(av ? { av } : {})
      });
    }
    dirtyUsers.clear();
    if (!entries.length && !users.length) return;
    diag.posted += entries.length;
    publishDiag();
    postNlsIntercept({ type: MSG_TYPE, entries, users });
  }

  function normalizeAvatarUrl(url) {
    const s = String(url ?? '').trim();
    if (!/^https?:\/\//i.test(s)) return '';
    return s;
  }

  function enqueue(commentNo, userId, nickname, avatarUrl = '') {
    const no = String(commentNo ?? '').trim();
    const uid = String(userId ?? '').trim();
    if (!no) return;
    const name = String(nickname ?? '').trim();
    const av = normalizeAvatarUrl(avatarUrl);
    if (!uid && !name && !av) return;
    diag.enqueued += 1;
    publishDiag();
    if (uid && (name || av)) {
      if (name) knownNames.set(uid, name);
      if (av) knownAvatars.set(uid, av);
      const prevMeta = dirtyUsers.get(uid);
      dirtyUsers.set(uid, {
        ...(String(prevMeta?.name || '').trim() || name
          ? { name: String(prevMeta?.name || '').trim() || name }
          : {}),
        ...(String(prevMeta?.av || '').trim() || av
          ? { av: String(prevMeta?.av || '').trim() || av }
          : {})
      });
    }
    const prev = batch.get(no);
    const prevUid = String(prev?.uid || '').trim();
    const prevName = String(prev?.name || '').trim();
    const prevAv = String(prev?.av || '').trim();
    const nextUid = uid || prevUid;
    const nextName = name || prevName;
    const nextAv = av || prevAv;
    batch.set(no, {
      ...(nextUid ? { uid: nextUid } : {}),
      ...(nextName ? { name: nextName } : {}),
      ...(nextAv ? { av: nextAv } : {})
    });
    if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 150);
  }

  /** ユーザー情報だけのメッセージ（コメント番号なし）を蓄積 */
  function learnUser(userId, nickname, avatarUrl = '') {
    const uid = String(userId ?? '').trim();
    const name = String(nickname ?? '').trim();
    const av = normalizeAvatarUrl(avatarUrl);
    if (!uid || (!name && !av)) return;
    if (name) knownNames.set(uid, name);
    if (av) knownAvatars.set(uid, av);
    const prevMeta = dirtyUsers.get(uid);
    dirtyUsers.set(uid, {
      ...(String(prevMeta?.name || '').trim() || name
        ? { name: String(prevMeta?.name || '').trim() || name }
        : {}),
      ...(String(prevMeta?.av || '').trim() || av
        ? { av: String(prevMeta?.av || '').trim() || av }
        : {})
    });
    if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 150);
  }

  /** @param {unknown} obj */
  function dig(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 5) return;
    if (Array.isArray(obj)) {
      // v0.1.522: 旧上限 500 だと超大規模配信（視聴者リスト等が 500 件超の JSON）で
      //   501 件目以降の userId→nickname/icon 学習がスキップされ、DOM 経由コメントの
      //   uid 補完率が落ちていた。深さ(>5)上限で全体コストは抑えつつ配列幅を 2000 に拡張。
      for (let i = 0; i < obj.length && i < 2000; i++) dig(obj[i], depth + 1);
      return;
    }
    const { enqueues, learnUsers } = collectInterceptSignalsFromObject(obj);
    for (const e of enqueues) {
      enqueue(e.no, e.uid, e.name, e.av);
    }
    for (const u of learnUsers) {
      learnUser(u.uid, u.name, u.av);
    }

    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length && i < 30; i++) {
      const v = obj[keys[i]];
      if (typeof v === 'string') {
        for (const u of extractLearnUsersFromNicoUserIconUrlsInString(v)) {
          learnUser(u.uid, u.name, u.av);
        }
      } else if (v && typeof v === 'object') dig(v, depth + 1);
    }
  }

  /** @param {string} text */
  function extractFromBinaryText(text) {
    for (const p of extractPairsFromBinaryUtf8(text)) {
      enqueue(p.no, p.uid, anonymousNicknameFallback(String(p.uid), ''), '');
    }
  }

  // gifts カウンタの内訳（v0.1.221 追加）：
  //   giftsUid: advertiserUserId が空でなかった件数
  //   giftsName: advertiserName が空でなかった件数
  //   giftsItem: itemId か itemName のどちらかが取れた件数
  //   giftsPoint: point が number で取れた件数
  //   giftsRank: contributionRank が number で取れた件数
  // gifts 総数に対し各内訳が小さい場合、decode (proto field) で取れていない段が原因。
  // 各内訳が高いのに popup の sender 観測 0 なら受信側 (content-entry の保存) で skip されている段。
  const _ndgr = {
    stats: 0,
    chats: 0,
    gifts: 0,
    decoded: 0,
    giftsUid: 0,
    giftsName: 0,
    giftsItem: 0,
    giftsPoint: 0,
    giftsRank: 0,
    // v0.1.397 観測PR: NDGR statistics に乗ってくるイベント系シグナルの出現回数。
    //   「統一取得源(WS+NDGR)にイベント順位/スコアを寄せられるか」を実機で確かめるための
    //   計測のみ（挙動変更なし）。実配信で es/er/et が増えれば NDGR から取れている証拠。
    eventScore: 0,
    eventRank: 0,
    eventTitle: 0
  };

  /**
   * v0.1.239: NDGR Message ID dedupe（4 つの独立調査が完全一致した結論ベース）。
   * - canonical key = `liveId + ":" + messageId`（live レベルでキー空間を広げ、backward fetch / relay overlap に強くする）
   * - synthetic messageId = `co:${commentNo}:${userId}:${content}`（commentNo + userId + content が一致 = NDGR 再送）
   * - perLiveMax 4096 FIFO eviction（無限増殖禁止）
   * - 配信切替時 reset
   * 詳細: memory analysis_distributed_dedupe.md / plan_v0239_message_id_dedupe.md
   */
  // v0.1.522: perLiveMax を 4096→16384 に拡張。大規模配信（1.6万コメ級）で旧上限だと
  //   FIFO eviction により「16384 件以上前のコメ」の backward/relay 再送が NDGR 層を
  //   素通りしうる。最終防衛は DB 層の dkey(commentNo) 重複排除なので保存重複は出ないが、
  //   素通り分の下流処理を減らすため履歴窓を広げる（短文 messageId 想定で数 MB 程度）。
  const _ndgrDedupe = createNdgrMessageDedupe({ perLiveMax: 16384 });

  /**
   * `/watch/lvXXXXX` / `/embed/lvXXXXX` から liveId を抽出。
   * about:blank / blob: などで unknown のときは null。
   */
  function extractLiveIdFromHref() {
    const m = String(path || '').match(/^\/(?:watch|embed)\/(lv\d+|ch\d+)/i);
    if (m && m[1]) return m[1].toLowerCase();
    // about:blank の場合は ref（親 watch ページ）から拾う
    if (ref && ref.pathname) {
      const rm = String(ref.pathname).match(/^\/(?:watch|embed)\/(lv\d+|ch\d+)/i);
      if (rm && rm[1]) return rm[1].toLowerCase();
    }
    return null;
  }
  /** @type {string|null} */
  const _liveId = extractLiveIdFromHref();
  if (_liveId) _ndgrDedupe.resetForLive(_liveId);

  /**
   * NDGR chat 行に dedupe を適用し、初出のみ通す。
   * synthetic messageId は `co:${commentNo}:${userId}:${content}` で
   * 「同じ commentNo + 同じユーザー + 同じ本文」を NDGR 再送と見做す。
   *
   * @param {Array<{ no?: number|null, content?: string, userId?: string, ... }>} chats
   * @returns {Array<{ no?: number|null, content?: string, userId?: string, ... }>}
   */
  function applyNdgrDedupe(chats) {
    if (!Array.isArray(chats) || !chats.length) return chats || [];
    if (!_liveId) return chats; // liveId 不明時は pass-through
    const out = [];
    for (const c of chats) {
      const no = c?.no;
      if (no == null) {
        // commentNo 無しは dedupe 対象外（無理に key 作ると false positive 危険）
        out.push(c);
        continue;
      }
      const messageId =
        'co:' + String(no) + ':' + String(c?.userId || '') + ':' + String(c?.content || '');
      const r = _ndgrDedupe.accept({ liveId: _liveId, messageId });
      if (r.accepted) out.push(c);
    }
    return out;
  }

  function publishNdgrDedupeDiag() {
    const root = document.documentElement;
    if (!root) return;
    try {
      const snap = _ndgrDedupe.snapshot();
      root.setAttribute(
        'data-nls-ndgr-dedupe',
        `a=${snap.accepted} d=${snap.droppedDuplicate} e=${snap.evictedIds}` +
          ` b=${snap.currentBuckets} bc=${snap.bucketsCreated} r=${snap.resets}`
      );
      // 詳細 snapshot は data attribute に JSON で出す（content 側で読み取り可能）
      root.setAttribute(
        'data-nls-ndgr-dedupe-snapshot',
        JSON.stringify(snap)
      );
    } catch { /* no-op */ }
  }
  /**
   * NDGR で観測した protobuf field tag のヒストグラム。
   * top: ChunkedMessage 直下の field tag、msg: 内側 NicoliveMessage one-of の field tag。
   * niconico がプロトコルを差し替えた時、どの tag に新ペイロードが乗ったかを
   * 「既存の chats/gifts カウンタが伸びない vs 新 tag が伸びている」という形で観測する。
   */
  const _ndgrTagHistogram = { top: /** @type {Record<string, number>} */ ({}), msg: /** @type {Record<string, number>} */ ({}) };

  // v0.1.402 観測PR（過去ログ一括バックフィルの足場・挙動には一切影響しない）:
  //   将来「配信開始まで遡って過去コメントを取り込む」backward 巡回を実装するには、
  //   巡回の基点になる NDGR view エンドポイントのベース URL（`?at=` クエリ前）が要る。
  //   ニコ生プレイヤーが叩く `api/view/v4` を傍受した時に、その base URL と観測回数を
  //   data 属性へ一度だけ露出して、実機 PoC（?at=過去 が本当に遡れるか）の足場にする。
  //   ⛔ ここでは「観測（属性に出す）」だけで、自前 fetch も巡回も行わない（hot path 非干渉）。
  const _ndgrViewUri = { base: '', firstBase: '', count: 0 };
  /** @param {string} rawUrl */
  function observeNdgrViewUri(rawUrl) {
    try {
      const u = String(rawUrl || '');
      // view ハンドシェイク URL のみ（segment/backward/snapshot は巡回の基点ではない）。
      if (!/\/view\/v\d\//.test(u)) return;
      const base = u.split('?')[0];
      if (!base) return;
      _ndgrViewUri.count += 1;
      // v0.1.762「途中で止まって%が残る」根治(実機 fastDiag で確定):
      //   旧実装は「初回観測の base を保持（同一配信中は不変）」と仮定して if(!base) で固定して
      //   いた。だが NDGR の view endpoint URL は配信中に【ローテーションする】(実機 fastDiag の
      //   interceptFetchLog に同一 lv で /view/v4/{tokenA} と {tokenB} の2種類)。固定すると、
      //   数分後にプレイヤーが新 token に移っても backfill は【最初の古い token】に ?at=now を
      //   叩き続け、entry が返らず backwardUri 無し → seg:0 backward_exhausted を再開上限まで
      //   繰り返して 0 件 → 過去ログが 14%/32% 等で止まり「取り込み中」が残る(NDGR切断=
      //   ndgrLastReceivedAgo 11分・ndgr:337 はリアルタイムだけ生存)。
      //   修正: 観測のたびに【最新の view base に更新】する。リアルタイム経路が最新 token で
      //   現に受信できている(ndgr:337)のが、最新 token が有効である証拠=安全。初回 base は
      //   診断用に firstBase として別途残す。
      if (!_ndgrViewUri.firstBase) _ndgrViewUri.firstBase = base;
      _ndgrViewUri.base = base; // 常に最新へ更新(古い token で遡れず止まるのを根治)
      const root = document.documentElement;
      if (!root) return;
      root.setAttribute('data-nls-ndgr-view-uri', _ndgrViewUri.base.slice(0, 300));
      root.setAttribute('data-nls-ndgr-view-uri-count', String(_ndgrViewUri.count));
    } catch {
      /* 観測失敗はページ挙動に影響させない */
    }
  }

  /** @param {{ top: Record<string, number>, msg: Record<string, number> } | undefined} h */
  function mergeNdgrTagHistogram(h) {
    if (!h) return;
    for (const k of Object.keys(h.top || {})) {
      _ndgrTagHistogram.top[k] = (_ndgrTagHistogram.top[k] || 0) + (h.top[k] || 0);
    }
    for (const k of Object.keys(h.msg || {})) {
      _ndgrTagHistogram.msg[k] = (_ndgrTagHistogram.msg[k] || 0) + (h.msg[k] || 0);
    }
  }
  function publishNdgrTagHistogram() {
    const root = document.documentElement;
    if (!root) return;
    try {
      root.setAttribute('data-nls-ndgr-tags', JSON.stringify(_ndgrTagHistogram));
    } catch { /* no-op */ }
  }

  /**
   * v0.1.209 緊急投入: 未知 NDGR field の sample を蓄積（lifetime、最大 3 件 / key）。
   * msg.8 (gift) が来ない一方で msg.3 / top.11 が来る配信が確認されたため、
   * 中身（hex preview + 内側 field histogram + string sample）を診断 JSON に
   * 露出して真の gift 経路を特定する。
   */
  /** @type {Record<string, Array<any>>} */
  const _ndgrUnknownSamples = {};
  const NDGR_UNKNOWN_SAMPLES_MAX_PER_KEY = 3;
  /** @param {Record<string, Array<any>> | undefined} u */
  function mergeNdgrUnknownSamples(u) {
    if (!u || typeof u !== 'object') return;
    for (const key of Object.keys(u)) {
      if (!_ndgrUnknownSamples[key]) _ndgrUnknownSamples[key] = [];
      const slot = _ndgrUnknownSamples[key];
      if (slot.length >= NDGR_UNKNOWN_SAMPLES_MAX_PER_KEY) continue;
      const incoming = Array.isArray(u[key]) ? u[key] : [];
      for (const sample of incoming) {
        if (slot.length >= NDGR_UNKNOWN_SAMPLES_MAX_PER_KEY) break;
        slot.push(sample);
      }
    }
  }
  function publishNdgrUnknownSamples() {
    const root = document.documentElement;
    if (!root) return;
    try {
      root.setAttribute(
        'data-nls-ndgr-unknown-samples',
        JSON.stringify(_ndgrUnknownSamples)
      );
    } catch { /* no-op */ }
  }
  /** @type {{ pendingBytes: number, droppedBytes: number, totalFrames: number }|null} */
  let _ldStreamStats = null;

  function publishLdStreamDiag() {
    const root = document.documentElement;
    if (!root || !_ldStreamStats) return;
    root.setAttribute(
      'data-nls-ld-stream',
      `p=${_ldStreamStats.pendingBytes} d=${_ldStreamStats.droppedBytes} f=${_ldStreamStats.totalFrames}`
    );
  }

  function handleNdgrResult(result) {
    if (!result) return;
    mergeNdgrTagHistogram(result.tagHistogram);
    mergeNdgrUnknownSamples(result.unknownSamples);
    if (result.stats && ndgrStatisticsHasWireSignal(result.stats)) {
      _ndgr.stats++;
      const st = result.stats;
      // v0.1.397 観測PR: イベント系シグナルの出現を計測（挙動には影響しない）。
      if (st.eventGiftScore != null) _ndgr.eventScore++;
      if (st.eventRank != null) _ndgr.eventRank++;
      if (st.eventTitle) _ndgr.eventTitle++;
      postNlsIntercept(
        {
          type: MSG_STATISTICS,
          ...(st.viewers != null ? { viewers: st.viewers } : {}),
          ...(st.comments != null ? { comments: st.comments } : {}),
          ...(st.adPoints != null ? { adPoints: st.adPoints } : {}),
          ...(st.giftPoints != null ? { giftPoints: st.giftPoints } : {}),
          ...(st.eventGiftScore != null ? { eventGiftScore: st.eventGiftScore } : {}),
          ...(st.eventRank != null ? { eventRank: st.eventRank } : {}),
          ...(st.eventTitle ? { eventTitle: String(st.eventTitle) } : {})
        }
      );
    }
    for (const chat of result.chats) {
      const uid = chat.rawUserId ? String(chat.rawUserId) : chat.hashedUserId;
      if (chat.no != null && uid) {
        _ndgr.chats++;
        enqueue(
          String(chat.no),
          uid,
          anonymousNicknameFallback(String(uid), chat.name),
          ''
        );
      } else if (chat.no == null && uid) {
        // v0.1.803(星野ロミ式最大化): no(コメント番号)が無くても userId を持つ
        //   匿名(184)コメントは、enqueue(commentNo 必須)に乗せられないが
        //   learnUser(userId だけの学習経路)で userId→nickname を seed する。
        //   これで匿名コメントの userId が known プロファイルに乗り、レーン/会場
        //   のアバター解決に活きる(=「届いている userId 付き chat を捨てない」)。
        //   診断 _ndgr.chats も「採用したコメント」として計上しズレを解消。
        _ndgr.chats++;
        learnUser(uid, anonymousNicknameFallback(String(uid), chat.name), '');
      }
    }
    const giftList = result.gifts || [];
    /** @type {Array<{
     *   userId: string, nickname: string,
     *   itemId?: string, itemName?: string, point?: number,
     *   message?: string, contributionRank?: number
     * }>} */
    const giftUsers = [];
    for (const g of giftList) {
      const uid = String(g.advertiserUserId || '').trim();
      const name = String(g.advertiserName || '').trim();
      // v0.1.204 Patch C-1: anonymous gift（uid 欠落）も _ndgr.gifts でカウントする。
      // 過去は uid を必須にしていたため、過去の経験的 decoder の field 番号誤認と
      // 合わせて gifts カウンタが永遠に 0 のままだった（v0.1.203 真因）。proto 準拠
      // decoder（v0.1.204 Patch B）に合わせ、payload で何かしら取れている event は
      // すべてカウント対象にする。
      _ndgr.gifts++;
      // v0.1.221: decode 結果の field 充足度を内訳カウンタに反映。popup の
      // ギフト送信者観測 0 が「decode で空」か「受信側で skip」のどちらの段かを
      // 切り分けるための診断値。
      if (uid) _ndgr.giftsUid++;
      if (name) _ndgr.giftsName++;
      if (g.itemId || g.itemName) _ndgr.giftsItem++;
      if (typeof g.point === 'number') _ndgr.giftsPoint++;
      if (typeof g.contributionRank === 'number') _ndgr.giftsRank++;
      if (uid) learnUser(uid, name, '');
      giftUsers.push({
        userId: uid,
        nickname: name,
        ...(g.itemId ? { itemId: g.itemId } : {}),
        ...(g.itemName ? { itemName: g.itemName } : {}),
        ...(typeof g.point === 'number' ? { point: g.point } : {}),
        ...(g.message ? { message: g.message } : {}),
        ...(typeof g.contributionRank === 'number'
          ? { contributionRank: g.contributionRank }
          : {})
      });
    }
    if (giftUsers.length) {
      postNlsIntercept({ type: MSG_GIFT_USERS, users: giftUsers });
    }
    // v0.1.239: dedupe を decode 直後に適用（post 前で drop）
    const dedupedChats = applyNdgrDedupe(result.chats);
    scheduleNdgrChatRowsPost(ndgrChatsToMergeRows(dedupedChats));
    publishNdgrDedupeDiag();
  }

  /** @param {Uint8Array} frame */
  function processLengthDelimitedNdgrFrame(frame) {
    const dec = new TextDecoder('utf-8', { fatal: false });
    extractFromBinaryText(dec.decode(frame));
    let handled = false;
    try {
      const r = decodeChunkedMessage(frame);
      if (r.stats || r.chats.length || (r.gifts && r.gifts.length)) {
        handleNdgrResult(r);
        handled = true;
      }
    } catch { /* no-op */ }
    if (!handled) {
      try {
        for (const r of decodePackedSegment(frame)) handleNdgrResult(r);
      } catch { /* no-op */ }
    }
  }

  /**
   * @param {Uint8Array} u8
   * @param {ReturnType<typeof createLengthDelimitedStreamAccumulator>|null} [streamAcc]
   */
  function tryProcessBinaryBuffer(u8, streamAcc) {
    if (u8.byteLength < 4 || u8.byteLength > 2_000_000) return;
    const dec = new TextDecoder('utf-8', { fatal: false });

    if (streamAcc) {
      streamAcc.push(u8, processLengthDelimitedNdgrFrame);
      _ldStreamStats = streamAcc.getStats();
      publishLdStreamDiag();
      _ndgr.decoded++;
    } else {
      const { frames, tail } = splitLengthDelimitedMessagesWithTail(u8);
      if (frames.length > 0) {
        for (const ch of frames) processLengthDelimitedNdgrFrame(ch);
        _ndgr.decoded++;
      } else {
        processLengthDelimitedNdgrFrame(u8);
        _ndgr.decoded++;
      }
      extractFromBinaryText(dec.decode(u8));
      if (tail.length) {
        try {
          extractFromBinaryText(dec.decode(tail));
        } catch { /* no-op */ }
      }
    }

    const root = document.documentElement;
    if (root && (_ndgr.stats > 0 || _ndgr.chats > 0 || _ndgr.gifts > 0)) {
      root.setAttribute(
        'data-nls-ndgr',
        `s=${_ndgr.stats} c=${_ndgr.chats} g=${_ndgr.gifts} d=${_ndgr.decoded}` +
          ` gu=${_ndgr.giftsUid} gn=${_ndgr.giftsName} gi=${_ndgr.giftsItem}` +
          ` gp=${_ndgr.giftsPoint} gr=${_ndgr.giftsRank}` +
          // v0.1.397 観測PR: es=eventScore er=eventRank et=eventTitle の出現回数。
          ` es=${_ndgr.eventScore} er=${_ndgr.eventRank} et=${_ndgr.eventTitle}`
      );
    }
    publishNdgrTagHistogram();
    publishNdgrUnknownSamples();
  }

  const VIEWER_KEYS = ['viewers', 'watchCount', 'watching', 'watchingCount', 'viewerCount', 'viewCount'];
  const COMMENT_KEYS = ['comments', 'commentCount'];
  const AD_KEYS = ['adPoints', 'ad_points', 'adPoint', 'accumulatedAdPoints'];
  const GIFT_KEYS = [
    'giftPoints',
    'gift_points',
    'giftPoint',
    'accumulatedGiftPoints',
    'programGiftPoints',
    'program_gift_points'
  ];
  function pickNum(obj, keys, max) {
    for (const k of keys) {
      const r = obj[k];
      if (r == null) continue;
      const n = typeof r === 'number' ? r : parseInt(String(r), 10);
      if (Number.isFinite(n) && n >= 0 && (!max || n <= max)) return n;
    }
    return null;
  }

  /**
   * パース済み JSON からビューア数・コメント数を検出して転送。
   * type:"statistics" だけでなく、既知キーがあれば広く拾う。
   * @param {unknown} obj
   */
  /** @returns {boolean} statistics 相当を転送したら true */
  function tryForwardStatistics(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const o = /** @type {Record<string, unknown>} */ (obj);
    const d = o.data;
    const target =
      d && typeof d === 'object' && !Array.isArray(d)
        ? /** @type {Record<string, unknown>} */ (d)
        : o;
    let viewers = pickNum(target, VIEWER_KEYS, 50_000_000);
    let comments = pickNum(target, COMMENT_KEYS);
    let adPoints = pickNum(target, AD_KEYS);
    let giftPoints = pickNum(target, GIFT_KEYS);
    if (viewers == null && target !== o) {
      viewers = pickNum(o, VIEWER_KEYS, 50_000_000);
      comments = comments ?? pickNum(o, COMMENT_KEYS);
      adPoints = adPoints ?? pickNum(o, AD_KEYS);
      giftPoints = giftPoints ?? pickNum(o, GIFT_KEYS);
    }
    if (viewers == null && adPoints == null && giftPoints == null) return false;
    postNlsIntercept({
      type: MSG_STATISTICS,
      ...(viewers != null ? { viewers } : {}),
      ...(comments != null ? { comments } : {}),
      ...(adPoints != null ? { adPoints } : {}),
      ...(giftPoints != null ? { giftPoints } : {})
    });
    return true;
  }

  /** statistics 未転送 JSON の観測（sessionStorage フラグ ON のときのみ） */
  function maybeRecordInterceptVisitorProbe(parsed) {
    const snippet = recordUnforwardedInterceptJsonForProbe(parsed);
    if (!snippet) return;
    const root = document.documentElement;
    if (root) root.setAttribute('data-nls-intercept-visitor-probe', snippet);
  }

  let _scheduleSent = false;
  /** @param {unknown} obj */
  function tryForwardSchedule(obj) {
    if (_scheduleSent) return;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    const o = /** @type {Record<string, unknown>} */ (obj);
    if (o.type !== 'schedule') return;
    const d = o.data;
    if (!d || typeof d !== 'object') return;
    const dd = /** @type {Record<string, unknown>} */ (d);
    const begin = dd.begin || dd.beginAt || dd.openTime;
    if (typeof begin === 'string' && begin.length >= 10) {
      _scheduleSent = true;
      postNlsIntercept({ type: MSG_SCHEDULE, begin });
    }
  }

  /** @param {unknown} raw */
  function tryProcess(raw) {
    if (typeof raw === 'string') {
      if (raw.length < 4 || raw.length > 1_000_000) return;
      try {
        const parsed = JSON.parse(raw);
        emitViewerJoinFromJsonRoot(parsed);
        if (!tryForwardStatistics(parsed)) maybeRecordInterceptVisitorProbe(parsed);
        tryForwardSchedule(parsed);
        dig(parsed, 0);
      } catch {
        /* not JSON */
      }
      return;
    }
    if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
      const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      tryProcessBinaryBuffer(buf);
      return;
    }
    if (typeof Blob !== 'undefined' && raw instanceof Blob) {
      if (raw.size > 2_000_000) return;
      raw.arrayBuffer().then((ab) => tryProcess(ab)).catch(() => {});
    }
  }

  const OrigWS = window.WebSocket;
  try {
    window.WebSocket = new Proxy(OrigWS, {
      construct(target, args) {
        const ws = new target(...args);
        ws.addEventListener('message', (/** @type {MessageEvent} */ e) => {
          try {
            diag.wsMessages += 1;
            publishDiag();
            tryProcess(e.data);
          } catch {
            /* never break the page */
          }
        });
        return ws;
      }
    });
    Object.defineProperty(window.WebSocket, 'prototype', {
      value: OrigWS.prototype,
      writable: false,
      configurable: false
    });
  } catch {
    /* Proxy 失敗は無視 */
  }

  /** @type {string[]} */
  const _fetchLog = [];
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      let p;
      try {
        p = origFetch.apply(this, args);
      } catch (e) {
        return Promise.reject(e);
      }
      /* 同一 Promise に同期的に拒否ハンドラを付け、ページ側が catch しない失敗で
       * 「Uncaught (in promise) TypeError: Failed to fetch」が拡張エラーに出るのを防ぐ */
      if (p != null && typeof p.then === 'function') {
        p.catch(() => {
          /* ネットワーク失敗・CORS 等はページ本来の挙動。インターセプト側では無視 */
        });
      }
      void (async () => {
        try {
          const res = await p;
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
          const isNico =
            url.includes('nicovideo.jp') ||
            url.includes('nimg.jp') ||
            url.includes('dmc.nico') ||
            url.includes('nicolive') ||
            url.includes('ndgr') ||
            url.includes('127.0.0.1:3456') ||
            url.includes('localhost:3456');
          if (!isNico) return;
          const method = (typeof args[1] === 'object' && args[1]?.method || 'GET').toUpperCase();
          if (method === 'POST' && /api\/(v\d+\/)?comment/.test(url) && res.ok) {
            try {
              const cj = await res.clone().json();
              postNlsIntercept({
                type: 'NLS_INTERCEPT_COMMENT_POST',
                status: res.status,
                body: cj
              });
            } catch { /* JSON parse failure — ignore */ }
          }
          diag.fetchHits += 1;
          try { if (typeof maybeScanFromFetch === 'function') maybeScanFromFetch(); } catch { /* no-op */ }
          const ct = res.headers?.get('content-type') || '';
          if (_fetchLog.length < 20) {
            const u = url.replace(/https?:\/\/[^/]+/, '').substring(0, 60);
            _fetchLog.push(`${u} [${ct.substring(0, 25)}]`);
            const root = document.documentElement;
            if (root) root.setAttribute('data-nls-fetch-log', _fetchLog.join(' | '));
          }
          publishDiag();
          const isBinary = ct.includes('protobuf') || ct.includes('octet') || ct.includes('grpc');
          const isJson = ct.includes('json');
          const isStream = ct.includes('event-stream') || ct.includes('ndjson');
          const isNdgr = /\/(view|segment|backward|snapshot)\/v\d\//.test(url) || url.includes('ndgr');
          // v0.1.402 観測PR: backward 巡回バックフィルの基点 URL を一度だけ露出する（観測のみ）。
          observeNdgrViewUri(url);
          // v0.1.245: niconico の一部 API は text/plain content-type で JSON body を返す
          //   実機観測: /v2/watch/member.json?__retry=0 が text/plain;charset=UTF-8。
          //   既存判定だけだと body が読まれず、user 情報 (userId + nickname + iconUrl)
          //   が learnUser map に乗らない。これが原因で親フレーム DOM 経由のコメント
          //   (実機 8121 件中) で uid 解決失敗 (savedCommentsUidStats.withUidPercent: 15.9%)。
          //   memory `v0.1.225 で確定 / member.json hook 漏れ` を v0.1.245 で着手。
          if (!isBinary && !isJson && !isStream && !isNdgr) {
            const isMemberJson = /\/v2\/watch\/member\.json/.test(url);
            if (isMemberJson && res.ok) {
              try {
                const cj = await res.clone().json();
                diag.memberJsonHits = (Number(diag.memberJsonHits) || 0) + 1;
                emitViewerJoinFromJsonRoot(cj);
                dig(cj, 0);
                publishDiag();
              } catch { /* JSON parse failure — text/plain だが JSON ではない */ }
            }
            return;
          }
          const clone = res.clone();
          if ((isBinary || isStream || isNdgr) && clone.body) {
            const reader = clone.body.getReader();
            void (async () => {
              // v0.1.522: ldAcc を try の外で生成し、stream abort（reader.read 例外）でも
              //   finally で getStats を必ず記録する。旧コードは正常終了時のみ stats を
              //   更新していたため、長時間 NDGR ストリームが中断されると droppedBytes 等の
              //   観測が欠落していた（取得品質の見落とし要因）。
              const ldAcc = createLengthDelimitedStreamAccumulator({
                maxPendingBytes: 2_000_000
              });
              try {
                const dec = new TextDecoder('utf-8', { fatal: false });
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (value) {
                    tryProcessBinaryBuffer(value, ldAcc);
                    extractFromBinaryText(dec.decode(value));
                    const text = dec.decode(value, { stream: true });
                    if (text.length > 3 && text.length < 500000) {
                      try {
                        const j = JSON.parse(text);
                        emitViewerJoinFromJsonRoot(j);
                        if (!tryForwardStatistics(j)) maybeRecordInterceptVisitorProbe(j);
                        dig(j, 0);
                      } catch { /* not JSON */ }
                    }
                  }
                }
              } catch { /* stream end / abort */ } finally {
                try {
                  _ldStreamStats = ldAcc.getStats();
                  publishLdStreamDiag();
                } catch { /* diag best-effort */ }
              }
            })();
          } else {
            try { tryProcess(await clone.arrayBuffer()); } catch { /* no-op */ }
          }
        } catch {
          /* fetch rejection — ignore */
        }
      })();
      return p;
    };
  }

  const OrigXHR = window.XMLHttpRequest;
  if (typeof OrigXHR === 'function') {
    try {
      const origOpen = OrigXHR.prototype.open;
      const origSend = OrigXHR.prototype.send;
      OrigXHR.prototype.open = function (method, url, ...rest) {
        try {
          this.__nlsUrl = typeof url === 'string' ? url : String(url || '');
        } catch { /* no-op */ }
        return origOpen.call(this, method, url, ...rest);
      };
      OrigXHR.prototype.send = function (...args) {
        try {
          this.addEventListener(
            'loadend',
            () => {
              try {
                const url = String(this.__nlsUrl || this.responseURL || '');
                const isNico =
                  url.includes('nicovideo.jp') ||
                  url.includes('nimg.jp') ||
                  url.includes('dmc.nico') ||
                  url.includes('nicolive') ||
                  url.includes('ndgr') ||
                  url.includes('127.0.0.1:3456') ||
                  url.includes('localhost:3456');
                if (!isNico) return;
                diag.xhrHits += 1;
                try { if (typeof maybeScanFromFetch === 'function') maybeScanFromFetch(); } catch { /* no-op */ }
                publishDiag();
                const rt = String(this.responseType || '');
                if (!rt || rt === 'text') {
                  tryProcess(String(this.responseText || ''));
                  return;
                }
                if (rt === 'json') {
                  const res = this.response;
                  emitViewerJoinFromJsonRoot(res);
                  if (!tryForwardStatistics(res)) maybeRecordInterceptVisitorProbe(res);
                  dig(res, 0);
                  return;
                }
                if (rt === 'arraybuffer' && this.response) {
                  tryProcess(this.response);
                  return;
                }
                if (rt === 'blob' && this.response) {
                  tryProcess(this.response);
                }
              } catch { /* no-op */ }
            },
            { once: true }
          );
        } catch { /* no-op */ }
        return origSend.apply(this, args);
      };
    } catch { /* no-op */ }
  }

  // --- React Fiber scanning for userId extraction from data-grid ---
  try {
    const _r = document.documentElement;
    if (_r) _r.setAttribute('data-nls-pi-phase', 'fiber-init');
  } catch { /* no-op */ }
  const FIBER_SCAN_MS = 3000;
  const FB_NO = ['no', 'commentNo', 'comment_no', 'number', 'vposNo'];
  const FB_UID = [
    'userId',
    'user_id',
    'uid',
    'hashedUserId',
    'hashed_user_id',
    'senderUserId',
    'rawUserId',
    'raw_user_id',
    'advertiserUserId',
    'advertiser_user_id'
  ];
  const FB_NAME = [
    'name',
    'nickname',
    'userName',
    'user_name',
    'displayName',
    'display_name',
    'advertiserName',
    'advertiser_name'
  ];
  const FB_AV = [
    'iconUrl',
    'icon_url',
    'avatarUrl',
    'avatar_url',
    'userIconUrl',
    'thumbnailUrl',
    'thumbnail_url'
  ];

  function getReactCandidates(el) {
    /** @type {unknown[]} */
    const out = [];
    if (!el) return out;
    try {
      for (const k of Object.getOwnPropertyNames(el)) {
        if (
          k.startsWith('__reactFiber$') ||
          k.startsWith('__reactInternalInstance$') ||
          k.startsWith('__reactProps$') ||
          k.startsWith('__reactEventHandlers$')
        ) {
          out.push(el[k]);
        }
      }
    } catch { /* no-op */ }
    try {
      for (const s of Object.getOwnPropertySymbols(el)) {
        const d = String(s?.description || s?.toString?.() || '');
        if (/react/i.test(d)) out.push(el[s]);
      }
    } catch { /* no-op */ }
    return out;
  }

  function pickStr(obj, keys) {
    if (!obj || typeof obj !== 'object') return '';
    for (const k of keys) { const v = obj[k]; if (v != null && v !== '') return String(v); }
    return '';
  }

  function extractFromProps(props) {
    if (!props || typeof props !== 'object' || Array.isArray(props)) return null;
    let no = pickStr(props, FB_NO);
    let uid = pickStr(props, FB_UID);
    let nm = pickStr(props, FB_NAME);
    let av = normalizeAvatarUrl(pickStr(props, FB_AV));
    const SUBS = ['data', 'chat', 'comment', 'item', 'message', 'props', 'value', 'row', 'rowData', 'original', 'user', 'sender', 'commenter', 'content'];
    for (const s of SUBS) {
      const c = props[s];
      if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
      if (!no) no = pickStr(c, FB_NO);
      if (!uid) uid = pickStr(c, FB_UID);
      if (!nm) nm = pickStr(c, FB_NAME);
      if (!av) av = normalizeAvatarUrl(pickStr(c, FB_AV));
      if (!uid && typeof c.id === 'number' && c.id > 999) uid = String(c.id);
      for (const s2 of ['user', 'sender', 'chat', 'comment', 'data']) {
        const c2 = c[s2];
        if (!c2 || typeof c2 !== 'object' || Array.isArray(c2)) continue;
        if (!uid) uid = pickStr(c2, FB_UID);
        if (!nm) nm = pickStr(c2, FB_NAME);
        if (!av) av = normalizeAvatarUrl(pickStr(c2, FB_AV));
        if (!uid && typeof c2.id === 'number' && c2.id > 999) uid = String(c2.id);
      }
    }
    if (no && (uid || nm || av)) return { no, uid, nm, av };
    return null;
  }

  function digFiberDown(fiber, depth) {
    if (!fiber || depth > 6) return null;
    const props = fiber.memoizedProps || fiber.pendingProps;
    const r = extractFromProps(props);
    if (r) return r;
    let child = fiber.child;
    while (child) {
      const cr = digFiberDown(child, depth + 1);
      if (cr) return cr;
      child = child.sibling;
    }
    return null;
  }

  function digFiberUp(fiber, maxUp) {
    let cur = fiber;
    for (let i = 0; i < maxUp && cur; i++) {
      const props = cur.memoizedProps || cur.pendingProps;
      const r = extractFromProps(props);
      if (r) return r;
      cur = cur.return;
    }
    return null;
  }

  function digFiber(fiber, _depth) {
    const down = digFiberDown(fiber, 0);
    if (down) return down;
    return digFiberUp(fiber, 8);
  }

  const _fb = { scans: 0, found: 0, rows: 0, probe: '', step: '', attempts: 0, err: '' };

  function publishFiberDiag() {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute('data-nls-fiber-scans', String(_fb.scans));
    root.setAttribute('data-nls-fiber-found', String(_fb.found));
    root.setAttribute('data-nls-fiber-rows', String(_fb.rows));
    root.setAttribute('data-nls-fiber-probe', _fb.probe.substring(0, 300));
    root.setAttribute('data-nls-fiber-step', _fb.step);
    root.setAttribute('data-nls-fiber-attempts', String(_fb.attempts));
    if (_fb.err) root.setAttribute('data-nls-fiber-err', _fb.err.substring(0, 120));
  }

  function scanCommentFibers() {
    try {
      const panel = document.querySelector('.ga-ns-comment-panel') ||
                    document.querySelector('[class*="comment-panel" i]') ||
                    document.querySelector('[class*="CommentPanel" i]');
      const grid = document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]') ||
                   document.querySelector('[class*="comment-list" i]') ||
                   document.querySelector('[class*="CommentList" i]');
      const root = panel || grid;
      if (!root) { _fb.step = 'no-root'; publishFiberDiag(); return; }

      const allEls = root.querySelectorAll('*');
      _fb.scans++;
      _fb.rows = allEls.length;
      let found = 0;
      let hasFiber = 0;
      let firstHitProbe = '';
      for (let i = 0; i < allEls.length && i < 1200; i++) {
        const el = allEls[i];
        const candidates = getReactCandidates(el);
        if (!candidates.length) continue;
        hasFiber += candidates.length;
        for (const candidate of candidates) {
          if (_fb.probe === '') {
            try {
              const p =
                candidate?.memoizedProps ||
                candidate?.pendingProps ||
                (candidate && typeof candidate === 'object' ? candidate : {}) ||
                {};
              const keys = Object.keys(p).slice(0, 20);
              _fb.probe = keys.join(',');
              for (const key of keys) {
                const v = p[key];
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                  _fb.probe += ' | ' + key + ':{' + Object.keys(v).slice(0, 15).join(',') + '}';
                  break;
                }
              }
            } catch { /* no-op */ }
          }
          const data =
            extractFromProps(candidate) ||
            (candidate && typeof candidate === 'object' ? digFiber(candidate, 0) : null);
          if (!data) continue;
          enqueue(data.no, data.uid, data.nm, data.av);
          found++;
          if (!firstHitProbe) {
            try {
              const p =
                candidate?.memoizedProps ||
                candidate?.pendingProps ||
                (candidate && typeof candidate === 'object' ? candidate : {}) ||
                {};
              firstHitProbe = Object.keys(p).slice(0, 10).join(',');
            } catch { /* no-op */ }
          }
          break;
        }
      }
      _fb.found += found;
      _fb.step = (panel ? 'panel' : 'grid') + ':' + allEls.length + ' fb=' + hasFiber + ' hit=' + found;
      if (firstHitProbe) _fb.step += ' hp=' + firstHitProbe.substring(0, 60);
      publishFiberDiag();
    } catch (e) {
      _fb.err = String(e?.message || e || '?').substring(0, 120);
      publishFiberDiag();
    }
  }

  // Fiber scan: use bound setTimeout chain (setInterval callback was not firing)
  try {
    const _r2 = document.documentElement;
    if (_r2) _r2.setAttribute('data-nls-pi-phase', 'pre-fiber-start');
  } catch { /* no-op */ }
  let _fiberRunning = false;
  // 0.1.28 (AC): SPA 遷移時に clearInterval できるよう id を保持する。
  let _fiberScanIntervalId = /** @type {number|null} */ (null);
  let _mainPollIntervalId = /** @type {number|null} */ (null);
  let _spaUrlCheckIntervalId = /** @type {number|null} */ (null);
  let _lastObservedHref = window.location.href;
  const _bST = window.setTimeout.bind(window);
  const _bSI = window.setInterval.bind(window);
  function fiberTick() {
    try {
      _fb.attempts++;
      _fb.step = 'tick-' + _fb.attempts;
      publishFiberDiag();
      const rootEl = document.querySelector('.ga-ns-comment-panel') ||
                     document.querySelector('[class*="comment-panel" i]') ||
                     document.querySelector('[class*="CommentPanel" i]') ||
                     document.querySelector('[class*="comment-data-grid"], [class*="data-grid"]') ||
                     document.querySelector('[class*="comment-list" i]') ||
                     document.querySelector('[class*="CommentList" i]');
      if (rootEl) {
        _fb.step = 'found-root';
        publishFiberDiag();
        _fiberRunning = true;
        scanCommentFibers();
        // 0.1.28 (AC): id を保持して SPA 遷移で clearInterval できるようにする。
        _fiberScanIntervalId = _bSI(scanCommentFibers, FIBER_SCAN_MS);
        return;
      }
    } catch (e) {
      _fb.err = String(e?.message || e || '?').substring(0, 80);
      publishFiberDiag();
    }
    if (_fb.attempts < 200) _bST(fiberTick, 1500);
  }
  _bST(fiberTick, 2000);
  let _lastFetchFiber = 0;
  function maybeScanFromFetch() {
    if (_fiberRunning) return;
    const now = Date.now();
    if (now - _lastFetchFiber < 3000) return;
    _lastFetchFiber = now;
    fiberTick();
  }

  // --- EventSource proxy for NDGR SSE streams ---
  const OrigES = window.EventSource;
  if (typeof OrigES === 'function') {
    try {
      window.EventSource = function (url, opts) {
        const es = new OrigES(url, opts);
        diag.fetchHits += 1;
        if (_fetchLog.length < 12) {
          _fetchLog.push('ES:' + String(url).replace(/https?:\/\/[^/]+/, '').substring(0, 60));
          const root = document.documentElement;
          if (root) root.setAttribute('data-nls-fetch-log', _fetchLog.join(' | '));
        }
        publishDiag();
        es.addEventListener('message', (e) => {
          try {
            diag.wsMessages += 1;
            publishDiag();
            tryProcess(e.data);
          } catch { /* no-op */ }
        });
        return es;
      };
      Object.defineProperty(window.EventSource, 'prototype', {
        value: OrigES.prototype, writable: false, configurable: false
      });
      window.EventSource.CONNECTING = OrigES.CONNECTING;
      window.EventSource.OPEN = OrigES.OPEN;
      window.EventSource.CLOSED = OrigES.CLOSED;
    } catch { /* no-op */ }
  }

  // --- MAIN world statistics polling (ISOLATED world fetch hangs) ---
  const MSG_EMBEDDED_DATA = 'NLS_INTERCEPT_EMBEDDED_DATA';
  const MAIN_POLL_MS = 30000;

  function tryReadEmbeddedData() {
    try {
      const el = document.getElementById('embedded-data');
      if (!el) return;
      let raw = el.getAttribute('data-props') || '';
      if (!raw) return;
      if (raw.includes('&quot;')) raw = raw.replace(/&quot;/g, '"');
      if (raw.includes('&amp;')) raw = raw.replace(/&amp;/g, '&');
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return;
      const wc = obj?.program?.statistics?.watchCount;
      const viewers =
        wc != null && Number.isFinite(Number(wc)) && Number(wc) >= 0
          ? Number(wc)
          : null;
      postNlsIntercept({ type: MSG_EMBEDDED_DATA, viewers });
    } catch { /* no-op */ }
  }

  function mainWorldPollStats() {
    try {
      const pageUrl = window.location.href;
      if (!pageUrl || !pageUrl.startsWith('http')) return;
      // SPA 遷移で非 watch ページに変わってもこの setInterval は止まらないため、
      // 都度 URL が watch like かを再判定する。クロージャで isNicoHost / isWatchLikePath
      // が参照可能なので IIFE ブート時と同じ判定を流用する。
      let parsed = null;
      try { parsed = new URL(pageUrl); } catch { /* no-op */ }
      if (!parsed || !isNicoHost(parsed.host) || !isWatchLikePath(parsed.pathname)) return;
      origFetch(pageUrl, { credentials: 'same-origin' })
        .then((res) => {
          if (!res.ok) return;
          return res.text();
        })
        .then((html) => {
          if (!html) return;
          if (html.includes('&quot;')) html = html.replace(/&quot;/g, '"');
          if (html.includes('&amp;')) html = html.replace(/&amp;/g, '&');
          const wc =
            html.match(/"watchCount"\s*:\s*(\d+)/) ||
            html.match(/"watching(?:Count)?"\s*:\s*(\d+)/i);
          if (wc?.[1]) {
            const n = parseInt(wc[1], 10);
            if (Number.isFinite(n) && n >= 0) {
              postNlsIntercept({ type: MSG_STATISTICS, viewers: n });
            }
          }
          const cc =
            html.match(/"commentCount"\s*:\s*(\d+)/) ||
            html.match(/"comments"\s*:\s*(\d+)/);
          if (cc?.[1]) {
            const cn = parseInt(cc[1], 10);
            if (Number.isFinite(cn) && cn >= 0) {
              postNlsIntercept({ type: MSG_STATISTICS, viewers: null, comments: cn });
            }
          }
        })
        .catch(() => { /* no-op */ });
    } catch { /* no-op */ }
  }

  function initEmbeddedAndPoll() {
    tryReadEmbeddedData();
    setTimeout(mainWorldPollStats, 8000);
    // 0.1.28 (AC): id を保持し、SPA 遷移で非 watch ページに変わったら clearInterval。
    if (_mainPollIntervalId != null) {
      try { clearInterval(_mainPollIntervalId); } catch { /* no-op */ }
    }
    _mainPollIntervalId = setInterval(mainWorldPollStats, MAIN_POLL_MS);
  }

  // 0.1.28 (AC): SPA 遷移検知。href が変わったときに watch like でなければ
  // 全 timer を一旦止める（次に watch like に戻ったとき initEmbeddedAndPoll
  // で再起動）。直接 history API を hook するのは MAIN world で副作用が
  // 大きいので、軽量 polling（10 秒）で十分。
  _spaUrlCheckIntervalId = setInterval(() => {
    try {
      const cur = window.location.href;
      if (cur === _lastObservedHref) return;
      _lastObservedHref = cur;
      let parsed = null;
      try { parsed = new URL(cur); } catch { /* no-op */ }
      const isWatch = parsed && isNicoHost(parsed.host) && isWatchLikePath(parsed.pathname);
      if (!isWatch) {
        if (_fiberScanIntervalId != null) {
          try { clearInterval(_fiberScanIntervalId); } catch { /* no-op */ }
          _fiberScanIntervalId = null;
        }
        if (_mainPollIntervalId != null) {
          try { clearInterval(_mainPollIntervalId); } catch { /* no-op */ }
          _mainPollIntervalId = null;
        }
        _fiberRunning = false;
      }
    } catch { /* no-op */ }
  }, 10000);
  void _spaUrlCheckIntervalId; // 未使用警告抑止（ID 保持目的）

  // Don't rely on DOMContentLoaded — use setTimeout polling
  let _embeddedPollStarted = false;
  const _embPollId = setInterval(() => {
    if (_embeddedPollStarted) return;
    if (document.getElementById('embedded-data') || document.readyState !== 'loading') {
      _embeddedPollStarted = true;
      clearInterval(_embPollId);
      initEmbeddedAndPoll();
    }
  }, 500);

  // Also log ALL fetch domains (not just nico) for the first few
  const _allFetchLog = [];
  try {
    const prevFetch = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (_allFetchLog.length < 5 && !url.includes('nicovideo.jp') && !url.includes('nimg.jp')) {
        const u = url.substring(0, 80);
        _allFetchLog.push(u);
        const root = document.documentElement;
        if (root) root.setAttribute('data-nls-fetch-other', _allFetchLog.join(' | '));
      }
      let p2;
      try {
        p2 = prevFetch.apply(this, args);
      } catch (e) {
        return Promise.reject(e);
      }
      // 上のfetchフック(874行目)と同じ理由: このPromiseをページ側がcatchしない失敗で
      // 「Uncaught (in promise) TypeError: Failed to fetch」が拡張エラーに出るのを防ぐ。
      if (p2 != null && typeof p2.then === 'function') {
        p2.catch(() => {
          /* ネットワーク失敗・CORS等はページ本来の挙動。ロギング目的のフックでは無視 */
        });
      }
      return p2;
    };
  } catch { /* no-op */ }

  try {
    let lastNotifiedHref = String(window.location.href || '');
    const notifySpaNavigation = () => {
      const prev = lastNotifiedHref;
      const cur = String(window.location.href || '');
      if (cur === prev) return;
      lastNotifiedHref = cur;
      postNlsIntercept({ type: 'NLS_SPA_NAVIGATION', url: cur, prevUrl: prev });
    };
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;
    history.pushState = function (...args) {
      const result = origPushState.apply(this, args);
      notifySpaNavigation();
      return result;
    };
    history.replaceState = function (...args) {
      const result = origReplaceState.apply(this, args);
      notifySpaNavigation();
      return result;
    };
    window.addEventListener('popstate', notifySpaNavigation);
  } catch { /* no-op */ }

  /*
   * ★v0.1.1268: 「誰が host に display:none を書いたか」を【同期で】捕らえるトラップ。
   *
   * ■ なぜ MAIN world(このファイル)に置くか — 最重要
   *   content script は isolated world で動き、DOM は共有でも【JSラッパーは world ごとに別】。
   *   content-entry 側で defineProperty しても、ページの書き込みは別ラッパーを通るため
   *   【絶対に発火しない】。実証(DevToolsコンソール)が main world だったため、
   *   実装先を間違えると「実証済みなのに0が出る」最悪の空振りになる。
   *
   * ■ なぜ MutationObserver ではダメか
   *   コールバックは非同期(マイクロタスク)で配信され、書き手は既にスタックから消えている(MDN)。
   *   v0.1.1267 の速報に出た「書き換えた場所: at MutationObserver...」は計器自身の座標だった。
   *
   * ■ 副産物: 自分を犯人と誤報する経路が原理的に無い
   *   拡張(isolated)の書き込みはこのトラップを物理的に通らない。reentrancy フラグ不要。
   *
   * ■ ★prototype は触らない
   *   setProperty / setAttribute は【インスタンスに own property を定義すれば prototype を
   *   shadow できる】。よってページ全体・他拡張への副作用はゼロ。
   *
   * ■ ★この版は観測に徹する(値の拒否・復元はしない)
   *   犯人特定前の対処は v0.1.1250(唯一の復帰経路を塞いでパネルが戻らなくなった)の再演リスク。
   */
  try {
    const HWT_MSG = 'NLS_HOST_WRITE_TRAP';
    const HWT_HOST_ID = 'nls-inline-popup-host';
    /*
     * ★v0.1.1270: 「トラップのコードにそもそも到達したか」を最初に1回報告する。
     *
     *   v0.1.1268/1269 は2版続けて armed:null(=1度も報告が届かない)だった。
     *   合図を3系統に増やしても変わらなかったので、疑うべきは合図ではなく
     *   【この MAIN world スクリプト自体が視聴ページで走っているか】。
     *   ここより上には早期 return が2つある(既に注入済み / 視聴ページ以外)。
     *   到達の可否を先に切り分けないと、これ以上どこを直しても当たらない。
     *   ★この1行が届けば「到達している=合図側の問題」、届かなければ「到達していない」。
     */
    postNlsIntercept({
      type: HWT_MSG, armed: false,
      armReason: `reached(top=${window.top === window.self}, path=${String(window.location?.pathname || '').slice(0, 40)})`
    });
    const HWT_ARM_EVENT = 'nls:hwt-arm';
    const HWT_STACK_SAMPLE_MAX = 4;
    const HWT_FLUSH_MS = 1000;

    const hwtArmed = new WeakSet();
    let hwtCounts = { prop: 0, setProperty: 0, cssText: 0, setAttribute: 0 };
    let hwtNoneWrites = 0;
    let hwtStacksTaken = 0;
    let hwtPending = [];
    let hwtFlushTimer = null;

    const hwtHasNone = (v) => /display\s*:\s*none/i.test(String(v || ''));

    const hwtFlush = () => {
      hwtFlushTimer = null;
      if (!hwtNoneWrites && !hwtPending.length) return;
      const newSamples = hwtPending;
      hwtPending = [];
      postNlsIntercept({
        type: HWT_MSG,
        counts: { ...hwtCounts },
        noneWrites: hwtNoneWrites,
        newSamples
      });
      hwtCounts = { prop: 0, setProperty: 0, cssText: 0, setAttribute: 0 };
      hwtNoneWrites = 0;
    };

    /** 捕獲を記録する。★記録の失敗が書き込み自体を壊してはいけない。 */
    const hwtNote = (route, value) => {
      try {
        hwtCounts[route] = (hwtCounts[route] || 0) + 1;
        hwtNoneWrites += 1;
        if (hwtStacksTaken < HWT_STACK_SAMPLE_MAX) {
          hwtStacksTaken += 1;
          const stack = String(new Error('nls-who-set-display-none').stack || '');
          hwtPending.push({
            route,
            valueHead: String(value || '').slice(0, 80),
            // 先頭行は "Error: ..." なので落とし、呼び出し元の行だけを渡す。
            frames: stack.split('\n').slice(1, 6).map((s) => s.trim()).filter(Boolean).slice(0, 3),
            t: Date.now()
          });
        }
        if (hwtFlushTimer == null) hwtFlushTimer = setTimeout(hwtFlush, HWT_FLUSH_MS);
      } catch { /* 計器の失敗で描画を止めない */ }
    };

    /**
     * host 1つにトラップを装着する(idempotent)。
     * @param {HTMLElement} el
     */
    const installHostDisplayWriteTrap = (el) => {
      if (!el || hwtArmed.has(el)) return;
      hwtArmed.add(el);
      let ok = false;
      let reason = '';
      try {
        const style = el.style;
        const proto = Object.getPrototypeOf(style);
        // ★original は装着前に保存する(自分の shadow を再帰的に呼ばないため)。
        const origSetProperty = proto.setProperty;
        const origSetAttribute = el.setAttribute;
        const cssTextDesc = Object.getOwnPropertyDescriptor(proto, 'cssText');

        // (1) el.style.display = 'none'
        Object.defineProperty(style, 'display', {
          configurable: true,
          enumerable: true,
          get() { return origSetProperty ? style.getPropertyValue('display') : ''; },
          set(v) {
            if (String(v) === 'none') hwtNote('prop', v);
            origSetProperty.call(style, 'display', String(v));
          }
        });

        // (2) el.style.setProperty('display','none') — own property が prototype を shadow する
        Object.defineProperty(style, 'setProperty', {
          configurable: true,
          writable: true,
          value: function (name, value, priority) {
            if (String(name) === 'display' && String(value) === 'none') hwtNote('setProperty', value);
            return origSetProperty.call(this, name, value, priority);
          }
        });

        // (3) el.style.cssText = '...display:none...'
        if (cssTextDesc && cssTextDesc.set) {
          Object.defineProperty(style, 'cssText', {
            configurable: true,
            enumerable: true,
            get() { return cssTextDesc.get ? cssTextDesc.get.call(style) : ''; },
            set(v) {
              if (hwtHasNone(v)) hwtNote('cssText', v);
              cssTextDesc.set.call(style, v);
            }
          });
        }

        // (4) el.setAttribute('style','...display:none...')
        Object.defineProperty(el, 'setAttribute', {
          configurable: true,
          writable: true,
          value: function (name, value) {
            if (String(name) === 'style' && hwtHasNone(value)) hwtNote('setAttribute', value);
            return origSetAttribute.call(this, name, value);
          }
        });

        ok = true;
      } catch (e) {
        reason = String((e && e.message) || e || 'unknown').slice(0, 80);
      }
      postNlsIntercept({ type: HWT_MSG, armed: ok, armReason: reason });
    };

    /*
     * ★v0.1.1269: 装着の合図を【3系統】にした。1系統だけだと取りこぼす。
     *
     *   v0.1.1268 は CustomEvent の1回きりの合図だけに頼っていた。実測は armed:null
     *   (=1度も装着結果を報告していない)。合図が1回きりだと、
     *     ・host がまだ DOM に入っていない
     *     ・isolated 側の dispatch が MAIN 側のリスナー登録より前
     *     ・そもそも host が新規生成されず条件が成立しない(実測: host_created=0回)
     *   のどれかで【永久に届かない】。★一度きりの合図は取りこぼす、が今回の教訓。
     *
     *   (1) CustomEvent: isolated からの明示的な合図(届けば最速)
     *   (2) MutationObserver: host が DOM に現れた/差し替わった瞬間を自力で捕らえる
     *   (3) 低頻度ポーリング: 上2つが両方すり抜けても必ず追いつく最後の砦
     *   ★どれか1つでも通れば装着される。WeakSet で idempotent なので二重装着は無い。
     */
    /*
     * ★装着を試みた回数と「host が見つからなかった」回数を数える。
     *   v0.1.1268 の armed:null は「トラップが動いていない」としか分からず、
     *   ①合図が来ていないのか ②host が見つからないのか ③装着に失敗したのか
     *   を区別できなかった。数を報告して二度と曖昧にしない
     *   ([[zero-count-may-mean-unmeasured-2026-08-04]])。
     */
    let hwtArmAttempts = 0;
    let hwtHostMissing = 0;

    const tryArmNow = () => {
      try {
        hwtArmAttempts += 1;
        const el = document.getElementById(HWT_HOST_ID);
        if (!el) {
          hwtHostMissing += 1;
          // 何度探しても居ないことを、たまに報告する(黙って諦めない)。
          if (hwtArmAttempts === 5 || hwtArmAttempts === 30) {
            postNlsIntercept({
              type: HWT_MSG, armed: false,
              armReason: `host-not-found(探索${hwtArmAttempts}回・不在${hwtHostMissing}回)`
            });
          }
          return;
        }
        installHostDisplayWriteTrap(el);
      } catch { /* no-op */ }
    };

    // (1) isolated からの明示的な合図。
    window.addEventListener(HWT_ARM_EVENT, tryArmNow);

    /*
     * (2) host の出現を自力で監視する(isolated の合図に依存しない)。
     * ★ニコ生はコメントが滝のように流れるページなので、subtree 全体を監視すると
     *   コールバックが毎秒何百回も走る(v0.1.1201 で「paint毎のDOM走査」を入れて
     *   拡張全体を重くした前科と同じ轍)。
     *   → 装着に成功したら【即 disconnect】し、常駐させない。
     *     取りこぼしても (3) のポーリングが必ず拾うので、ここは best-effort でよい。
     */
    let hwtRootObserver = null;
    const stopRootObserver = () => {
      try { if (hwtRootObserver) { hwtRootObserver.disconnect(); hwtRootObserver = null; } }
      catch { /* no-op */ }
    };
    try {
      hwtRootObserver = new MutationObserver(() => {
        const el = document.getElementById(HWT_HOST_ID);
        if (!el) return;          // まだ居ない=何もしない(最も多い経路を最速で抜ける)
        installHostDisplayWriteTrap(el);
        stopRootObserver();        // ★役目を終えたら常駐させない
      });
      hwtRootObserver.observe(document.documentElement, { childList: true, subtree: true });
    } catch { /* observer 不可なら (3) が拾う */ }

    // (3) 最後の砦。2秒ごとに存在確認するだけ(O(1)・getElementById のみ)。
    //     ★装着済みなら WeakSet で即 return するので、実質コストはゼロ。
    try { setInterval(tryArmNow, 2000); } catch { /* no-op */ }
    tryArmNow(); // 既に host が居るなら即装着(リロード後の再注入など)
  } catch { /* トラップの失敗で本体を止めない */ }
})();
