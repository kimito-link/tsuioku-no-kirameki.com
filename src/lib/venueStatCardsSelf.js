/**
 * 会場が自分で作る「数字カードの写し」(2026-11-10 りんく「POPをひらかなくても数字がつくようにしてほしい」)。
 *
 * 会場の数字の帯(venueStatStrip.js)は、横の欄(パネル)が書く数字カードの鏡を出している。
 * パネルを一度も開いていない/閉じているあいだは鏡が書かれず、帯は「—」のままだった。
 * ここでは、パネルが使うのと【同じ材料・同じ部品】で会場が自分で同じ形の写しを作る:
 *   - 材料 = 視聴ページのスナップショット(パネルが NLS_EXPORT_WATCH_SNAPSHOT で受け取るものと同じ)
 *   - 部品 = buildWatchMetaCardAudienceViewModel(同接・来場者数)+ buildStatCardsMirrorSnapshot(公式チップ)
 *   =数え方を似せて自作しない。パネルが開いていて新しい鏡があるあいだは、帯は鏡を使う(こちらは動かない)。
 *
 * ★パネルとの違い(パネルが閉じているあいだだけ・実コードで確認):
 *   - 同接の自動補正(パネルが持つ較正)は使わない=既定の係数。公式の直接値が取れる配信では差は出ない。
 *   - 公式チップは視聴ページのスナップショットの値(パネルは公式 DOM の束があればそちらを優先)。
 * ★重くしない: 15秒に1回まで・新しい鏡があるあいだは何もしない・新しいタイマーは作らない(会場の既存の見回りから tick)。
 * ★storage には書かない(パネルの鏡と書き手を取り合わない)。会場の中だけで使う。
 *
 * chrome 依存は requestWatchSnapshotViaTabs だけ(引数で受ける)。
 *
 * @module venueStatCardsSelf
 */
import { buildWatchMetaCardAudienceViewModel } from './buildWatchMetaCardAudienceViewModel.js';
import { buildStatCardsMirrorSnapshot } from './statCardsMirror.js';
import { ageMsOf } from './timeAuthority.js';

/** 自分で作り直す間隔[ms]。同接・経過は分単位でしか変わらないので 15秒で足りる。 */
export const VENUE_STAT_SELF_INTERVAL_MS = 15_000;

/**
 * @typedef {{ snapshot?: any, recordedCount?: number|null }} VenueStatCardsSource
 *   snapshot: 視聴ページのスナップショット。snapshot.noVisitorTotal===true なら延べの来場者数が無いサービス(YouTube 等)。
 *     snapshot.recordedCountHint があれば記録件数に使う(YouTube 等は panel_summary が無い)
 *   recordedCount: 記録件数(分かるときだけ)
 */

/**
 * 視聴ページのスナップショットから、数字カードの鏡と同じ形の写しを作る純関数。
 * @param {VenueStatCardsSource|null|undefined} source
 * @param {{ liveId?: string, nowMs?: number }} [opts] liveId: 会場の配信。スナップショットが別の配信なら null
 * @returns {import('./statCardsMirror.js').StatCardsMirrorSnapshot|null}
 */
export function buildStatCardsFromWatchSnapshot(source, opts = {}) {
  const snapshot = source && typeof source === 'object' ? source.snapshot : null;
  if (!snapshot || typeof snapshot !== 'object') return null;
  const snapLive = String(snapshot.liveId || '').trim().toLowerCase();
  const want = String(opts.liveId || '').trim().toLowerCase();
  if (!snapLive || (want && snapLive !== want)) return null;
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();

  const vm = buildWatchMetaCardAudienceViewModel(snapshot, {
    nowMs,
    prevForReactions: { viewerCount: null, concurrentEstimated: null }
  });
  // 記録件数: 呼び出し元が渡した数 → スナップショットに付いた数(YouTube 等のまとめの件数)の順。
  const rc = source?.recordedCount != null ? source.recordedCount : snapshot.recordedCountHint;
  const recordsText =
    typeof rc === 'number' && Number.isFinite(rc) && rc >= 0 ? Math.floor(rc).toLocaleString('ja-JP') : '';
  const snap = buildStatCardsMirrorSnapshot(
    {
      liveId: snapLive,
      recordsText,
      recordsIsPlaceholder: !recordsText,
      concurrent: {
        estText: vm.concurrent.estText,
        estIsPlaceholder: vm.concurrent.estIsPlaceholder,
        subText: vm.concurrent.subText
      },
      visitor: { text: vm.visitor.text, isPlaceholder: vm.visitor.isPlaceholder },
      snapshotForOfficial: snapshot
    },
    { nowMs }
  );
  // 延べの来場者数が無いサービスでは、同接の数を「来場」として出さない(ytNicoShim が鏡の書き込みで直しているのと同じ)。
  if (snapshot.noVisitorTotal === true && snap.official) {
    snap.official = { ...snap.official, viewers: { text: '—', isPlaceholder: true } };
  }
  return snap;
}

/** 鏡が「動いている」とみなす書き込みの間隔。動いているパネルは数秒ごとに値が変わって書き直す。 */
export const VENUE_STAT_MIRROR_LIVE_GAP_MS = 25_000;

