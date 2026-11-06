// ytChatEchoDedupe.js — 自分の送ったコメントが「2回」記録・読み上げされるのを防ぐ(0.1.1903・2026-11-06 りんく実機)。
//
// YouTube のチャット欄は、自分が送ったコメントをまず仮の行(仮の id)で出し、送信が通ると本物の id の行に
//   差し替える(同じ要素の id を書き換える or 行ごと作り直す)。記録係は id で重複を見ているので、仮の行と
//   本物の行を別のコメントとして2回送っていた → 記録2件・読み上げ2回(画面のチャット欄には1件しか無い)。
//
// 見分け方: 同じ人・同じ文・短い間(既定30秒)に、id だけ違う行が来て、しかも前の行が
//   (a) 同じ要素(id が書き換わった) か (b) もう画面から外れている(差し替えられた) とき、同じコメントとみなす。
//   前の行がまだ画面にあるときは1秒ほど待って見直し、それでも残っていれば本当に2回書いた(連投)として両方記録する。
//
// 純粋部品(DOM に触らない)。要素は呼び出し側が渡し、isConnected だけ見る。

export const YT_ECHO_WINDOW_MS = 30000;
const MAX_KEYS = 400;

/** @param {{ channelId?: string, name?: string, text?: string, kind?: string }} p */
export function ytEchoKey(p) {
  const who = String(p?.channelId || p?.name || '').trim();
  const text = String(p?.text || '').replace(/\s+/g, ' ').trim();
  if (!who || !text) return '';
  return `${String(p?.kind || '')}|${who}|${text}`;
}

/**
 * @param {{ windowMs?: number }} [o]
 */
export function createYtEchoDedupe(o = {}) {
  const windowMs = Number(o.windowMs) > 0 ? Number(o.windowMs) : YT_ECHO_WINDOW_MS;
  /** @type {Map<string, { id: string, el: any, at: number }>} */
  const last = new Map();
  return {
    /**
     * 新しい id のコメントが来たときに呼ぶ。
     *   'echo' = 同じコメントの差し替え(仮の行→本物の行)。送らない。
     *   'wait' = 同じ人・同じ文の前の行がまだ画面にある。差し替えの途中かもしれないので、少し後(1秒ほど)に
     *            もう一度呼ぶ(waited=true)。そのときもまだあれば本当の連投として 'new'。
     *   'new'  = 別のコメント。送る。
     * @param {{ id: string, channelId?: string, name?: string, text?: string, kind?: string }} parsed
     * @param {any} el その行の要素(isConnected を見る)
     * @param {{ now?: number, waited?: boolean }} [o]
     * @returns {'echo'|'wait'|'new'}
     */
    classify(parsed, el, o = {}) {
      const now = Number.isFinite(o.now) ? Number(o.now) : Date.now();
      const key = ytEchoKey(parsed);
      if (!key) return 'new';
      const prev = last.get(key);
      /** @type {'echo'|'wait'|'new'} */
      let verdict = 'new';
      if (prev && prev.id !== String(parsed.id) && now - prev.at <= windowMs) {
        if (prev.el === el || !prev.el || prev.el.isConnected === false) verdict = 'echo';
        else if (!o.waited) return 'wait'; // 覚え直さない(前の行のまま、後でもう一度見る)
      }
      last.delete(key);
      last.set(key, { id: String(parsed.id), el, at: now });
      if (last.size > MAX_KEYS) {
        const first = last.keys().next().value;
        if (first !== undefined) last.delete(first);
      }
      return verdict;
    },
  };
}
