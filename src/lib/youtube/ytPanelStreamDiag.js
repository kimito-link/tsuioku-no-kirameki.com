// ytPanelStreamDiag.js — 横の欄(サイドパネル)・コメビュが「どの配信を出したか」を数える計器(0.1.1946)。
//
// ★なぜ(2026-11-09 りんく実機): Kick・Twitch・ふわっち・SHOWROOM・ミクチャ・TikTok を前面にしても、横の欄が YouTube に戻る。
//   真因の候補はコードから読めた(council/panel-stream-selection-MAP.md)が、本番では測っていない。直す前に「誰が配信を決めたか」を
//   数で残す(council/panel-stream-selection-SPEC.md §6)。この版は計器だけ=画面の動きは1つも変えない。
// ★掟: 名前・本文・URL 全体は残さない(サービス名・配信キーの頭・疑似 lv・時間・回数だけ)。純関数(時計と書き込みは呼び出し側が渡す)。

import { platformOfStreamKey } from '../platform/streamPlatform.js';

export const YT_PANEL_STREAM_DIAG_KEY_PREFIX = 'yt_diag_panel_stream_';
const HIST = 10;

/** 配信キー → 'youtube' / サービス id / '' @param {unknown} key */
export function serviceOfStreamKey(key) {
  const k = String(key || '');
  if (!k) return '';
  return platformOfStreamKey(k)?.id || 'youtube';
}

/** URL → ホスト名だけ(パス・クエリは残さない) @param {unknown} url */
export function hostOfUrl(url) {
  try {
    return new URL(String(url || '')).hostname;
  } catch {
    return '';
  }
}

/**
 * どの画面で動いているか(書き先のキーを分ける=サイドパネルとコメビュが上書きし合わない)。
 * @param {unknown} pathname
 */
export function panelStreamDiagContext(pathname) {
  const p = String(pathname || '');
  if (/(?:^|\/)(?:yt-)?sidepanel\.html$/.test(p)) return 'sidepanel';
  if (/(?:^|\/)(?:yt-)?comeview\.html$/.test(p)) return 'comeview';
  if (/(?:^|\/)(?:yt-)?venue\.html$/.test(p)) return 'venue';
  if (/marketing-export\.html$/.test(p)) return 'marketing';
  return 'page';
}

/** @template T @param {T[]} arr @param {T} v */
function pushCapped(arr, v) {
  arr.push(v);
  if (arr.length > HIST) arr.splice(0, arr.length - HIST);
}

/**
 * @param {{ now: () => number, lvToKey: (lv: string) => string, panelService?: string }} deps
 */
