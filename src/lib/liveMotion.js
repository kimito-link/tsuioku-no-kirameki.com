import { toEpochMs } from './timeAuthority.js';
import { commentRows, supporterRows, isBlankIcon } from './liveRankingView.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';

/** 補間する系列。MVP は 'comment' だけ使う(他は型として用意・後段で有効化)。 */
export const MOTION_KINDS = /** @type {const} */ (['comment', 'watch', 'gift', 'ad']);
/** この間隔を超えた 2 標本は「補間しない」(古すぎる。速度の材料にはまだ使う)。 */
export const LERP_MAX_GAP_MS = 180_000;
/** この間隔を超えた 2 標本は速度の材料にもしない(15 分。cron 遅延の実測中央値 12 分を包む)。 */
export const RATE_MAX_GAP_MS = 15 * 60_000;
/** 補間の最短所要(標本が異常に近接して届いたときに一瞬で飛ばないように)。 */
export const LERP_MIN_DURATION_MS = 5_000;
/** 脈(点)の間隔の下限・上限。下限を割る速度は「帯」表示に切り替える(点を増やさない)。 */
export const PULSE_MIN_INTERVAL_MS = 250;
export const PULSE_MAX_INTERVAL_MS = 20_000;

/** @typedef {{ at: number, comment: number, watch: number, gift: number, ad: number }} MotionSample */
/** @typedef {'comment'|'watch'|'gift'|'ad'} MotionKind */

/**
 * 収集ペイロードの 1 配信 → 標本。at は data.capturedAt(サーバの収集時刻)。
 * ★数字が 0 は「0 件」と「取れなかった(api の numAt は欠測を 0 で返す)」を区別できない。
 *   ここでは値をそのまま持ち、表示側が「latest.comment===0 なら速度を出さない」で扱う。
 * @returns {MotionSample|null} capturedAt が読めなければ null(push しない)
 */
/** @param {any} live @param {unknown} capturedAt */
export function sampleFromLive(live, capturedAt) {
  const at = toEpochMs(capturedAt);
  if (!at) return null;
  return {
    at,
    comment: Number(live && live.commentCount) || 0,
    watch: Number(live && live.watchCount) || 0,
    gift: Number(live && live.giftTotal) || 0,
    ad: Number(live && live.adTotal) || 0
  };
}

/** @param {number} a @param {number} b @param {number} t */
export function lerp(a, b, t) { return a + (b - a) * t; }
/** @param {number} t */
export function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

/**
 * 1 配信ぶんの器。「from → to」モデル:
 *   - prev / latest … 実測の標本 2 点(速度の材料)。
 *   - from          … 表示アニメの起点 = 新標本が届いた瞬間に【画面に出ていた値】と受信時刻(受信側の時計)。
 *   - durationMs    … from→latest に掛ける時間 = 実測 2 点の間隔(clamp)。
 *   ★アニメの位相は受信側の時計(receivedAtMs)で測る。capturedAt(サーバ時計)で測ると
 *     時計ずれ・スロットル応答の遅れで最初から t=1 になり、動かない/飛ぶ。
 */
