/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】開いている配信タブのコメントを1本の時系列にまとめる判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし(キー名の定数だけ。読み書きは呼び出し側)
 * 【正本宣言】まとめてコメビュの選択・時系列・読み上げの同一判定はこのファイルのみ
 *
 * mergedComeview.js — わんコメ式に、今開いている複数配信のコメントを1つのコメビュへ時刻順で重ねる。
 *   開いていない配信は候補にしない(裏で取りにいかない)。読み上げは配信をまたいだ同一キーで1回だけ。
 */

import { combineCanonicalComeviewRows } from './comeviewRows.js';
import { platformChannelOfUrl } from './platform/streamPlatform.js';
import { toEpochMs } from './timeAuthority.js';
import { isYtWatchLikeUrl, parseYtVideoIdFromUrl } from './youtube/ytPageMeta.js';
import { computePseudoLvForVideoId } from './youtube/ytPseudoLv.js';

/** コメビュが覚えている「まとめる配信」の storage キー。 */
export const COMEVIEW_MERGE_STORAGE_KEY = 'nls_comeview_merge_v1';

/** バックグラウンドへ、選んだ配信の末尾だけを頼むメッセージ。全件は頼まない。 */
export const MERGED_RECENT_COMMENTS_MESSAGE = 'YT_GET_RECENT_STREAM_COMMENTS';

/** 1配信から時刻順に残す件数(新しい側)。 */
export const MERGE_PER_STREAM_CAP = 40;
/** 画面に出す合計。 */
export const MERGE_TOTAL_CAP = 80;
/** 同時にまとめる配信の上限(低スペックの CPU を守る)。 */
export const MERGE_MAX_STREAMS = 8;

/**
 * @typedef {{
 *   id: string,
 *   platformId: string,
 *   platformLabel: string,
 *   streamLabel: string,
 *   badge: string,
 *   badgeTitle: string,
 *   tabId: number | null,
 *   active: boolean,
 *   read: { kind: 'nico', liveId: string } | { kind: 'yt', videoId: string } | { kind: 'none' }
 * }} MergedStream
 */

/** @param {unknown} s @param {number} n */
function clip(s, n) {
  const chars = Array.from(String(s || '').trim());
  if (chars.length <= n) return chars.join('');
  return chars.slice(0, n).join('') + '…';
}

/**
 * タブの実 URL。YouTube 版の画面は tabs.query の写しで url を疑似 lv に変えるので、元 URL(__ytUrl)を優先する。
 * @param {{ url?: unknown, pendingUrl?: unknown, __ytUrl?: unknown }|null|undefined} tab
 */
export function tabPageUrl(tab) {
  if (!tab || typeof tab !== 'object') return '';
  return String(tab.__ytUrl || tab.url || tab.pendingUrl || '');
}

/** @param {string} title @param {string} fallback */
function streamLabelFromTitle(title, fallback) {
  const raw = String(title || '').replace(/\s*[-|｜].*$/, '').trim();
  return clip(raw || fallback, 12);
}

/**
 * @param {string} platformId
 * @param {string} platformLabel
 * @param {string} streamLabel
 * @param {number|null} tabId
 * @param {boolean} active
 * @param {MergedStream['read']} read
 * @returns {MergedStream}
 */
function streamOf(platformId, platformLabel, streamLabel, tabId, active, read) {
  const id = read.kind === 'nico'
    ? `nico:${read.liveId}`
    : read.kind === 'yt'
      ? `${platformId}:${read.videoId}`
      : `${platformId}:${streamLabel}`;
  const badge = clip(streamLabel ? `${platformLabel} ${streamLabel}` : platformLabel, 18);
  return {
    id,
    platformId,
    platformLabel,
    streamLabel,
    badge,
    badgeTitle: streamLabel ? `${platformLabel} ${streamLabel}` : platformLabel,
    tabId,
    active,
    read
  };
}

/**
 * 記録の一覧から、そのチャンネルのいちばん新しい配信キーを返す。仮キー(.00000)は記録ではない。
 * @param {Record<string, { updatedAt?: number }>|null|undefined} summaries
 * @param {string} keyHead
 * @param {string} login
 */
