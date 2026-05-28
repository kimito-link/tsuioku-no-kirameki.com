/**
 * L1 コメ伝染 + L5 コメ被り瞬間検出。
 *
 * 設計（0.1.25 Z / ラテラル思考 L1 / L5）:
 *   - **コメ伝染（L1）**: ある語が短時間内に複数ユーザーから出るパターンを検出。
 *     ニコ生独特の "おつー" → 全員 "おつー" のような同期を定量化。
 *   - **コメ被り瞬間（L5）**: より厳しい時間窓（5 秒以内）で同じ文字列が複数ユーザー
 *     から出る瞬間。"歓声同期" としてピックアップ。
 *
 *   両方共 normalize（全角→半角・case 統一・句読点除去）してから比較する。
 */

/**
 * @typedef {{ capturedAt?: any, userId?: any, text?: any }} EchoCommentInput
 */

/**
 * @param {string} text
 * @returns {string}
 */
export function normalizeForEcho(text) {
  let s = String(text == null ? '' : text);
  // v0.1.356: 表記ゆれ吸収を強化。NFKC で半角カナ→全角カナ・全角英数→半角等を畳む
  //   （従来は「ﾊﾝｶｸ」と「ハンカク」、全角数字などが別キーになりエコー検出を取りこぼしていた）。
  try {
    s = s.normalize('NFKC');
  } catch {
    // 環境が normalize 非対応でも続行
  }
  // カタカナ→ひらがなに畳む（「オツ」と「おつ」を同一視）。U+30A1..U+30F6 を 0x60 引いて変換。
  s = s.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
  // 全角 W → 半角 w（NFKC で吸収されるが、明示的に残す）
  s = s.replace(/[Ｗｗ]/g, 'w');
  s = s.toLowerCase();
  // 句読点・記号を一部除去（!? 。、 など）
  s = s.replace(/[!?！？。、,．\s]/g, '');
  s = s.trim();
  // 短すぎる文字列はノイズとして弾く（ただし 1 文字でも CJK・日本語の漢字なら OK）
  if (s.length === 0) return '';
  if (s.length === 1) {
    // ASCII 1 字は雑音（"a" "1" など）。漢字・ひらがな・カタカナ・絵文字は通す。
    if (s.charCodeAt(0) < 128) return '';
  }
  return s;
}

/**
 * @param {EchoCommentInput[]} comments
 * @returns {{ at: number, uid: string, key: string }[]}
 */
function collectKeys(comments) {
  const list = Array.isArray(comments) ? comments : [];
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const at = c.capturedAt;
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
    const uid = c.userId == null ? '' : String(c.userId).trim();
    if (!uid) continue;
    const key = normalizeForEcho(c.text);
    if (!key) continue;
    out.push({ at, uid, key });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/**
 * @typedef {{
 *   text: string,
 *   firstAt: number,
 *   lastAt: number,
 *   userCount: number,
 *   commentCount: number
 * }} EchoBurst
 */

/**
 * 共通: 「windowMs 以内に key が minDistinctUsers ユーザー以上」の連鎖を検出。
 * @param {EchoCommentInput[]} comments
 * @param {{ windowMs: number, minDistinctUsers: number }} cfg
 * @returns {EchoBurst[]}
 */
function detectClusters(comments, cfg) {
  const items = collectKeys(comments);
  if (items.length === 0) return [];
  /** @type {Map<string, { firstAt: number, lastAt: number, users: Set<string>, commentCount: number }>} */
  const open = new Map();
  /** @type {EchoBurst[]} */
  const bursts = [];

  for (const it of items) {
    const cur = open.get(it.key);
    if (cur && it.at - cur.firstAt <= cfg.windowMs) {
      cur.lastAt = it.at;
      cur.users.add(it.uid);
      cur.commentCount += 1;
    } else if (cur) {
      // アンカー firstAt が窓外でも、末尾 lastAt と近ければ連鎖の続き（境界ユーザー救済）。
      // 末尾から窓より離れていれば別ピーク開始（離れた伝染を合体させない）。
      const tailContiguous = it.at - cur.lastAt <= cfg.windowMs;
      if (!tailContiguous) {
        if (cur.users.size >= cfg.minDistinctUsers) {
          bursts.push({
            text: it.key,
            firstAt: cur.firstAt,
            lastAt: cur.lastAt,
            userCount: cur.users.size,
            commentCount: cur.commentCount
          });
        }
        open.set(it.key, {
          firstAt: it.at,
          lastAt: it.at,
          users: new Set([it.uid]),
          commentCount: 1
        });
      } else {
        const boostedUsers = new Set(cur.users);
        boostedUsers.add(it.uid);
        const boostedCount = cur.commentCount + 1;
        if (boostedUsers.size >= cfg.minDistinctUsers) {
          bursts.push({
            text: it.key,
            firstAt: cur.firstAt,
            lastAt: it.at,
            userCount: boostedUsers.size,
            commentCount: boostedCount
          });
          open.delete(it.key);
        } else {
          open.set(it.key, {
            firstAt: it.at,
            lastAt: it.at,
            users: new Set([it.uid]),
            commentCount: 1
          });
        }
      }
    } else {
      open.set(it.key, {
        firstAt: it.at,
        lastAt: it.at,
        users: new Set([it.uid]),
        commentCount: 1
      });
    }
  }
  // flush remaining
  for (const [key, cur] of open) {
    if (cur.users.size >= cfg.minDistinctUsers) {
      bursts.push({
        text: key,
        firstAt: cur.firstAt,
        lastAt: cur.lastAt,
        userCount: cur.users.size,
        commentCount: cur.commentCount
      });
    }
  }
  // sort by user count desc
  bursts.sort((a, b) => b.userCount - a.userCount || b.commentCount - a.commentCount);
  return bursts;
}

/**
 * L1 コメ伝染（30 秒窓・3 ユーザー以上）。
 * @param {EchoCommentInput[] | null | undefined} comments
 * @param {{ windowMs?: number, minDistinctUsers?: number } | undefined} [opts]
 * @returns {EchoBurst[]}
 */
export function detectCommentPropagation(comments, opts = {}) {
  const windowMs =
    typeof opts?.windowMs === 'number' && opts.windowMs > 0 ? opts.windowMs : 30_000;
  const minDistinctUsers =
    typeof opts?.minDistinctUsers === 'number' && opts.minDistinctUsers > 0
      ? opts.minDistinctUsers
      : 3;
  return detectClusters(comments || [], { windowMs, minDistinctUsers });
}

/**
 * L5 コメ被り瞬間（5 秒窓・3 ユーザー以上）。
 * @param {EchoCommentInput[] | null | undefined} comments
 * @param {{ windowMs?: number, minDistinctUsers?: number } | undefined} [opts]
 * @returns {EchoBurst[]}
 */
export function detectCommentSyncBursts(comments, opts = {}) {
  const windowMs =
    typeof opts?.windowMs === 'number' && opts.windowMs > 0 ? opts.windowMs : 5_000;
  const minDistinctUsers =
    typeof opts?.minDistinctUsers === 'number' && opts.minDistinctUsers > 0
      ? opts.minDistinctUsers
      : 3;
  return detectClusters(comments || [], { windowMs, minDistinctUsers });
}
