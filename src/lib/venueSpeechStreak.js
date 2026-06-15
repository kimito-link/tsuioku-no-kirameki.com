/**
 * venueSpeechStreak.js
 *
 * 「会話の連鎖」(2026-06-15 会議の最大多数決の本命・弱点A/C):
 *   同じ人が短い間隔で連続発言したら、それを「孤立した1発言」でなく「続いている会話/
 *   盛り上げ」として見せるための連続発言(ストリーク)判定。純関数=テスト可能。
 *
 * 設計根拠: reference_venue_copresence_meeting_2026-06-15。会議でクラウド3体が
 *   「発言チェーン/会話の軌跡」を揃って第1位に。世界事例=ニコニコ danmaku の擬似同期・
 *   social translucence(visibility)。これを「連続で喋る人の席が継続的に輝く=溜まっていく感」
 *   として最小リスクで実装する(吹き出しをベジェ連結する案は乱雑になりやすいので採らない)。
 *
 * このファイルは状態遷移のロジックだけ(DOM/時間取得は外から渡す)。
 */

/** 連続とみなす最大間隔(ms)。これより空いたらストリークはリセット。 */
export const STREAK_GAP_MS = 6000;
/** ストリークの強さの上限(席のグロー段階の頭打ち)。 */
export const STREAK_MAX = 5;

/**
 * 発言者ごとの連続発言(ストリーク)状態を更新する。
 *
 * @param {Map<string, { count: number, lastAt: number }>} state 発言者キー→{連続数,最終発言時刻}。破壊的に更新する。
 * @param {string} speakerKey 発言者の席キー(venueSpeakerKey)
 * @param {number} nowMs 現在時刻(ms)
 * @param {{ gapMs?: number, max?: number }} [opts] gapMs=連続とみなす間隔 / max=段階上限
 * @returns {{ count: number, isContinuation: boolean }}
 *   count=この発言時点での連続数(1始まり) / isContinuation=直前から続いている連続発言か
 */
export function updateSpeechStreak(state, speakerKey, nowMs, opts = {}) {
  const key = String(speakerKey || '').trim();
  if (!key || !(state instanceof Map)) return { count: 1, isContinuation: false };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const gap = Number.isFinite(Number(opts.gapMs)) && opts.gapMs > 0 ? Number(opts.gapMs) : STREAK_GAP_MS;
  const max = Number.isFinite(Number(opts.max)) && opts.max > 0 ? Math.floor(opts.max) : STREAK_MAX;

  const prev = state.get(key);
  let count;
  let isContinuation;
  if (prev && now - prev.lastAt <= gap) {
    count = Math.min(max, prev.count + 1);
    isContinuation = true;
  } else {
    count = 1;
    isContinuation = false;
  }
  state.set(key, { count, lastAt: now });
  return { count, isContinuation };
}

/**
 * 古くなったストリーク(最後の発言から十分経った人)を state から掃除する。
 * Map が無限に増えないように renderSeats/poll の折に呼ぶ。
 *
 * @param {Map<string, { count: number, lastAt: number }>} state
 * @param {number} nowMs
 * @param {number} [ttlMs] これを超えて発言の無い人は削除(既定=STREAK_GAP_MS の3倍)
 * @returns {number} 削除した件数
 */
export function pruneSpeechStreaks(state, nowMs, ttlMs = STREAK_GAP_MS * 3) {
  if (!(state instanceof Map)) return 0;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const ttl = Number.isFinite(Number(ttlMs)) && ttlMs > 0 ? Number(ttlMs) : STREAK_GAP_MS * 3;
  let removed = 0;
  for (const [key, v] of state) {
    if (now - v.lastAt > ttl) {
      state.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/**
 * ストリーク数を「席のグロー段階」(0..STREAK_MAX-1)へ。1回目(count=1)は段階0=平常。
 * count が増えるほど段階が上がり、席の輝きが強くなる(溜まっていく感の視覚化)。
 *
 * @param {number} count updateSpeechStreak の count
 * @returns {number} 0..(STREAK_MAX-1)
 */
export function streakGlowStage(count) {
  const c = Math.floor(Number(count) || 0);
  if (c <= 1) return 0;
  return Math.min(STREAK_MAX - 1, c - 1);
}

/**
 * 連続発言中の吹き出しの寿命(ms)。連続するほど少し長く残し、会話が途切れない印象に。
 * 単発(count<=1)は基準のまま。
 *
 * @param {number} count
 * @param {number} baseMs 基準寿命(BUBBLE_LIFETIME_MS)
 * @returns {number}
 */
export function streakBubbleLifetimeMs(count, baseMs) {
  const base = Number.isFinite(Number(baseMs)) && baseMs > 0 ? Number(baseMs) : 4000;
  const c = Math.floor(Number(count) || 0);
  if (c <= 1) return base;
  // 連続1回ごとに +500ms、ただし base*2 で頭打ち(出っぱなしを防ぐ)。
  return Math.min(base * 2, base + (c - 1) * 500);
}