export function createMotionTrack() {
  /** @type {MotionSample|null} */ let prev = null;
  /** @type {MotionSample|null} */ let latest = null;
  /** @type {Partial<Record<MotionKind, number>>} */ let fromValue = {};
  let fromAtMs = 0;
  let durationMs = 0;

  /** @param {MotionKind} kind @param {number} nowMs */
  function valueAt(kind, nowMs) {
    if (!latest) return 0;
    const to = latest[kind];
    if (!prev || durationMs <= 0) return to;
    const t = clamp01((nowMs - fromAtMs) / durationMs);
    return Math.round(lerp(fromValue[kind] ?? to, to, t));
  }

  return {
    /**
     * @param {MotionSample|null} s
     * @param {number} receivedAtMs 受信側の Date.now()
     * @returns {boolean} 新しい標本として採用したか(同じ capturedAt の再送=throttled/inFlight は false)
     */
    push(s, receivedAtMs) {
      if (!s) return false;
      if (latest && s.at <= latest.at) return false;           // ★重複・逆行は捨てる
      /** @type {Partial<Record<MotionKind, number>>} */ const snapshot = {};
      for (const k of MOTION_KINDS) snapshot[k] = valueAt(k, receivedAtMs); // いま画面に出ている値から始める(後ろへ飛ばない)
      prev = latest;
      latest = s;
      const gap = prev ? s.at - prev.at : 0;
      // ★補間は「実測 2 点に挟まれた値」だけ。間隔が長すぎる(古い)ときは補間せず着地(snap)。
      durationMs = prev && gap <= LERP_MAX_GAP_MS ? Math.max(LERP_MIN_DURATION_MS, gap) : 0;
      fromValue = snapshot;
      fromAtMs = receivedAtMs;
      return true;
    },
    valueAt,
    /** 実測 2 点から速度(件/分)。材料が無い/古い/減っている(仕様変更・欠測)なら null。 */
    /** @param {MotionKind} kind */
    ratePerMin(kind) {
      if (!prev || !latest) return null;
      const gap = latest.at - prev.at;
      if (gap <= 0 || gap > RATE_MAX_GAP_MS) return null;
      const d = latest[kind] - prev[kind];
      if (d < 0) return null;                                    // ★減った=信じない(AGENTS §3.6)
      return (d / gap) * 60_000;
    },
    latest() { return latest; },
    /** @param {number} nowMs */
    isSettled(nowMs) { return !prev || durationMs <= 0 || nowMs - fromAtMs >= durationMs; }
  };
}

/**
 * 初回描画用の速度=配信開始からの平均(件/分)。実測 2 点が揃うまでの 60 秒を無音にしないための材料。
 * ★これも実データ(commentCount ÷ 経過分)。beginTime 無し・経過 1 分未満・件数 0 は null。
 */
/** @param {any} live @param {number} nowMs */
export function lifetimeCommentRatePerMin(live, nowMs) {
  const begin = Number(live && live.beginTime) || 0;
  const count = Number(live && live.commentCount) || 0;
  if (!begin || count <= 0) return null;
  const min = (nowMs / 1000 - begin) / 60;
  return min >= 1 ? count / min : null;
}

/** 速度 → 点の間隔(ms)。rate<=0/null は null(点を出さない)。 */
/** @param {number|null|undefined} ratePerMin */
export function pulseIntervalMs(ratePerMin) {
  if (ratePerMin == null || !(ratePerMin > 0)) return null;
  const ms = 60_000 / ratePerMin;
  return Math.min(PULSE_MAX_INTERVAL_MS, Math.max(PULSE_MIN_INTERVAL_MS, ms));
}

/** 下限を割る速度(=240 件/分超)は点を増やさず「帯」の濃さで表す。 */
/** @param {number|null|undefined} ratePerMin */
export function pulseIsBand(ratePerMin) {
  return ratePerMin != null && 60_000 / ratePerMin < PULSE_MIN_INTERVAL_MS;
}

/** 「+42/分」。null は「計測中」(嘘の 0 を書かない)。1 未満は小数 1 桁。 */
/** @param {number|null|undefined} rate */
export function formatRatePerMin(rate) {
  if (rate == null) return '計測中';
  if (rate < 1) return `+${(Math.round(rate * 10) / 10).toFixed(1)}/分`;
  return `+${Math.round(rate).toLocaleString('ja-JP')}/分`;
}

/** @typedef {{ key: string, kind: 'comment'|'gift'|'ad', name: string, avatar: string, url: string }} SupporterChip */

/**
 * 脈拍レーンに流す「誰が応援したか」カードの材料。★本文(発言内容)は一切含めない
 * (AGENTS.md §3.3・council-fable D-3②: コメント本文は一切保存・表示しない、を厳守)。
 * 既存の応援者一覧(commentRows/supporterRows)から名前・サムネ・種別だけを取り出す
 * (新しいデータ源・新しい取得経路は一切増やさない)。
 *
 * 並び順は「元の順位表の並びそのまま」(comment→gift→ad の種別ごとに連結)。呼び出し側
 * (createSupporterFeed)がこの配列を巡回キューとして使う。
 * @param {any} live
 * @returns {SupporterChip[]}
 */
