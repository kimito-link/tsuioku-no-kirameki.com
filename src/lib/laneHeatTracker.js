/**
 * 応援レーンの「熱い人」: 直近 60 秒にコメント件数が増えた人を見つける(純関数的な器・乱数もタイマーも無い)。
 *
 * ■ 規則
 *   ・初回観測(その人を初めて見た時)はベースライン=光らせない。/live/ の「増えた行だけ光る」と同じ規律。
 *   ・減少は無視(基準だけ更新)。外部値は減ることがある(AGENTS §3.6)。
 *   ・窓(windowMs)を過ぎた増分は、次の observe で自然に失効する(タイマーを持たない)。
 *   ・観測の間隔が rebaseGapMs(既定=窓の3倍=180秒)を超えた(長い裏タブ・停止からの復帰)ときと liveId が
 *     変わったときは基準を取り直す。溜まった増分を「いま増えた」と見せて一斉にバーストさせない。
 *     ★v0.1.1574: 取り直しの閾値を窓(60秒)そのものにしていた旧版は、裏タブの setTimeout が約1分に1回へ
 *       クランプされる(実測の配達平均 47,686ms でゆらぐ)環境で観測が60秒を超えるたびに全リセットされ、
 *       会場を開いた裏タブでは「熱い人」が原理的に出なかった。窓=増分を表示し続ける長さ、
 *       rebaseGapMs=その増分を「直近」とみなせる観測間隔の上限、と役割を分けた。
 *       (窓超えで events だけ空にして prev を更新する案は、全リセットと同じ出力になるため効かない)
 *   ・rows から消えた人は窓を過ぎたら忘れる。1人あたりのイベント数には上限を置く。
 */
import { tierForCommentDelta } from './commentDeltaTier.js';

export const LANE_HEAT_WINDOW_MS = 60_000;

/**
 * @param {{ windowMs?: number, maxEventsPerUid?: number, rebaseGapMs?: number }} [opts]
 */
export function createLaneHeatTracker(opts = {}) {
  const windowMs = Number(opts.windowMs) > 0 ? Number(opts.windowMs) : LANE_HEAT_WINDOW_MS;
  const maxEvents = Number(opts.maxEventsPerUid) > 0 ? Math.floor(Number(opts.maxEventsPerUid)) : 8;
  const rebaseGapMs = Number(opts.rebaseGapMs) > 0 ? Number(opts.rebaseGapMs) : windowMs * 3;
  let liveId = '';
  let lastAt = 0;
  /** @type {Map<string, { prev: number, events: Array<{ at: number, d: number }>, seenAt: number }>} */
  let users = new Map();

  return {
    /**
     * @param {string} lid
     * @param {ReadonlyArray<{ uid: string, commentCount: number }>|null|undefined} rows
     * @param {number} nowMs
     * @returns {Map<string, { heat: number, tier: 'small'|'medium'|'large'|'mega', lastAt: number }>} heat>0 のみ
     */
    observe(lid, rows, nowMs) {
      const id = String(lid || '');
      const now = Number(nowMs) || 0;
      if (id !== liveId || (lastAt && (now < lastAt || now - lastAt > rebaseGapMs))) users = new Map();
      liveId = id;
      lastAt = now;

      const seen = new Set();
      for (const r of Array.isArray(rows) ? rows : []) {
        const uid = r && typeof r.uid === 'string' ? r.uid.trim() : '';
        const n = Number(r && r.commentCount);
        if (!uid || !Number.isFinite(n)) continue;
        const c = Math.max(0, Math.floor(n));
        seen.add(uid);
        const u = users.get(uid);
        if (!u) {
          users.set(uid, { prev: c, events: [], seenAt: now });
          continue;
        }
        if (c > u.prev) {
          u.events.push({ at: now, d: c - u.prev });
          if (u.events.length > maxEvents) u.events.splice(0, u.events.length - maxEvents);
        }
        u.prev = c;
        u.seenAt = now;
      }

      /** @type {Map<string, { heat: number, tier: 'small'|'medium'|'large'|'mega', lastAt: number }>} */
      const out = new Map();
      for (const [uid, u] of Array.from(users)) {
        if (!seen.has(uid) && now - u.seenAt >= windowMs) {
          users.delete(uid);
          continue;
        }
        u.events = u.events.filter((e) => now - e.at < windowMs);
        let heat = 0;
        let at = 0;
        for (const e of u.events) {
          heat += e.d;
          at = Math.max(at, e.at);
        }
        if (heat > 0) out.set(uid, { heat, tier: tierForCommentDelta(heat), lastAt: at });
      }
      return out;
    }
  };
}
