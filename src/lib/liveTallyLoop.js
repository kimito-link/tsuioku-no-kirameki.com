/**
 * liveTallyLoop.js — コメント集計の「くり返しモード」(scripts/live-comment-tally.mjs --loop-seconds)の純ロジック。
 *
 * ★2026-11-21(りんくさん「これもユーザーがもとめるリアルタイム性だして」):
 *   集計を 1 run 1 回(実測 8〜17 分おき)から、1 run の中で約 60 秒ごとにくり返す形へ。
 *   ここには I/O を書かない(順番・合流・時間の判定だけ)。I/O は scripts/live-comment-tally.mjs。
 *
 * ★実測(2026-11-21 19:38/19:40 JST): 一覧 20 配信のうちコメント集計が付いていたのは 12 / 15 配信。
 *   集計の側は 20 配信とも成功していた(ok 20・ng 0)。付いていない配信は、集計が一覧を読んだ後の
 *   60 秒ごとの一覧更新で入ってきた配信(始まって間もない配信など)と見られる。
 *   ⟹ 「新しく一覧に入った配信を先に数える」「前に数えた結果を落とさない」で直す。
 *
 * @module liveTallyLoop
 */

/** @param {unknown} live @returns {string} 小文字の lv(読めなければ '') */
function lvOf(live) {
  return String((live && /** @type {any} */ (live).liveId) || '').trim().toLowerCase();
}

/**
 * まだ数えたことのない配信(前回の作業状態が無い=新しく一覧に入った配信)を先に、
 * それ以外は一覧の順のまま並べる。★元の配列は変えない。
 * @template T
 * @param {T[]} lives
 * @param {Record<string, unknown>|null|undefined} stateByLive lv 小文字キー
 * @returns {T[]}
 */
export function orderNewFirst(lives, stateByLive) {
  const st = stateByLive && typeof stateByLive === 'object' ? stateByLive : {};
  const list = Array.isArray(lives) ? lives : [];
  const fresh = [];
  const known = [];
  for (const l of list) {
    const id = lvOf(l);
    if (id && Object.prototype.hasOwnProperty.call(st, id) && st[id]) known.push(l);
    else fresh.push(l);
  }
  return [...fresh, ...known];
}

/**
 * 保存済みの一覧(GET /api/live-ranking の lives[] に合流済みの comment)から、表示用の集計を拾う。
 * ★くり返しの 1 回目で集計できなかった配信も、前回の結果を消さずに持ち越すため(「集計待ち」に戻さない)。
 * @param {unknown[]} lives
 * @returns {Record<string, object>} lv 小文字キー → comment
 */
export function seedDisplayFromLives(lives) {
  /** @type {Record<string, object>} */
  const out = {};
  for (const l of Array.isArray(lives) ? lives : []) {
    const id = lvOf(l);
    const c = l && /** @type {any} */ (l).comment;
    if (id && c && typeof c === 'object' && Array.isArray(c.rankers)) out[id] = c;
  }
  return out;
}

/**
 * 表示用の集計を合流する: 今回数えた配信は今回の値、数えられなかった配信は前の値。
 * ★いまの一覧に居ない配信は落とす(幽霊の行を作らない・保存も膨らませない)。
 * @param {Record<string, object>} prev lv 小文字キー
 * @param {Record<string, object>} pass 今回の結果(キーは大小どちらでもよい)
 * @param {unknown[]} lives いまの一覧
 * @returns {Record<string, object>} lv 小文字キー
 */
export function mergeDisplay(prev, pass, lives) {
  const p = prev && typeof prev === 'object' ? prev : {};
  /** @type {Record<string, object>} */
  const now = {};
  for (const [k, v] of Object.entries(pass && typeof pass === 'object' ? pass : {})) now[String(k).toLowerCase()] = v;
  /** @type {Record<string, object>} */
  const out = {};
  for (const l of Array.isArray(lives) ? lives : []) {
    const id = lvOf(l);
    if (!id) continue;
    if (now[id]) out[id] = now[id];
    else if (p[id]) out[id] = p[id];
  }
  return out;
}

/**
 * 次の回を始めてよいか。★「くり返しの上限を過ぎた」「run の固い締め切りまで 1 回ぶんの余裕が無い」なら始めない。
 * @param {{ nowMs: number, startedAtMs: number, loopMs: number, hardDeadlineMs: number, passBudgetMs: number }} o
 * @returns {boolean}
 */
export function shouldStartPass(o) {
  const elapsed = o.nowMs - o.startedAtMs;
  if (!(o.loopMs > 0)) return false;
  if (elapsed >= o.loopMs) return false;
  return elapsed + o.passBudgetMs <= o.hardDeadlineMs;
}

/**
 * 次の回の開始までの待ち時間。回の開始どうしを intervalMs 空ける(長引いた回の後は最低 minGapMs)。
 * @param {{ nowMs: number, passStartedAtMs: number, intervalMs: number, minGapMs?: number }} o
 * @returns {number}
 */
export function nextPassDelayMs(o) {
  const minGap = Math.max(0, Number(o.minGapMs) || 5_000);
  const left = o.passStartedAtMs + o.intervalMs - o.nowMs;
  return Math.max(minGap, left);
}
