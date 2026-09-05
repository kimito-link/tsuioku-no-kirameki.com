/**
 * verifiedAvatarRegistry.js — 「推測URLだが**実際に画像が出た**」を覚えて、次から本物として扱う純関数群。
 *
 * ★なぜ要るか(2026-08-13 ユーザー指摘「会場モードのサムネがしろい 一体なんのため」)
 *
 *   ニコ生の個人サムネは `usericon/s/<uid/10000>/<uid>.jpg` という式で組める。
 *   本リポはこれを `deriveAvatarUrlFromUid` で生成しているが、**実在を確認していない**ため
 *   `userLaneResolvedThumbScore` が score=1(推測URL)に落とし、
 *   速報は「実サムネ0%」と報告し続けていた。
 *
 *   ★しかし実測(2026-08-13・curl で5件検証)では **5件中3件が HTTP 200 で実在**した:
 *       118577028 → 200(4,189 bytes)
 *       124666320 → 200
 *       19428813  → 200
 *       121718661 → 404(その人がアイコン未設定)
 *       55250264  → 404
 *   ＝推測URLの多くは**本物**。にもかかわらず 0% と表示していたのは
 *   「実在を確認する経路が無かった」だけ。
 *
 * ■ この設計の肝: 新しく取りに行かない(通信を増やさない)
 *   画面は既にその URL で `<img>` を描いており、**成功/失敗は onload/onerror で分かっている**
 *   (`avatarLoadDiag` が実際に数えている)。
 *   ＝**既に起きた事実を記録するだけ**で、実在確認になる。追加の fetch は1回もしない。
 *   ★[[status-extras-read-not-core-read]] と同じ思想: 新しい I/O を増やさない。
 *
 * ■ 掟
 *   1. **成功したものだけ**を覚える(404 は覚えない=次も推測URLのまま)
 *   2. 覚えるのは uid だけ(URL は式で再生成できる=保存量を増やさない)
 *   3. 上限を持つ(無界に増やさない=[[unbounded-await-at-boot-makes-page-blank]] と同じ用心)
 *   4. 純関数・DOM を触らない・storage は呼び出し側
 *
 * @module verifiedAvatarRegistry
 */

/** 覚えておく uid の上限(古い順に捨てる)。1配信の登場人数の実測(89〜155)より十分大きく取る。 */
export const VERIFIED_AVATAR_MAX = 2000;

/** storage キー(配信をまたいで有効=同じ人は次の配信でも実在する)。 */
export const KEY_VERIFIED_AVATAR_UIDS = 'nls_verified_avatar_uids_v1';

/**
 * 保存形（配列）を正規化する。壊れた値でも落ちない。
 *
 * @param {unknown} raw storage から読んだ値
 * @returns {string[]} uid の配列(古い順)
 */
export function normalizeVerifiedAvatarUids(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(/** @type {any} */ (raw)?.uids) ? /** @type {any} */ (raw).uids : [];
  const out = [];
  const seen = new Set();
  for (const v of list) {
    const s = String(v ?? '').trim();
    // 数字 5〜14 桁だけ(匿名・ハッシュは式で組めない=覚える意味が無い)
    if (!/^\d{5,14}$/.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.length > VERIFIED_AVATAR_MAX ? out.slice(out.length - VERIFIED_AVATAR_MAX) : out;
}

/**
 * 実在が確認できた uid を追記する(既知なら順序だけ最新へ動かさない=書き込みを増やさない)。
 *
 * @param {unknown} rawExisting storage の現在値
 * @param {ReadonlyArray<unknown>} newlyVerifiedUids 今回 onload に成功した uid
 * @returns {{ uids: string[], changed: boolean }} changed=false なら storage に書かない
 */
export function addVerifiedAvatarUids(rawExisting, newlyVerifiedUids) {
  const cur = normalizeVerifiedAvatarUids(rawExisting);
  const known = new Set(cur);
  const add = [];
  for (const v of Array.isArray(newlyVerifiedUids) ? newlyVerifiedUids : []) {
    const s = String(v ?? '').trim();
    if (!/^\d{5,14}$/.test(s)) continue;
    if (known.has(s)) continue;
    known.add(s);
    add.push(s);
  }
  if (add.length === 0) return { uids: cur, changed: false };
  const merged = cur.concat(add);
  const capped =
    merged.length > VERIFIED_AVATAR_MAX ? merged.slice(merged.length - VERIFIED_AVATAR_MAX) : merged;
  return { uids: capped, changed: true };
}

/**
 * この uid のサムネは「実在が確認済み」か。
 *
 * @param {unknown} rawExisting storage の現在値(または正規化済み配列)
 * @param {unknown} userId
 * @returns {boolean}
 */
export function isVerifiedAvatarUid(rawExisting, userId) {
  const s = String(userId ?? '').trim();
  if (!/^\d{5,14}$/.test(s)) return false;
  const list = normalizeVerifiedAvatarUids(rawExisting);
  return list.includes(s);
}

/**
 * 実在確認済みの集合を Set にして返す(判定を O(1) にする)。
 *
 * @param {unknown} rawExisting
 * @returns {Set<string>}
 */
export function verifiedAvatarUidSet(rawExisting) {
  return new Set(normalizeVerifiedAvatarUids(rawExisting));
}

/**
 * 速報に出す1行。**確認できた人数**を出す(0 のときは出さない=ノイズにしない)。
 *
 * ★「推測URL3人」とだけ言われても直せない。「実在が確認できたのは何人か」を出すと、
 *   白い枠が「まだ確認していない」のか「本当に存在しない」のかが分かる
 *   ([[instrument-value-is-measured-by-fixes-2026-08-12]])。
 *
 * @param {unknown} rawExisting
 * @returns {string} 空文字=出さない
 */
export function formatVerifiedAvatarLine(rawExisting) {
  const n = normalizeVerifiedAvatarUids(rawExisting).length;
  if (n <= 0) return '';
  return `実在を確認できたサムネ: ${n}人ぶん記憶済み(次からは推測URLでなく本物として数えます)`;
}
