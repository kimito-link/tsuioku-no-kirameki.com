/**
 * 応援レーンの鏡(nls_lane_mirror_v1 / nls_lane_mirror_v2_<lv>)を書く間隔を、人数に合わせて決める(v0.1.1973)。
 *
 * ★経緯(PC 実測 0.1.1972・Kick 約1万2千行): 横の欄は新しい人が来るたびに(顔ぶれが変わるたびに)鏡を即書きしていた。
 *   90秒に v2 を59回(1回 約370KB)+v1 を25回(合計 約31MB)。chrome.storage.onChanged は新旧の値を拡張の全ページ
 *   (外枠と iframe の両方・会場・コメビュ)へ配るので、横の欄だけで90秒に約73MB を受け取っていた。
 *   7.5万行では横の欄が開いた直後から34分固まり、時間の94%が JS の外(受け渡しの変換)だった。
 *   → 人が少ない配信(ニコ生の普段の規模)は今までどおり即書く。人数が多いほど、鏡を書く最短間隔を延ばす。
 *     配信が替わったときは待たない(会場が前の配信の鏡を握らないように)。最後の状態は必ず後から書く(取りこぼさない)。
 */

/** これ以下の人数は今までどおり(間隔0=毎回書く) */
export const LANE_MIRROR_PACE_FREE_PEOPLE = 500;
/** 1人増えるごとに延ばす間隔(ms) */
export const LANE_MIRROR_PACE_MS_PER_PERSON = 5;
/** 最長の間隔 */
export const LANE_MIRROR_PACE_MAX_MS = 30000;

/**
 * @param {number} people 鏡に載る候補の人数(totalCandidates)
 * @returns {number} 鏡を書く最短間隔(ms)
 */
export function laneMirrorPublishGapMs(people) {
  const n = Number(people);
  if (!Number.isFinite(n) || n <= LANE_MIRROR_PACE_FREE_PEOPLE) return 0;
  return Math.min(LANE_MIRROR_PACE_MAX_MS, Math.round((n - LANE_MIRROR_PACE_FREE_PEOPLE) * LANE_MIRROR_PACE_MS_PER_PERSON));
}

/**
 * いま書くか、あとで(最後の状態を)書くか。
 * @param {{ liveId: string, people: number, now: number, lastLiveId: string, lastAt: number }} s
 * @returns {{ action: 'now' | 'later', waitMs: number }}
 */
export function laneMirrorPublishDecision(s) {
  const lid = String(s?.liveId || '');
  const now = Number(s?.now) || 0;
  const lastAt = Number(s?.lastAt) || 0;
  if (!lastAt || lid !== String(s?.lastLiveId || '') || now < lastAt) return { action: 'now', waitMs: 0 };
  const gap = laneMirrorPublishGapMs(s?.people);
  const since = now - lastAt;
  if (since >= gap) return { action: 'now', waitMs: 0 };
  return { action: 'later', waitMs: gap - since };
}

/**
 * 鏡の書き込みの間隔係(状態つき)。popup は publish の入口で gate() を呼び、false なら書かずに戻る。
 *   待たされた分は最後の1つだけ、間隔が空いたら onFlush(input) で書かせる(そのときは gate を素通り)。
 * @param {{ onFlush: (input: any) => void, now?: () => number, setTimer?: (fn: () => void, ms: number) => any, clearTimer?: (t: any) => void }} deps
 */
export function createLaneMirrorPacer(deps) {
  const now = deps.now || (() => Date.now());
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer || ((t) => clearTimeout(t));
  let lastAt = 0;
  let lastLiveId = '';
  /** @type {any} */
  let pending = null;
  /** @type {any} */
  let timer = null;
  let bypass = false;
  const diag = { now: 0, deferred: 0, flushedLater: 0, lastGapMs: 0 };
  const flush = () => {
    timer = null;
    const p = pending;
    pending = null;
    if (!p) return;
    diag.flushedLater += 1;
    bypass = true;
    try {
      deps.onFlush(p);
    } finally {
      bypass = false;
    }
  };
  return {
    diag,
    /**
     * @param {{ liveId?: string, totalCandidates?: number }} input
     * @returns {boolean} true = いま書く
     */
    gate(input) {
      const t = now();
      const lid = String(input?.liveId || '');
      if (!bypass) {
        const d = laneMirrorPublishDecision({ liveId: lid, people: Number(input?.totalCandidates) || 0, now: t, lastLiveId, lastAt });
        if (d.action === 'later') {
          pending = input;
          diag.deferred += 1;
          diag.lastGapMs = laneMirrorPublishGapMs(Number(input?.totalCandidates) || 0);
          if (!timer) timer = setTimer(flush, d.waitMs);
          return false;
        }
        diag.now += 1;
      }
      pending = null;
      if (timer) {
        clearTimer(timer);
        timer = null;
      }
      lastAt = t;
      lastLiveId = lid;
      return true;
    }
  };
}
