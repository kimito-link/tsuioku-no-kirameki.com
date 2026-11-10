// ytPanelStreamDiag.js — 横の欄(サイドパネル)・コメビュが「どの配信を出したか」を数える計器(0.1.1946)。
//
// ★なぜ(2026-11-09 りんく実機): Kick・Twitch・ふわっち・SHOWROOM・ミクチャ・TikTok を前面にしても、横の欄が YouTube に戻る。
//   真因の候補はコードから読めた(council/panel-stream-selection-MAP.md)が、本番では測っていない。直す前に「誰が配信を決めたか」を
//   数で残す(council/panel-stream-selection-SPEC.md §6)。この版は計器だけ=画面の動きは1つも変えない。
// ★掟: 名前・本文・URL 全体は残さない(サービス名・配信キーの頭・疑似 lv・時間・回数だけ)。純関数(時計と書き込みは呼び出し側が渡す)。

import { platformOfStreamKey } from '../platform/streamPlatform.js';

export const YT_PANEL_STREAM_DIAG_KEY_PREFIX = 'yt_diag_panel_stream_';
const HIST = 10;
const CALLERS_MAX = 12;
const STORAGE_KEYS_MAX = 24;

/**
 * storage のキー名を数え上げ用にまとめる(数字の並びは N・長さは40字まで)。
 * @param {unknown} key
 */
export function normalizeStorageKeyName(key) {
  return String(key || '').replace(/\d+/g, 'N').slice(0, 40);
}

/**
 * 呼び出し元の関数名だけを取り出す(URL・行番号は残さない)。skip に当たる枠は飛ばす。
 * @param {unknown} stack Error().stack @param {RegExp} [skip]
 */
export function callerNameFromStack(stack, skip = /measuredTabsQuery|wrapTabsFn|callerNameFromStack|Promise|<anonymous>|(?:^|\.)query$|withTimeout/) {
  const lines = String(stack || '').split('\n').slice(1);
  for (const line of lines) {
    const m = /^\s*at\s+(?:async\s+)?([\w$.]+)\s+\(/.exec(line);
    if (!m) continue;
    const name = m[1];
    if (skip.test(name)) continue;
    return name.slice(0, 60);
  }
  return '(anonymous)';
}

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
    /** 0.1.1951: 前面タブの問い合わせの多さの内訳(誰が呼んだか=関数名だけ・1秒あたりの最大) */
    tabsQueryCallers: /** @type {Record<string, number>} */ ({}),
    tabsQueryPeakPerSec: 0,
    /** 0.1.1951: この画面が受けた storage の変化(キー名の数字は N に=どのキーが描き直しを呼んでいるか) */
    storageChangedKeys: /** @type {Record<string, number>} */ ({}),
    storageChangedEvents: 0,
    /** 0.1.1953: 記録の更新の知らせ(見ている配信=built / 見ていない配信=skipped で組み立てなかった) */
    recordNotify: { built: 0, skipped: 0 },
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
    /** 0.1.1951: 読み込み直しを越えた累計(外枠が配信ごとに iframe を作り直すと上の数は 0 に戻るため) */
    lifetime: { frames: 1, contentPlatformMismatch: 0, askedSwitches: 0 },
  };
  /** 前の iframe までの累計 */
  const base = { frames: 0, contentPlatformMismatch: 0, askedSwitches: 0 };
  let lastAsked = '';
  let secAt = -1;
  let secCalls = 0;

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
      let mismatched = false;
      if (!probe && id && s.panelStreamService && svc(id) && svc(id) !== s.panelStreamService) {
        s.contentPlatformMismatch += 1;
        mismatched = true;
      }
      const prev = s.askedLvHistory[s.askedLvHistory.length - 1];
      // 同じ配信を続けて聞くのは1件にまとめる(3秒ごとの見直しで履歴が埋まらない)
      if (prev && prev.lv === id && prev.probe === probe) prev.at = t;
      else pushCapped(s.askedLvHistory, { at: t, lv: id, service: svc(id), probe });
      s.at = t;
      return mismatched; // true = すぐ書く(この iframe はまもなく作り直されるかもしれない)
    },
    /**
     * 前の iframe が書いた値から累計を引き継ぐ(起動時に1回)。
     * @param {any} prev
     */
    seedLifetime(prev) {
      const l = prev && typeof prev === 'object' ? prev.lifetime : null;
      if (!l || typeof l !== 'object') return;
      for (const k of /** @type {Array<keyof typeof base>} */ (['frames', 'contentPlatformMismatch', 'askedSwitches'])) {
        const v = Number(l[k]);
        if (Number.isFinite(v) && v > 0) base[k] = v;
      }
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
    /** @param {{ url: string, mappedKey: string, ms: number, empty: boolean, caller?: string }} q */
    activeQuery(q) {
      const t = now();
      s.tabsQuery.calls += 1;
      const sec = Math.floor(t / 1000);
      if (sec !== secAt) {
        secAt = sec;
        secCalls = 0;
      }
      secCalls += 1;
      if (secCalls > s.tabsQueryPeakPerSec) s.tabsQueryPeakPerSec = secCalls;
      const caller = String(q.caller || '?').slice(0, 60);
      if (caller in s.tabsQueryCallers || Object.keys(s.tabsQueryCallers).length < CALLERS_MAX) {
        s.tabsQueryCallers[caller] = (s.tabsQueryCallers[caller] || 0) + 1;
      } else s.tabsQueryCallers['(other)'] = (s.tabsQueryCallers['(other)'] || 0) + 1;
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
    /** @param {string[]} keys */
    storageChanged(keys) {
      s.storageChangedEvents += 1;
      for (const k of keys) {
        const name = normalizeStorageKeyName(k);
        if (name in s.storageChangedKeys || Object.keys(s.storageChangedKeys).length < STORAGE_KEYS_MAX) {
          s.storageChangedKeys[name] = (s.storageChangedKeys[name] || 0) + 1;
        } else s.storageChangedKeys['(other)'] = (s.storageChangedKeys['(other)'] || 0) + 1;
      }
    },
    /** @param {boolean} built */
    notify(built) {
      if (built) s.recordNotify.built += 1;
      else s.recordNotify.skipped += 1;
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
      s.lifetime = {
        frames: base.frames + 1,
        contentPlatformMismatch: base.contentPlatformMismatch + s.contentPlatformMismatch,
        askedSwitches: base.askedSwitches + s.askedSwitches,
      };
      return JSON.parse(JSON.stringify(s));
    },
  };
}
