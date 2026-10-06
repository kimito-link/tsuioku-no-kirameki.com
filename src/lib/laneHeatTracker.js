/**
 * 応援レーンの「熱い人」: 直近 60 秒にコメント件数が増えた人を見つける(純関数的な器・乱数もタイマーも無い)。
 *
 * ■ 規則
 *   ・初回観測(その人を初めて見た時)はベースライン=光らせない。/live/ の「増えた行だけ光る」と同じ規律。
 *   ・減少は無視(基準だけ更新)。外部値は減ることがある(AGENTS §3.6)。
 *   ・窓(windowMs)を過ぎた増分は、次の observe で自然に失効する(タイマーを持たない)。
 *   ・観測の間隔が窓を超えた(裏タブ・停止からの復帰)ときと liveId が変わったときは基準を取り直す。
 *     溜まった増分を「いま増えた」と見せて一斉にバーストさせない。
 *   ・rows から消えた人は窓を過ぎたら忘れる。1人あたりのイベント数には上限を置く。
 */
import { tierForCommentDelta } from './commentDeltaTier.js';

export const LANE_HEAT_WINDOW_MS = 60_000;

/**
 * @param {{ windowMs?: number, maxEventsPerUid?: number }} [opts]
 */
export function createLaneHeatTracker(opts = {}) {
  const windowMs = Number(opts.windowMs) > 0 ? Number(opts.windowMs) : LANE_HEAT_WINDOW_MS;
  const maxEvents = Number(opts.maxEventsPerUid) > 0 ? Math.floor(Number(opts.maxEventsPerUid)) : 8;
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
      if (id !== liveId || (lastAt && (now < lastAt || now - lastAt > windowMs))) users = new Map();
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
