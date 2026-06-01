/**
 * feat/multitab-scale-globalcap（2026-05-31）: コメント IDB の「常駐・単一書き手」を担う
 * Offscreen Document。
 *
 * なぜ Offscreen か（[[reference_multitab_scale_globalcap]] / 世界事例リサーチ）:
 *   - MV3 の Service Worker は idle/5 分で停止し得る ephemeral 文脈で、append のたびに DB を
 *     open/close していた。高頻度ライブ追記では open/close が無駄に重く、途中停止で取りこぼす
 *     懸念もあった。
 *   - Offscreen Document は MV3 で唯一「常駐できる DOM 文脈」。DB を開きっぱなしで保持でき、
 *     勝手に停止しない。重い IDB 書き＋件数集計をここに集約し、ページ描画スレッド（content）と
 *     ephemeral な SW から切り離す。
 *
 * ⚠️ 制約: Offscreen は chrome.runtime（messaging）と IndexedDB だけが使える。chrome.storage は
 *   使えない（公式仕様）。そこで summary / auto-backup state の chrome.storage 書きと初回移行は
 *   SW 側に残し、ここは「IDB 追記 → 件数/直近 → SW へ応答 → popup へ BroadcastChannel 通知」だけ。
 *   なお IndexedDB は拡張オリジン共有なので、SW（移行）と Offscreen（ライブ追記）が同じ DB を
 *   触っても IDB トランザクションが直列化して整合する。
 *
 * メッセージ（SW からのみ転送される）:
 *   - NLS_OFFSCREEN_CDB_APPEND { liveId, rawRows, tabKey } → { ok, added, total, recent }
 *   - NLS_OFFSCREEN_CDB_PING               → { ok: true }（存在確認）
 *
 * 公平性: tabKey 単位の FIFO を round-robin で 1 サブチャンク（CDB_SUB_CHUNK 行）ずつ処理する。
 *   1 タブの巨大バックフィルが他タブのライブ追記を待たせ続けないため。なお Phase 1 のグローバル
 *   リーダーで「重いバックフィルは同時 1 タブ」に絞っているので、競合自体が起きにくい二重の備え。
 *
 * @module offscreen-entry
 */

import {
  openCommentDb,
  appendCommentsToDb,
  countCommentsForLive,
  readRecentCommentsForLive,
  isCommentDbAvailable
} from '../lib/commentDb.js';
import { createCommentEntry, buildDedupeKey } from '../lib/commentRecord.js';
import { CDB_BROADCAST_CHANNEL } from '../lib/storageKeys.js';

const OFFSCREEN_APPEND_TYPE = 'NLS_OFFSCREEN_CDB_APPEND';
const OFFSCREEN_PING_TYPE = 'NLS_OFFSCREEN_CDB_PING';

/** SW 側 summary と揃える直近件数（writeCommentDbSummaryAndBackupState の CDB_SUMMARY_RECENT_MAX）。 */
const RECENT_MAX = 60;
/** round-robin で 1 ターンに処理する最大行数。大きいジョブを刻んで他タブへ譲る。 */
const CDB_SUB_CHUNK = 500;

/** @type {IDBDatabase|null} 開きっぱなしで保持する DB ハンドル（常駐の肝）。 */
let _db = null;

/** @returns {Promise<IDBDatabase|null>} */
async function getDb() {
  if (!isCommentDbAvailable()) return null;
  if (_db) return _db;
  try {
    _db = await openCommentDb();
    // 予期せぬ close（バージョン変更/失効）で握ったハンドルを捨てて次回開き直す。
    try {
      _db.onclose = () => {
        _db = null;
      };
      _db.onversionchange = () => {
        try {
          _db && _db.close();
        } catch {
          /* no-op */
        }
        _db = null;
      };
    } catch {
      /* no-op */
    }
  } catch {
    _db = null;
  }
  return _db;
}

/** @type {BroadcastChannel|null} */
let _bc = null;
function getBroadcast() {
  if (_bc) return _bc;
  try {
    _bc = new BroadcastChannel(CDB_BROADCAST_CHANNEL);
  } catch {
    _bc = null;
  }
  return _bc;
}

/**
 * 生 row（ParsedCommentRow 相当）→ dkey 付きの保存レコードへ整形する。
 * createCommentEntry / buildDedupeKey は content と同一の正本（src/lib）。content の
 * メインスレッドからこの正規化を剥がす（多タブで描画を固めない）のが狙い。
 * @param {string} liveId
 * @param {Array<Record<string, unknown>>} rawRows
 * @returns {Array<Record<string, unknown>>}
 */
function buildRowsForDb(liveId, rawRows) {
  const lid = String(liveId || '').trim().toLowerCase();
  const list = Array.isArray(rawRows) ? rawRows : [];
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const entry = createCommentEntry(
      /** @type {any} */ ({ liveId: lid, ...r })
    );
    if (!entry.text) continue;
    /** @type {Record<string, unknown>} */
    const rec = {
      commentNo: entry.commentNo,
      text: entry.text,
      userId: entry.userId,
      capturedAt: entry.capturedAt,
      dkey: buildDedupeKey(lid, entry)
    };
    if (entry.nickname) rec.nickname = entry.nickname;
    if (entry.avatarUrl) rec.avatarUrl = entry.avatarUrl;
    if (entry.avatarObserved) rec.avatarObserved = true;
    if (entry.vpos != null) rec.vpos = entry.vpos;
    if (entry.accountStatus != null) rec.accountStatus = entry.accountStatus;
    if (entry.is184) rec.is184 = true;
    out.push(rec);
  }
  return out;
}

