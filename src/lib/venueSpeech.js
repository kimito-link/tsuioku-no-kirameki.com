// venueSpeech.js
// v0.1.711: ライブ会場モードの「発言→吹き出し」純関数。
//
// 設計正本: memory/reference_venue_fullscreen_meeting.md(PR4)。
//   会場のひな壇アバター(誰がいるか=venueSeats の集計)とは別の概念で、こちらは
//   「いま誰が何を言ったか」をリアルタイムに拾って、その発言者のアバターの上に吹き出しを
//   ポップさせるためのイベント抽出を担う。
//
// 最重要(会議で確定): **初回フラッシュ防止**。会場を開いた時点で既にある過去ログを一斉に
//   吹き出すと画面が埋まる事故になる。初回は何も出さず「最後に見たコメント」を基準として覚え、
//   以後その基準より新しいコメントだけを吹き出す。
//
// このファイルは抽出ロジックだけ(DOM/storage/chrome.* 非依存・テスト可能・Web/OBS版で共用)。

/**
 * コメント行の一意キー(時系列で単調増加するもの優先)。commentNo があればそれ、
 * 無ければ id、無ければ userId+text+capturedAt の合成。venueSeats の normalizeComeviewRow と同思想。
 *
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
export function venueSpeechKey(row) {
  if (!row || typeof row !== 'object') return '';
  const no = row.commentNo ?? row.no;
  if (no != null && String(no).trim()) return `no:${String(no).trim()}`;
  if (row.id != null && String(row.id).trim()) return `id:${String(row.id).trim()}`;
  const uid = String(row.userId ?? '').trim();
  const text = String(row.text ?? '').trim();
  const cap = row.capturedAt != null ? String(row.capturedAt) : '';
  return `c:${uid}:${text}:${cap}`;
}

/**
 * 発言者の会場席キー。venueParticipantKey と同じ規約(userId 優先・無ければ name)。
 * 吹き出しを「どのアバターの上に出すか」を席キーで照合するため、venueSeats の seatByKey と一致させる。
 *
 * @param {{ userId?: string, name?: string }} row
 * @returns {string}
 */
export function venueSpeakerKey(row) {
  const uid = String(row?.userId ?? '').trim();
  if (uid) return `u:${uid}`;
  const name = String(row?.name ?? '').trim();
  return name ? `n:${name}` : '';
}

/**
 * 新着発言を抽出する純関数。
 *
 * @param {ReadonlyArray<Record<string, unknown>>} rows ライブ新着コメント(昇順=古い→新しい想定)
 * @param {{ seenKeys?: Set<string>|null, primed?: boolean }} state
 *   seenKeys=既に処理済みのコメントキー集合 / primed=初回シード済みか(false なら初回=吹き出さない)
 * @param {{ maxEmit?: number }} [opts] maxEmit=1回の抽出で返す最大件数(同時多発の洪水を防ぐ・既定8)
 * @returns {{
 *   speeches: Array<{ key: string, speakerKey: string, userId: string, name: string, text: string }>,
 *   seenKeys: Set<string>,
 *   primed: boolean
 * }}
 *   speeches=新着発言(初回や該当なしは空)。seenKeys/primed=次回呼び出しに渡す更新後の状態。
 */
export function pickNewVenueSpeech(rows, state = {}, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const maxEmit =
    Number.isFinite(opts.maxEmit) && opts.maxEmit > 0 ? Math.floor(opts.maxEmit) : 8;
  const seen = state.seenKeys instanceof Set ? new Set(state.seenKeys) : new Set();
  const wasPrimed = state.primed === true;

  // text のある行だけを発言とみなす(システム行/空行は吹き出さない)。
  const speakable = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const text = String(r.text ?? '').trim();
    if (!text) continue;
    const key = venueSpeechKey(r);
    if (!key) continue;
    speakable.push({ row: r, key, text });
  }

  // 初回(未シード): 一切吹き出さず、いま見えている全キーを「既知」として覚えるだけ。
  if (!wasPrimed) {
    for (const s of speakable) seen.add(s.key);
    return { speeches: [], seenKeys: seen, primed: true };
  }

  // 2回目以降: まだ見ていないキーだけを新着として返す。
  /** @type {Array<{ key: string, speakerKey: string, userId: string, name: string, text: string }>} */
  const fresh = [];
  for (const s of speakable) {
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    const speakerKey = venueSpeakerKey(s.row);
    if (!speakerKey) continue; // 席に紐付けられない発言者(無名・匿名)は吹き出さない
    fresh.push({
      key: s.key,
      speakerKey,
      userId: String(s.row.userId ?? '').trim(),
      name: String(s.row.name ?? '').trim(),
      text: s.text
    });
  }

  // 同時多発の洪水を防ぐため、最新側 maxEmit 件だけ返す(古い取りこぼしは許容=吹き出しは速報性優先)。
  const speeches = fresh.length > maxEmit ? fresh.slice(fresh.length - maxEmit) : fresh;

  // seenKeys が無限に増えないよう、適度に刈る(直近の十分な数だけ保持)。
  const SEEN_CAP = 4000;
  if (seen.size > SEEN_CAP) {
    const arr = Array.from(seen);
    return {
      speeches,
      seenKeys: new Set(arr.slice(arr.length - SEEN_CAP)),
      primed: true
    };
  }
  return { speeches, seenKeys: seen, primed: true };
}
