import { isHttpOrHttpsUrl, pickStrongestAvatarUrlForUser } from './supportGrowthTileSrc.js';
import { pickStrongerUserId } from './userIdPreference.js';

/**
 * @typedef {{ no?: string, uid?: string, name?: string, av?: string }} InterceptItem
 */

/**
 * @param {unknown[]} entries
 * @param {InterceptItem[]} items
 * @returns {{ next: unknown[], patched: number }}
 */
export function mergeStoredCommentsWithIntercept(entries, items) {
  if (!Array.isArray(entries) || !entries.length || !Array.isArray(items) || !items.length) {
    return { next: Array.isArray(entries) ? entries : [], patched: 0 };
  }

  /** @type {Map<string, { uid: string, name: string, av: string }>} */
  const byNo = new Map();
  for (const raw of items) {
    const no = String(raw?.no || '').trim();
    if (!no) continue;
    const prev = byNo.get(no) || { uid: '', name: '', av: '' };
    const uid = String(raw?.uid || '').trim() || prev.uid;
    const name = String(raw?.name || '').trim() || prev.name;
    const avRaw = String(raw?.av || '').trim();
    const av = (isHttpOrHttpsUrl(avRaw) ? avRaw : '') || prev.av;
    if (!uid && !name && !av) continue;
    byNo.set(no, { uid, name, av });
  }
  if (!byNo.size) return { next: entries, patched: 0 };

  let patched = 0;
  const next = entries.map((e) => {
    const no = String(/** @type {{ commentNo?: unknown }} */ (e)?.commentNo || '').trim();
    if (!no) return e;
    const hit = byNo.get(no);
    if (!hit) return e;

    const curUid = String(/** @type {{ userId?: unknown }} */ (e)?.userId || '').trim();
    const curNick = String(/** @type {{ nickname?: unknown }} */ (e)?.nickname || '').trim();
    const curAv = String(/** @type {{ avatarUrl?: unknown }} */ (e)?.avatarUrl || '').trim();

    const out = /** @type {Record<string, unknown>} */ ({ .../** @type {object} */ (e) });
    let changed = false;

    if (hit.uid) {
      const chosen = pickStrongerUserId(curUid, hit.uid);
      if (chosen !== curUid) {
        out.userId = chosen || null;
        changed = true;
      }
    }
    const curNickWeak = curNick === '匿名' || curNick === '（未取得）' || curNick === '(未取得)';
    if (hit.name && (!curNick || curNickWeak || hit.name.length > curNick.length)) {
      out.nickname = hit.name;
      changed = true;
    }

    const uidForAv = String(out.userId || '').trim();
    const pickedAv = pickStrongestAvatarUrlForUser(uidForAv, [hit.av, curAv]);
    if (pickedAv && pickedAv !== curAv) {
      out.avatarUrl = pickedAv;
      changed = true;
    }
    if (hit.av && out.avatarObserved !== true) {
      out.avatarObserved = true;
      changed = true;
    }

    if (changed) {
      patched += 1;
      return out;
    }
    return e;
  });
  return { next, patched };
}