/**
 * @typedef {{
 *   liveId: string,
 *   rows: Array<Record<string, unknown>>,
 *   offset: number,
 *   added: number,
 *   resolve: (v: { ok: boolean, added: number, total: number, recent: Array<Record<string, unknown>> }) => void
 * }} AppendJob
 */

/** @type {Map<string, AppendJob[]>} tabKey → ジョブ FIFO */
const _queues = new Map();
/** @type {string[]} round-robin 用の tabKey 順 */
const _order = [];
let _draining = false;

/**
 * @param {string} tabKey
 * @param {AppendJob} job
 */
function enqueueJob(tabKey, job) {
  const key = String(tabKey || '_');
  let q = _queues.get(key);
  if (!q) {
    q = [];
    _queues.set(key, q);
    _order.push(key);
  }
  q.push(job);
  if (!_draining) void drain();
}

/** @returns {string|null} 次に処理する tabKey（round-robin） */
function pickNextTabKey() {
  while (_order.length) {
    const key = _order[0];
    const q = _queues.get(key);
    if (q && q.length) return key;
    // 空になった tab は order から外す
    _order.shift();
    _queues.delete(key);
  }
  return null;
}

async function drain() {
  if (_draining) return;
  _draining = true;
  try {
    for (;;) {
      const key = pickNextTabKey();
      if (key == null) break;
      const q = /** @type {AppendJob[]} */ (_queues.get(key));
      const job = q[0];
      const finished = await processOneChunk(job);
      if (finished) {
        q.shift();
        finalizeJob(job).catch(() => {
          try {
            job.resolve({ ok: false, added: job.added, total: 0, recent: [] });
          } catch {
            /* no-op */
          }
        });
      }
      // round-robin: 処理した tab を末尾へ回し、他タブに順番を譲る。
      _order.shift();
      if (q.length) _order.push(key);
      else _queues.delete(key);
    }
  } finally {
    _draining = false;
  }
}

/**
 * ジョブの未処理分から最大 CDB_SUB_CHUNK 行を 1 トランザクションで追記する。
 * @param {AppendJob} job
 * @returns {Promise<boolean>} true ならこのジョブは全行処理済み
 */
async function processOneChunk(job) {
  const db = await getDb();
  if (!db) return true; // DB 不可: これ以上処理できない（finalize で total=0 を返す）
  const start = job.offset;
  const end = Math.min(job.rows.length, start + CDB_SUB_CHUNK);
  const slice = job.rows.slice(start, end);
  if (slice.length) {
    try {
      const res = await appendCommentsToDb(db, job.liveId, slice);
      job.added += Number(res?.added) || 0;
    } catch {
      // 一過性の失敗（バージョン変更等）はハンドルを捨てて次回開き直す。取りこぼしは
      // content 側の再キュー（SW 経由の ok=false 応答）に委ねる。
      try {
        db.close();
      } catch {
        /* no-op */
      }
      _db = null;
    }
  }
  job.offset = end;
  return job.offset >= job.rows.length;
}

/**
 * 全行処理後: 件数/直近を取って SW へ応答し、popup へ BroadcastChannel 通知する。
 * @param {AppendJob} job
 */
async function finalizeJob(job) {
  const db = await getDb();
  let total = 0;
  /** @type {Array<Record<string, unknown>>} */
  let recentFull = [];
  if (db) {
    try {
      total = await countCommentsForLive(db, job.liveId);
      recentFull = await readRecentCommentsForLive(db, job.liveId, RECENT_MAX);
    } catch {
      total = 0;
      recentFull = [];
    }
  }
  const recent = recentFull.map((r) => ({
    commentNo: String(r.commentNo ?? ''),
    text: String(r.text ?? ''),
    userId: r.userId != null ? String(r.userId) : null,
    capturedAt: Number(r.capturedAt) || 0,
    is184: r.is184 === true
  }));
  // popup/パネルへ即時 push（chrome.storage の onChanged より速く件数を反映する）。
  const bc = getBroadcast();
  if (bc) {
    try {
      bc.postMessage({ type: 'cdb_summary', liveId: job.liveId, total, recent });
    } catch {
      /* no-op */
    }
  }
  try {
    job.resolve({ ok: true, added: job.added, total, recent });
  } catch {
    /* no-op */
  }
}

/**
 * @param {string} liveId
 * @param {Array<Record<string, unknown>>} rawRows
 * @param {string} tabKey
 * @returns {Promise<{ ok: boolean, added: number, total: number, recent: Array<Record<string, unknown>> }>}
 */
function appendViaQueue(liveId, rawRows, tabKey) {
  const lid = String(liveId || '').trim().toLowerCase();
  const rows = buildRowsForDb(lid, rawRows);
  return new Promise((resolve) => {
    if (!/^lv\d{1,15}$/.test(lid)) {
      resolve({ ok: false, added: 0, total: 0, recent: [] });
      return;
    }
    enqueueJob(tabKey, { liveId: lid, rows, offset: 0, added: 0, resolve });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return undefined;
  // SW（同一拡張）からの転送だけ受ける。content/web からの直送は無視。
  if (!sender || sender.id !== chrome.runtime.id) return undefined;
  if (msg.type === OFFSCREEN_PING_TYPE) {
    try {
      sendResponse({ ok: true });
    } catch {
      /* no-op */
    }
    return false;
  }
  if (msg.type !== OFFSCREEN_APPEND_TYPE) return undefined;
  appendViaQueue(msg.liveId, msg.rawRows, msg.tabKey)
    .then((v) => {
      try {
        sendResponse(v);
      } catch {
        /* no-op */
      }
    })
    .catch(() => {
      try {
        sendResponse({ ok: false, added: 0, total: 0, recent: [] });
      } catch {
        /* no-op */
      }
    });
  return true; // 非同期応答
});