export function supporterChipsFromLive(live) {
  /** @type {SupporterChip[]} */
  const out = [];
  for (const r of commentRows(live)) {
    if (!r.name) continue;
    out.push({ key: `c:${r.uid || r.name}`, kind: 'comment', name: r.name, avatar: r.avatar || '', url: r.url || '' });
  }
  const { gift, ad } = supporterRows(live);
  for (const r of gift) {
    if (!r.name) continue;
    const avatar = r.avatar && !isBlankIcon(r.avatar) ? r.avatar : anonymousIdenticonDataUrl(r.uid || r.name, 64);
    out.push({ key: `g:${r.uid || r.name}`, kind: 'gift', name: r.name, avatar, url: r.url || '' });
  }
  for (const r of ad) {
    if (!r.name) continue;
    const avatar = r.avatar && !isBlankIcon(r.avatar) ? r.avatar : anonymousIdenticonDataUrl(r.uid || r.name, 64);
    out.push({ key: `a:${r.uid || r.name}`, kind: 'ad', name: r.name, avatar, url: r.url || '' });
  }
  return out;
}

/**
 * 配信ごとに「まだ流していない人から順に」1人ずつ取り出す巡回キュー。
 * ★集計値ではなく演出専用(誰が何回流れても表示上の順番が変わるだけで、件数・金額には一切影響しない)。
 * 新しい render() のたびに `fill` で最新の候補配列を渡し、尽きたら先頭から周回する。
 */
export function createSupporterFeed() {
  /** @type {SupporterChip[]} */ let chips = [];
  let cursor = 0;
  return {
    /** @param {SupporterChip[]} next */
    fill(next) {
      chips = Array.isArray(next) ? next : [];
      if (cursor > chips.length) cursor = 0;
    },
    /** @returns {SupporterChip|null} */
    next() {
      if (!chips.length) return null;
      const c = chips[cursor % chips.length];
      cursor += 1;
      return c;
    }
  };
}

/** 配信ごとの createSupporterFeed() を持つ台帳(begin/end で今回出なかった配信を捨てる)。 */
export function createSupporterFeedRegistry() {
  /** @type {Map<string, ReturnType<typeof createSupporterFeed>>} */ const feeds = new Map();
  /** @type {Set<string>|null} */ let touched = null;
  return {
    begin() { touched = new Set(); },
    /** @param {string} liveId */
    feedFor(liveId) {
      const id = String(liveId || '');
      if (touched) touched.add(id);
      let f = feeds.get(id);
      if (!f) { f = createSupporterFeed(); feeds.set(id, f); }
      return f;
    },
    end() {
      if (touched) for (const k of Array.from(feeds.keys())) if (!touched.has(k)) feeds.delete(k);
      touched = null;
    },
    size() { return feeds.size; }
  };
}

/** 配信ごとの track を持つ台帳。tracker(createRowChangeTracker)と同じ begin/end の流儀で、今回出なかった配信を捨てる。 */
export function createMotionRegistry() {
  /** @type {Map<string, ReturnType<typeof createMotionTrack>>} */ const tracks = new Map();
  /** @type {Set<string>|null} */ let touched = null;
  return {
    begin() { touched = new Set(); },
    /** @param {string} liveId */
    trackFor(liveId) {
      const id = String(liveId || '');
      if (touched) touched.add(id);
      let t = tracks.get(id);
      if (!t) { t = createMotionTrack(); tracks.set(id, t); }
      return t;
    },
    end() {
      if (touched) for (const k of Array.from(tracks.keys())) if (!touched.has(k)) tracks.delete(k);
      touched = null;
    },
    size() { return tracks.size; }
  };
}
