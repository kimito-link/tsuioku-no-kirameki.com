/**
 * v0.1.1740: スマホの読み上げ(PC の VOICEVOX の声を届ける)の決まりごと(純関数)。
 *   サーバー(api/status.js)・PC(status-entry.js)・スマホ(app/live-view-voice.js)が同じ値を使う。
 *   計画: /mnt/project-files/smartphone/plan-5-phone-voice.md
 *
 * ■ 流れ
 *   スマホで 🗣 を ON → 声を取りに行く(action=voice)こと自体が「声がほしい」目印(30秒)。
 *   PC は送信の返事 voiceWanted:true の間だけ、新しいコメントを VOICEVOX で声にして送る。
 *   サーバーは最新20件を2分だけ預かる。スマホは「この番号より後」を受け取って順に鳴らす。
 *
 * @module phoneVoice
 */

/** 声を預かる時間(秒)。読み上げは「いま」のためのもの=長く残さない。 */
export const PHONE_VOICE_TTL_SEC = 120;
/** 預かる件数(新しい順)。スマホは5秒ごとに取りに来るので20件あれば取りこぼさない。 */
export const PHONE_VOICE_KEEP = 20;
/** 1件の大きさの上限(base64 の文字数・約64KB)。ふつうのコメントは 3〜10KB。 */
export const PHONE_VOICE_MAX_B64 = 88_000;
/** 「声がほしい」目印の寿命(秒)。スマホは取りに来るたびに置き直す。 */
export const VOICE_WANT_TTL_SEC = 30;
/** 鍵ごとの1日の声の送信上限(スマホの更新とは別枠)。1件約8KB×3,000=約24MB/日。 */
export const DEFAULT_PHONE_VOICE_DAILY_LIMIT = 3_000;
/** スマホで溜めておく上限(これより溜まったら古い方を捨てる=遅れて読むより、いまを読む)。 */
export const PHONE_VOICE_QUEUE_MAX = 5;

const NO_RE = /^\d{1,10}$/;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Redis のキー名。 */
export const phoneVoiceKeys = {
  /** @param {string} token */
  list: (token) => `voice:list:${token}`,
  /** @param {string} token */
  want: (token) => `voice:want:${token}`,
  /** @param {string} id @param {string} day YYYYMMDD */
  quota: (id, day) => `quota:voice:${id}:${day}`
};

/**
 * PC から届いた声1件を確かめる。
 * @param {unknown} body
 * @returns {{ no: string, b64: string }|null}
 */
export function validateVoiceClip(body) {
  const b = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : null;
  if (!b) return null;
  const no = String(b.no ?? '');
  const b64 = typeof b.ogg === 'string' ? b.ogg : '';
  if (!NO_RE.test(no) || !b64 || b64.length > PHONE_VOICE_MAX_B64 || !B64_RE.test(b64)) return null;
  return { no, b64 };
}

/**
 * 預かっている声(Redis のリスト・新しい順の JSON 文字列)から、after より後の番号を古い順に返す。
 *   壊れた1件は捨てて残りを返す。
 * @param {unknown} raw LRANGE の結果
 * @param {unknown} after スマホが最後に受け取った番号('' なら全部)
 * @returns {{ no: string, ogg: string }[]}
 */
export function pickVoiceClipsAfter(raw, after) {
  const list = Array.isArray(raw) ? raw : [];
  const a = NO_RE.test(String(after ?? '')) ? Number(after) : -1;
  /** @type {{ no: string, ogg: string }[]} */
  const out = [];
  const seen = new Set();
  for (const item of list) {
    let v = null;
    try { v = JSON.parse(String(item)); } catch { v = null; }
    const clip = validateVoiceClip(v);
    if (!clip || Number(clip.no) <= a || seen.has(clip.no)) continue;
    seen.add(clip.no);
    out.push({ no: clip.no, ogg: clip.b64 });
  }
  return out.sort((x, y) => Number(x.no) - Number(y.no));
}

/**
 * PC 側: コメント鏡の行から、まだ声にしていない新しいコメントを選ぶ(古い順)。
 *   ★最初の1回は覚えるだけ(スマホで ON にした瞬間に、過去のコメントをまとめて読まない)。
 *   ★番号の無い行・ギフト・本文の無い行は読まない。1回に読むのは新しい方から最大 max 件。
 * @param {{ rows: any[], seen: Set<string>|null, max?: number }} a
 * @returns {{ picks: { no: string, userId: string, name: string, text: string }[], seen: Set<string> }}
 */
export function pickNewVoiceRows(a) {
  const rows = Array.isArray(a && a.rows) ? a.rows : [];
  const first = !(a && a.seen instanceof Set);
  const seen = first ? new Set() : new Set(a.seen);
  const max = Number(a && a.max) > 0 ? Math.floor(Number(a.max)) : PHONE_VOICE_QUEUE_MAX;
  /** @type {{ no: string, userId: string, name: string, text: string }[]} */
  const picks = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || row.kind === 'gift') continue;
    const no = String(row.no ?? '');
    const text = String(row.text ?? '').trim();
    if (!NO_RE.test(no) || !text || seen.has(no)) continue;
    seen.add(no);
    if (!first) picks.push({ no, userId: String(row.userId ?? ''), name: String(row.name ?? ''), text });
  }
  while (seen.size > 400) seen.delete(/** @type {string} */ (seen.values().next().value));
  return { picks: picks.slice(-max), seen };
}

/**
 * スマホ側: 鳴らす順番の列に新しい声を足す(番号の重複は足さない・溜まりすぎたら古い方を捨てる)。
 * @param {{ no: string }[]} queue
 * @param {{ no: string }[]} incoming
 * @param {number} [max]
 */
export function enqueuePhoneVoice(queue, incoming, max = PHONE_VOICE_QUEUE_MAX) {
  const have = new Set(queue.map((c) => c.no));
  const next = queue.slice();
  for (const c of incoming) {
    if (!c || have.has(c.no)) continue;
    have.add(c.no);
    next.push(c);
  }
  return next.slice(-max);
}

/**
 * v0.1.1745: 読み上げ中は「最新コメント」欄に、いま声で読んでいるコメントを出す(声と画面をそろえる)。
 *   番号が鏡の行に無い(鏡から流れ落ちた・番号なし)なら null=呼び出し側は従来の選び方に戻る。
 * @param {any[]} rows 鏡の行(古→新)
 * @param {string} spokenNo いま鳴っている声のコメント番号('' なら鳴っていない)
 * @returns {any|null}
 */
export function pickSpokenTickerRow(rows, spokenNo) {
  const no = String(spokenNo ?? '');
  if (!NO_RE.test(no) || !Array.isArray(rows)) return null;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const r = rows[i];
    if (r && typeof r === 'object' && r.kind !== 'gift' && String(r.no ?? '') === no) return r;
  }
  return null;
}