/**
 * パネルが本当に動いているかを、鏡の書き込みの間隔で見る(状態はここに閉じ込める)。
 * 鏡は「値が変わったときだけ」書かれる。隠れた欄は開いた瞬間に1回書いたきりで止まるので、
 * capturedAt の新しさだけでは「動いている」と区別できない(2026-11-10 PC 実測・ニコ生)。
 * 続けて2回、間隔 gapMs 以内で書かれ、最後の書き込みも gapMs 以内なら動いている。
 * @param {{ gapMs?: number }} [opts]
 * @returns {{ observe: (snap: any) => void, isLive: (nowMs: number, liveId: string) => boolean }}
 */
export function createStatMirrorLiveness(opts = {}) {
  const gapMs = Number(opts.gapMs) > 0 ? Number(opts.gapMs) : VENUE_STAT_MIRROR_LIVE_GAP_MS;
  let lid = '';
  let prevAt = 0;
  let lastAt = 0;
  return {
    observe(snap) {
      const at = Number(snap && typeof snap === 'object' ? snap.capturedAt : NaN);
      const id = String((snap && typeof snap === 'object' && snap.liveId) || '').trim().toLowerCase();
      if (!Number.isFinite(at) || at <= 0 || !id) return;
      if (id !== lid) {
        lid = id;
        prevAt = 0;
        lastAt = at;
        return;
      }
      if (at === lastAt) return;
      prevAt = lastAt;
      lastAt = at;
    },
    isLive(nowMs, liveId) {
      if (!lid || String(liveId || '').trim().toLowerCase() !== lid || !prevAt) return false;
      const sinceLast = ageMsOf(lastAt, nowMs);
      return lastAt - prevAt <= gapMs && sinceLast != null && sinceLast <= gapMs;
    }
  };
}

/**
 * 15秒に1回まで、材料を取りに行って写しを作る(状態はここに閉じ込める)。
 * @param {{
 *   fetchSource: () => (VenueStatCardsSource|null|undefined|Promise<VenueStatCardsSource|null|undefined>),
 *   onSnap: (snap: import('./statCardsMirror.js').StatCardsMirrorSnapshot) => void,
 *   intervalMs?: number
 * }} deps
 * @returns {{ tick: (nowMs: number, ctx: { liveId: string, mirrorFresh: boolean, recordedCount?: number|null }) => boolean,
 *   diag: () => { runs: number, built: number, failed: number, lastAt: number } }}
 *   tick は取りに行ったら true(間隔内・鏡が新しい・取得中は false)
 */
export function createVenueStatSelfPoller(deps) {
  const intervalMs = Number(deps?.intervalMs) > 0 ? Number(deps.intervalMs) : VENUE_STAT_SELF_INTERVAL_MS;
  let lastAt = 0;
  let inflight = false;
  const d = { runs: 0, built: 0, failed: 0, lastAt: 0 };
  return {
    tick(nowMs, ctx) {
      if (inflight || !ctx || !ctx.liveId || ctx.mirrorFresh) return false;
      if (lastAt && nowMs - lastAt < intervalMs) return false;
      lastAt = nowMs;
      inflight = true;
      d.runs += 1;
      d.lastAt = nowMs;
      Promise.resolve()
        .then(() => deps.fetchSource())
        .then((source) => {
          if (!source || typeof source !== 'object') return;
          const recordedCount = source.recordedCount != null ? source.recordedCount : ctx.recordedCount;
          const snap = buildStatCardsFromWatchSnapshot({ snapshot: source.snapshot, recordedCount }, { liveId: ctx.liveId, nowMs: Date.now() });
          if (snap) {
            d.built += 1;
            deps.onSnap(snap);
          }
        })
        .catch(() => {
          d.failed += 1; // 取れなくても会場は止めない(帯は「—」か前の値のまま)
        })
        .then(() => {
          inflight = false;
        });
      return true;
    },
    diag: () => ({ ...d })
  };
}

/**
 * 別窓の会場(venue.html)用: 視聴ページのタブを探して、パネルと同じ問い合わせでスナップショットをもらう。
 * @param {any} chromeLike chrome(tabs.query / tabs.sendMessage)
 * @param {string} liveId
 * @returns {Promise<VenueStatCardsSource|null>}
 */
export async function requestWatchSnapshotViaTabs(chromeLike, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  const tabsApi = chromeLike && chromeLike.tabs;
  if (!lid || !tabsApi || typeof tabsApi.query !== 'function' || typeof tabsApi.sendMessage !== 'function') return null;
  const tabs = await tabsApi.query({});
  const hit = (Array.isArray(tabs) ? tabs : []).filter(
    (t) => t && typeof t.id === 'number' && String(t.url || '').toLowerCase().includes(`/watch/${lid}`)
  );
  for (const t of hit) {
    try {
      const res = await tabsApi.sendMessage(t.id, { type: 'NLS_EXPORT_WATCH_SNAPSHOT' }, { frameId: 0 });
      if (res && res.ok && res.snapshot) return { snapshot: res.snapshot };
    } catch {
      /* 次のタブ */
    }
  }
  return null;
}
