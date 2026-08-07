/**
 * venueEntryQueue — 会場「入場演出」の差分検出と間引き（純ロジック・DOM を触らない）。
 *
 * 【何のための部品か】
 *   サイドパネル(①POP)に出ている人が会場の席へ「飛んでいく」演出のために、
 *   《今回はじめて現れた人》だけを取り出し、大配信でも壊れない量に間引く。
 *
 * 【入力の出どころ】
 *   - keys: venueBar.js の seatByKey(venueBar.js:3871) が持つ席 key の集合。
 *   - liveId: 会場が描いている配信ID。切替検出にのみ使う。
 *
 * 【出力の使われ方】
 *   - fly:   この tick で「飛ばす」key。venueBar が gift-fly 流用のアニメを起こす。
 *   - seat:  演出せず直接着席させる key（間引かれた人・初回の人）。
 *   ★fly と seat を足すと必ず新規全員になる = 【演出の間引きで人を消さない】。
 *     v0.1.1232「上限こそが消失の実行者」の教訓により、上限は演出にだけ掛ける。
 *
 * 【担う責務】
 *   - 前回集合との差分（新規のみ抽出）
 *   - 初回サプレス（会場を開いた瞬間に全員飛ぶ事故を防ぐ）
 *   - liveId 切替での全リセット（別配信の人を「新規」と誤認しない）
 *   - 同時数/レート/キューの上限適用
 *
 * 【担わない責務】
 *   - DOM・CSS・アニメーション（venueBar.js 側）
 *   - アイコンの解決（正本: resolveStoryLaneAvatarSrc）
 *   - 席の並び順・段割当（正本: venueLaneBuckets / venueSeats）
 *
 * 設計正本: docs/handoff/venue-transport-effect-SPEC-2026-08-08.md
 */

/** 同時に飛ばす最大数（これ以上は視覚的に区別できない）。 */
export const VENUE_ENTRY_MAX_CONCURRENT = 6;
/** 1秒あたりの発火上限。 */
export const VENUE_ENTRY_MAX_PER_SEC = 8;
/** キュー上限。溢れたら演出せず直接着席させる（落とさない）。 */
export const VENUE_ENTRY_QUEUE_LIMIT = 24;
/** 1回の飛行時間(ms)。gift(1500ms)より速く＝入場は軽く見せる。 */
export const VENUE_ENTRY_FLIGHT_MS = 900;

/**
 * @typedef {{
 *   fly: string[],
 *   seat: string[],
 *   suppressedReason: ''|'first_paint'|'live_changed'
 * }} VenueEntryTickResult
 */

/**
 * @param {() => number} [nowFn]
 * @returns {{
 *   tick: (input: { keys: readonly string[], liveId: string, nowMs?: number }) => VenueEntryTickResult,
 *   onFlightDone: (key: string) => void,
 *   stats: () => { known: number, inFlight: number, queued: number, liveId: string }
 * }}
 */
export function createVenueEntryQueue(nowFn = Date.now) {
  /** 既に会場に居ると分かっている key。 */
  let known = new Set();
  /** いま飛行中の key。 */
  let inFlight = new Set();
  /** 飛ぶ順番待ち。 */
  /** @type {string[]} */
  let queue = [];
  /** 直近1秒の発火時刻。 */
  /** @type {number[]} */
  let recentFires = [];
  let currentLiveId = '';
  let sawFirstPaint = false;

  /** @param {readonly unknown[] | null | undefined} keys @returns {string[]} */
  const normalizeKeys = (keys) => {
    /** @type {string[]} */
    const out = [];
    /** @type {Set<string>} */
    const seen = new Set();
    if (!Array.isArray(keys)) return out;
    for (const raw of keys) {
      const k = String(raw || '').trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    return out;
  };

  /** @param {string} lid */
  const resetAll = (lid) => {
    known = new Set();
    inFlight = new Set();
    queue = [];
    recentFires = [];
    currentLiveId = lid;
    sawFirstPaint = false;
  };

  return {
    tick({ keys, liveId, nowMs }) {
      const now = Number.isFinite(nowMs) ? Number(nowMs) : nowFn();
      const lid = String(liveId || '').trim().toLowerCase();
      const list = normalizeKeys(keys);

      // 規則1: 配信が変わったら全部忘れる（前配信の人を「新規」にしない）。
      // ★「初回」と「配信切替」は【どちらも飛ばさない】が理由が違うので区別して返す。
      //   起動直後は currentLiveId==='' なので素朴に書くと切替判定が初回を飲み込む
      //   （テストがこれを捕まえた）。初回判定を先に見る。
      const isFirst = !sawFirstPaint;
      const isLiveChanged = !isFirst && lid !== currentLiveId;
      if (isFirst || isLiveChanged) {
        resetAll(lid);
        known = new Set(list);
        sawFirstPaint = true;
        return {
          fly: [],
          seat: list.slice(),
          suppressedReason: isFirst ? 'first_paint' : 'live_changed'
        };
      }

      // 規則2: 新規＝今回あって前回無かった人。
      const fresh = list.filter((k) => !known.has(k));
      for (const k of list) known.add(k);
      // 居なくなった人は known から外す（再入場でまた飛べるように）。
      // ★キュー待ちの人は known から外さない。外すと次tickで「また新規」になり
      //   二重にキューへ積まれる。
      const alive = new Set(list);
      const queued = new Set(queue);
      for (const k of Array.from(known)) {
        if (!alive.has(k) && !inFlight.has(k) && !queued.has(k)) known.delete(k);
      }

      /** @type {string[]} */
      const seat = [];
      for (const k of fresh) {
        if (queue.length >= VENUE_ENTRY_QUEUE_LIMIT) seat.push(k); // 溢れは直接着席
        else queue.push(k);
      }
      // ★新規が居なくてもキューが残っていれば流す。
      //   ここで早期 return すると「枠が空いたのに誰も飛ばない」で詰まる
      //   （テストがこれを捕まえた）。
      if (!fresh.length && !queue.length) {
        return { fly: [], seat: [], suppressedReason: '' };
      }

      // レート制限: 直近1秒の発火数を数える。
      recentFires = recentFires.filter((t) => now - t < 1000);
      /** @type {string[]} */
      const fly = [];
      while (
        queue.length &&
        inFlight.size < VENUE_ENTRY_MAX_CONCURRENT &&
        recentFires.length < VENUE_ENTRY_MAX_PER_SEC
      ) {
        const k = queue.shift();
        if (!k) break;
        inFlight.add(k);
        recentFires.push(now);
        fly.push(k);
      }

      return { fly, seat, suppressedReason: '' };
    },

    onFlightDone(key) {
      const k = String(key || '').trim();
      if (k) inFlight.delete(k);
    },

    stats() {
      return {
        known: known.size,
        inFlight: inFlight.size,
        queued: queue.length,
        liveId: currentLiveId
      };
    }
  };
}