export function createPanelStreamDiag(deps) {
  const now = deps.now;
  const lvToKey = deps.lvToKey;
  const s = {
    v: 1,
    at: 0,
    /** nls_last_watch_url を聞かれて shim が何で答えたか */
    lastWatch: { source: 'none', service: '', lv: '', at: 0, counts: { page: 0, newest: 0, none: 0 } },
    /** popup がコメントを聞いてきた配信(probe = 1回の読みで2配信以上=探り読み) */
    askedLvHistory: /** @type {Array<{at:number, lv:string, service:string, probe:boolean}>} */ ([]),
    askedSwitches: 0,
    /** 「最後に見た配信が変わった」の知らせを配った記録 */
    announceHistory: /** @type {Array<{at:number, lv:string, service:string, reason:string}>} */ ([]),
    announceCounts: /** @type {Record<string, number>} */ ({}),
    /** popup が nls_last_watch_url に書いた回数(pseudo = 疑似 lv を書いた=ニコ生の引き出しへの漏れ) */
    popupLastWatchWrites: { count: 0, pseudo: 0, lastService: '', lastAt: 0 },
    /** tabs.query({active:true}) の結果 */
    activeQuery: /** @type {Array<{at:number, host:string, mapped:boolean, service:string, ms:number}>} */ ([]),
    tabsQuery: { calls: 0, slowOver1100ms: 0, emptyActive: 0 },
    /** 配信のページなのに配信キーに写せなかったタブ(記録の無い部屋など) */
    unmappedWatchTabs: { count: 0, lastHost: '', lastAt: 0 },
    /** 探り読み(1回の get で comments を2配信以上聞く) */
    probe: { calls: 0, lvs: 0, maxMs: 0, lastMs: 0 },
    /** windows.getLastFocused の前面タブが配信ページだったのに写されていない回数 */
    lastFocused: { calls: 0, watchLikeUnmapped: 0 },
    /** 0.1.1949: 外枠が src に焼いた配信のサービス('' = 焼いていない) */
    panelStreamService: String(deps.panelService || ''),
    /** 外枠のサービスと、画面が聞いた配信のサービスが食い違った回数(SPEC §3-a: 0 でなければ言葉の元文保持を検討) */
    contentPlatformMismatch: 0,
  };
  let lastAsked = '';

  /** @param {string} lv */
  const svc = (lv) => serviceOfStreamKey(lvToKey(lv));

  return {
    /** @param {'page'|'newest'|'none'} source @param {string} lv */
    lastWatch(source, lv) {
      const t = now();
      s.lastWatch.source = source;
      s.lastWatch.lv = String(lv || '');
      s.lastWatch.service = lv ? svc(lv) : '';
      s.lastWatch.at = t;
      s.lastWatch.counts[source] = (s.lastWatch.counts[source] || 0) + 1;
      s.at = t;
    },
    /** @param {string} lv @param {boolean} probe */
    asked(lv, probe) {
      const t = now();
      const id = String(lv || '');
      if (!probe && id && lastAsked && id !== lastAsked) s.askedSwitches += 1;
      if (!probe && id) lastAsked = id;
      if (!probe && id && s.panelStreamService && svc(id) && svc(id) !== s.panelStreamService) s.contentPlatformMismatch += 1;
      const prev = s.askedLvHistory[s.askedLvHistory.length - 1];
      // 同じ配信を続けて聞くのは1件にまとめる(3秒ごとの見直しで履歴が埋まらない)
      if (prev && prev.lv === id && prev.probe === probe) prev.at = t;
      else pushCapped(s.askedLvHistory, { at: t, lv: id, service: svc(id), probe });
      s.at = t;
    },
    /** @param {string} lv @param {string} reason */
    announce(lv, reason) {
      const t = now();
      pushCapped(s.announceHistory, { at: t, lv: String(lv || ''), service: svc(lv), reason });
      s.announceCounts[reason] = (s.announceCounts[reason] || 0) + 1;
      s.at = t;
    },
    /** @param {unknown} value popup が nls_last_watch_url に書こうとした値 */
    popupLastWatchWrite(value) {
      const t = now();
      const m = /\/watch\/(lv\d{1,15})/.exec(String(value || ''));
      const lv = m ? m[1].toLowerCase() : '';
      const key = lv ? lvToKey(lv) : '';
      s.popupLastWatchWrites.count += 1;
      if (key) s.popupLastWatchWrites.pseudo += 1;
      s.popupLastWatchWrites.lastService = key ? serviceOfStreamKey(key) : lv ? 'niconico' : '';
      s.popupLastWatchWrites.lastAt = t;
      s.at = t;
    },
    /** @param {{ url: string, mappedKey: string, ms: number, empty: boolean }} q */
    activeQuery(q) {
      const t = now();
      s.tabsQuery.calls += 1;
      if (q.ms > 1100) s.tabsQuery.slowOver1100ms += 1;
      if (q.empty) s.tabsQuery.emptyActive += 1;
      const entry = { at: t, host: hostOfUrl(q.url), mapped: !!q.mappedKey, service: q.mappedKey ? serviceOfStreamKey(q.mappedKey) : '', ms: Math.round(q.ms) };
      const prev = s.activeQuery[s.activeQuery.length - 1];
      if (prev && prev.host === entry.host && prev.mapped === entry.mapped && prev.service === entry.service) {
        prev.at = t;
        prev.ms = Math.max(prev.ms, entry.ms);
      } else pushCapped(s.activeQuery, entry);
      s.at = t;
    },
    /** @param {string} url */
    unmappedWatchTab(url) {
      s.unmappedWatchTabs.count += 1;
      s.unmappedWatchTabs.lastHost = hostOfUrl(url);
      s.unmappedWatchTabs.lastAt = now();
      s.at = s.unmappedWatchTabs.lastAt;
    },
    /** @param {number} lvs @param {number} ms */
    probe(lvs, ms) {
      s.probe.calls += 1;
      s.probe.lvs = Math.max(s.probe.lvs, lvs);
      s.probe.lastMs = Math.round(ms);
      s.probe.maxMs = Math.max(s.probe.maxMs, Math.round(ms));
      s.at = now();
    },
    /** @param {boolean} watchLikeUnmapped */
    lastFocused(watchLikeUnmapped) {
      s.lastFocused.calls += 1;
      if (watchLikeUnmapped) s.lastFocused.watchLikeUnmapped += 1;
      s.at = now();
    },
    snapshot() {
      return JSON.parse(JSON.stringify(s));
    },
  };
}