export function newestSummaryKey(summaries, keyHead, login) {
  const pre = `${keyHead}${String(login || '')}.`;
  if (!pre || pre === '.') return '';
  let best = '';
  let bestAt = -1;
  const bag = summaries && typeof summaries === 'object' ? summaries : {};
  for (const key of Object.keys(bag)) {
    if (!key.startsWith(pre) || key.endsWith('.00000')) continue;
    const at = Number(bag[key] && bag[key].updatedAt);
    const stamp = Number.isFinite(at) ? at : 0;
    if (stamp >= bestAt) {
      bestAt = stamp;
      best = key;
    }
  }
  return best;
}

/**
 * 開いているタブだけを配信候補にする。summaries は「どの記録キーか」の引き当てだけで、タブが無い配信は出さない。
 * @param {ReadonlyArray<{ id?: number, url?: string, pendingUrl?: string, title?: string, active?: boolean, __ytUrl?: string }>|null|undefined} tabs
 * @param {Record<string, { updatedAt?: number }>|null|undefined} summaries
 * @returns {MergedStream[]}
 */
export function describeOpenStreams(tabs, summaries) {
  const list = Array.isArray(tabs) ? tabs : [];
  /** @type {Map<string, MergedStream>} */
  const byId = new Map();
  for (const tab of list) {
    const url = tabPageUrl(tab);
    if (!url) continue;
    const tabId = typeof tab.id === 'number' ? tab.id : null;
    const active = tab.active === true;
    const title = String(tab.title || '');
    /** @type {MergedStream|null} */
    let described = null;
    const lvMatch = /\/watch\/(lv\d{1,15})(?:[/?#]|$)/i.exec(url);
    if (lvMatch && !tab.__ytUrl) {
      const liveId = lvMatch[1].toLowerCase();
      described = streamOf('niconico', 'ニコ生', streamLabelFromTitle(title, liveId), tabId, active, { kind: 'nico', liveId });
    } else if (isYtWatchLikeUrl(url)) {
      const videoId = parseYtVideoIdFromUrl(url);
      if (videoId) {
        described = streamOf('youtube', 'YouTube', streamLabelFromTitle(title, videoId), tabId, active, { kind: 'yt', videoId });
      }
    } else {
      const ch = platformChannelOfUrl(url);
      if (ch) {
        const newest = newestSummaryKey(summaries, ch.platform.keyHead, ch.login);
        const read = newest ? { kind: /** @type {'yt'} */ ('yt'), videoId: newest } : { kind: /** @type {'none'} */ ('none') };
        described = streamOf(
          ch.platform.id,
          ch.platform.name,
          streamLabelFromTitle(title, ch.login),
          tabId,
          active,
          read.kind === 'yt' ? read : { kind: 'none' }
        );
        // 選択はチャンネルで覚える。配信番号が変わっても、開いたままのタブは選ばれたまま。
        described = { ...described, id: `${ch.platform.id}:${ch.login}` };
      }
    }
    if (!described) continue;
    const prev = byId.get(described.id);
    if (!prev || (active && !prev.active)) byId.set(described.id, described);
  }
  return [...byId.values()];
}

/**
 * 覚えていた選択のうち、今開いているものだけを採用する。2件以上でまとめて表示。
 * @param {readonly MergedStream[]} open
 * @param {readonly unknown[]|null|undefined} savedIds
 */
export function resolveMergeTargets(open, savedIds) {
  const byId = new Map((Array.isArray(open) ? open : []).map((s) => [s.id, s]));
  /** @type {MergedStream[]} */
  const chosen = [];
  for (const raw of Array.isArray(savedIds) ? savedIds : []) {
    const s = byId.get(String(raw || ''));
    if (!s || chosen.some((c) => c.id === s.id)) continue;
    chosen.push(s);
    if (chosen.length >= MERGE_MAX_STREAMS) break;
  }
  return { open: Array.isArray(open) ? [...open] : [], chosen, active: chosen.length >= 2 };
}

/**
 * 末尾読みの videoId。空・長すぎ・仮キーは頼まない。
 * @param {unknown} raw
 * @param {number} [max]
 */
export function sanitizeRecentVideoIds(raw, max = MERGE_MAX_STREAMS) {
  const cap = Math.max(1, Math.min(MERGE_MAX_STREAMS, Math.floor(Number(max) || MERGE_MAX_STREAMS)));
  if (!Array.isArray(raw)) return [];
  /** @type {string[]} */
  const out = [];
  for (const id of raw) {
    const s = String(id || '').trim();
    if (!s || s.length > 80 || s.includes('..') || s.endsWith('.00000')) continue;
    if (out.includes(s)) continue;
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

/** @param {unknown} raw */
function rowTime(raw) {
  if (!raw || typeof raw !== 'object') return 0;
  const r = /** @type {Record<string, unknown>} */ (raw);
  return toEpochMs(r.capturedAt ?? r.postedAtMs ?? r.recordedAt ?? r.at);
}

/**
 * 時系列の末尾だけ残す。入力は古い→新しい想定(テール・末尾カーソルの戻り)。
 * @param {unknown} rows
 * @param {number} [limit]
 */
export function takeRecentComments(rows, limit = MERGE_PER_STREAM_CAP) {
  const cap = Math.max(1, Math.min(200, Math.floor(Number(limit) || MERGE_PER_STREAM_CAP)));
  const list = Array.isArray(rows) ? rows : [];
  const bounded = list.length > 2000 ? list.slice(-2000) : list;
  return bounded.length > cap ? bounded.slice(-cap) : bounded.slice();
}

/**
 * ニコ生の保存は末尾をすぐチャンクへ流す。新しい側から、件数が揃うまで次に読む seq を返す。
 * 足りていれば null。全チャンクは返さない。
 * @param {{ seqs?: unknown }|null|undefined} index
 * @param {readonly number[]} loadedSeqs
 * @param {number} loadedCount
 * @param {number} limit
 * @returns {number|null}
 */
export function nextNicoChunkSeq(index, loadedSeqs, loadedCount, limit) {
  const need = Math.max(1, Math.min(200, Math.floor(Number(limit) || 1)));
  if ((Number(loadedCount) || 0) >= need) return null;
  if (!index || typeof index !== 'object' || !Array.isArray(index.seqs)) return null;
  const loaded = new Set(
    (Array.isArray(loadedSeqs) ? loadedSeqs : []).map((n) => Math.floor(Number(n)))
  );
  const seqs = index.seqs
    .map((n) => Math.floor(Number(n)))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  for (let i = seqs.length - 1; i >= 0; i -= 1) {
    if (!loaded.has(seqs[i])) return seqs[i];
  }
  return null;
}

/**
 * チャンク(古い順)か本体配列と、まだ流していない末尾を足して、新しい側だけ残す。
 * chunks が配列のときは本体配列を使わない(空の末尾でもチャンク側が正本)。
 * @param {{ chunks?: unknown[]|null, main?: unknown, tail?: unknown }} parts
 * @param {number} [limit]
 */
export function assembleNicoRecentRows(parts, limit = MERGE_PER_STREAM_CAP) {
  const bag = parts && typeof parts === 'object' ? parts : {};
  /** @type {unknown[]} */
  let base = [];
  if (Array.isArray(bag.chunks)) {
    for (const part of bag.chunks) {
      if (Array.isArray(part)) base = base.concat(part);
    }
  } else if (Array.isArray(bag.main)) {
    base = bag.main;
  }
  const tail = Array.isArray(bag.tail) ? bag.tail : [];
  return takeRecentComments(combineCanonicalComeviewRows(base, tail), limit);
}

/**
 * @param {unknown} raw
 * @returns {{ text: string, name: string, userId: string, avatar: string, commentNo: string, capturedAt: number }|null}
 */
export function commentFromStoredRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const text = String(r.text ?? r.message ?? '').trim();
  if (!text) return null;
  return {
    text: text.slice(0, 500),
    name: String(r.nickname ?? r.name ?? r.author ?? '').trim().slice(0, 200),
    userId: String(r.userId ?? r.channelId ?? '').trim().slice(0, 80),
    avatar: String(r.avatarUrl ?? r.avatar ?? r.iconUrl ?? '').trim().slice(0, 400),
    commentNo: String(r.commentNo ?? r.no ?? r.id ?? '').trim().slice(0, 80),
    capturedAt: rowTime(r)
  };
}

/**
 * 選んだ配信の行を時刻順のタイムラインにする。同じ配信の同じ番号は1行。
 * @param {ReadonlyArray<{ stream: MergedStream, rows: unknown }>|null|undefined} groups
 * @param {{ perStream?: number, total?: number }} [opts]
 */
export function buildMergedTimeline(groups, opts = {}) {
  const per = Math.max(1, Math.floor(Number(opts.perStream) || MERGE_PER_STREAM_CAP));
  const total = Math.max(1, Math.floor(Number(opts.total) || MERGE_TOTAL_CAP));
  /** @type {Map<string, Record<string, unknown>>} */
  const byKey = new Map();
  for (const group of Array.isArray(groups) ? groups : []) {
    const stream = group && group.stream;
    if (!stream || !stream.id) continue;
    for (const raw of takeRecentComments(group.rows, per)) {
      const row = commentFromStoredRow(raw);
      if (!row) continue;
      const key = row.commentNo
        ? `${stream.id}:no:${row.commentNo}`
        : `${stream.id}:c:${row.userId}:${row.text}:${row.capturedAt}`;
      byKey.set(key, {
        kind: 'comment',
        at: row.capturedAt,
        key,
        userId: row.userId,
        nickname: row.name,
        text: row.text,
        commentNo: row.commentNo,
        avatarUrl: row.avatar,
        selfPosted: false,
        sourceBadge: stream.badge,
        sourceTitle: stream.badgeTitle,
        streamId: stream.id,
        voiceLiveId: leaseIdForStream(stream),
        voiceId: row.commentNo ? `${stream.id}\n${row.commentNo}` : key
      });
    }
  }
  const items = [...byKey.values()].sort((a, b) => {
    const d = Number(a.at) - Number(b.at);
    if (d) return d;
    const ak = String(a.key);
    const bk = String(b.key);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
  return items.length > total ? items.slice(items.length - total) : items;
}

/**
 * まだ読んでいない行だけ返す。heard には通した分も、上限で捨てた分も覚える(後から二重に読まない)。
 * @param {readonly { voiceId?: string }[]} items
 * @param {Set<string>} heard
 * @param {{ seeded: boolean, gapMs?: number, maxSpeak?: number, now?: number, lastAt?: number }} state
 */
export function takeMergedVoiceItems(items, heard, state) {
  const list = Array.isArray(items) ? items : [];
  /** @type {typeof list} */
  const fresh = [];
  for (const item of list) {
    const id = String(item && item.voiceId || '');
    if (!id || heard.has(id)) continue;
    heard.add(id);
    fresh.push(item);
  }
  while (heard.size > 4000) {
    const oldest = heard.values().next().value;
    if (oldest === undefined) break;
    heard.delete(oldest);
  }
  if (!state.seeded) return [];
  const maxSpeak = Math.max(1, Math.floor(Number(state.maxSpeak) || 3));
  const gapMs = Number(state.gapMs) > 0 ? Number(state.gapMs) : 15000;
  const now = Number(state.now) || 0;
  const lastAt = Number(state.lastAt) || 0;
  if (fresh.length > maxSpeak && now - lastAt > gapMs) return fresh.slice(fresh.length - maxSpeak);
  return fresh;
}

/**
 * 会場が同じ疑似 lv で読んでいる配信と取り合うための id。記録の無い部屋は空。
 * @param {MergedStream|null|undefined} stream
 */
export function leaseIdForStream(stream) {
  if (!stream || !stream.read) return '';
  if (stream.read.kind === 'nico') return String(stream.read.liveId || '').toLowerCase();
  if (stream.read.kind === 'yt') return computePseudoLvForVideoId(stream.read.videoId);
  return '';
}
