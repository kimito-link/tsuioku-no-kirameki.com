/**
 * v0.1.442: 過去ログバックフィルの一過性 stop 自動リトライの遅延計算（純関数）。
 *
 * 設計（世界標準: AWS SDK / TanStack Query / Polly / Resilience4j 準拠）:
 *   指数バックオフ + Full Jitter。試行回数に応じて待機時間を指数的に増やし、
 *   その範囲内でランダム化する（thundering herd 回避＝NDGR サーバーへの同時殺到を防ぐ）。
 *
 *   旧 v0.1.431〜441: 全 attempt で固定 20000ms。中庸だが「1 回目の再挑戦も 20 秒待ち」が
 *   重い・最大 5 回で諦めるのが早い・複数ユーザーが同時刻に同期して NDGR を叩く（同期化負荷）。
 *
 *   新 v0.1.442 既定（attempt=0 から開始）:
 *     attempt=0: 0〜1000ms (期待値 ~0.5秒)   ← 1回目: 「すぐもう一度試してくれた」
 *     attempt=1: 0〜2000ms (期待値 ~1秒)
 *     attempt=2: 0〜4000ms (期待値 ~2秒)
 *     attempt=3: 0〜8000ms (期待値 ~4秒)
 *     attempt=4: 0〜16000ms (期待値 ~8秒)
 *     attempt=5: 0〜32000ms (期待値 ~16秒)
 *     attempt=6: 0〜45000ms (cap, 期待値 ~22秒) ← 7回目: 「最後まで諦めない」
 *
 *   ユーザー体感: 早期 retry が即時化＝「すぐもう一度頑張ってくれた」感。
 *   サーバー負荷: Full Jitter で同時刻リクエストを時間軸に分散＝従来より瞬間ピーク減。
 *   信頼性: 5→7 回への拡張で取りこぼし削減（ユーザー要望「もう1回頑張って取る」を満たす）。
 *
 * 退避:
 *   この純関数を呼ばずに setTimeout 第二引数を固定 20000ms に 1 行戻すだけで v0.1.441
 *   までの挙動に完全復帰する。新関数自体は dead code として残せる。
 *
 * @module backfillRetryBackoff
 */

/** 既定の base 遅延（ms）。指数の出発点。世界標準: 1 秒。 */
export const DEFAULT_BACKFILL_RETRY_BASE_MS = 1000;

/** 既定の上限 cap（ms）。これ以上は伸びない。AWS SDK 推奨は 20〜30 秒だが、NDGR の混雑特性に合わせ 45 秒。 */
export const DEFAULT_BACKFILL_RETRY_CAP_MS = 45_000;

/** 既定の指数係数。世界標準: 2 倍。 */
export const DEFAULT_BACKFILL_RETRY_FACTOR = 2;

/**
 * 指数バックオフ + Full Jitter で次回リトライ遅延を返す。
 *
 *   delay = random(0, 1) × min(cap, base × factor^attempt)
 *
 * Full Jitter（AWS SDK 推奨の業界標準）の核心は「上限内で完全にランダム化」すること。
 * Equal Jitter（base + random）や Decorrelated Jitter とは異なり、最も負荷分散効果が高い。
 *
 * @param {number} attempt 0 から始まる試行回数（0 = 初回リトライ）。
 * @param {object} [opts]
 * @param {number} [opts.base=1000] 指数の base 遅延（ms）。
 * @param {number} [opts.cap=45000] 上限（ms）。指数値はこの値で頭打ち。
 * @param {number} [opts.factor=2] 指数係数。
 * @param {() => number} [opts.rng=Math.random] テスト用に差し替え可能な乱数源（[0,1)）。
 * @returns {number} 次回リトライまでの遅延（ms）。0 以上の有限数。
 */
export function calculateBackfillRetryDelayMs(attempt, opts) {
  const baseRaw = opts && typeof opts === 'object' ? opts.base : undefined;
  const capRaw = opts && typeof opts === 'object' ? opts.cap : undefined;
  const factorRaw = opts && typeof opts === 'object' ? opts.factor : undefined;
  const rng =
    opts && typeof opts === 'object' && typeof opts.rng === 'function'
      ? opts.rng
      : Math.random;

  // 数値以外/負数/Infinity を全て安全側に倒す（既定値で処理続行）。
  const a =
    typeof attempt === 'number' && Number.isFinite(attempt) && attempt >= 0
      ? Math.floor(attempt)
      : 0;
  const base =
    typeof baseRaw === 'number' && Number.isFinite(baseRaw) && baseRaw > 0
      ? baseRaw
      : DEFAULT_BACKFILL_RETRY_BASE_MS;
  const cap =
    typeof capRaw === 'number' && Number.isFinite(capRaw) && capRaw > 0
      ? capRaw
      : DEFAULT_BACKFILL_RETRY_CAP_MS;
  const factor =
    typeof factorRaw === 'number' && Number.isFinite(factorRaw) && factorRaw > 1
      ? factorRaw
      : DEFAULT_BACKFILL_RETRY_FACTOR;

  const exponential = Math.min(base * Math.pow(factor, a), cap);
  const r = rng();
  // 万一壊れた rng（NaN / 範囲外）でも安全に 0 倍で fallback（待たない）。
  const safeR = typeof r === 'number' && Number.isFinite(r) && r >= 0 && r < 1 ? r : 0;
  return safeR * exponential;
}
