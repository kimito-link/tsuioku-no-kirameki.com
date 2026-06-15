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
 * v0.1.752 リアルタイム吹き出しの安全フィルタ: ライブ経路(persistCommentRows の in-memory tap)
 * で会場へ流す行を「commentNo を持つ行だけ」に絞る純関数。
 *
 * 設計(クロスソース二重吹き出し防止): 同じコメントは後から storage 経路(pollSpeech)でも届く。
 *   両経路で venueSpeechKey が一致しないと2度吹き出す。commentNo を持つ行は両経路とも
 *   `no:<commentNo>` で一致し、共有する speechState.seenKeys で2度目が弾かれる(=1回だけ)。
 *   commentNo を持たない行(DOM harvest で no 未取得等)は合成キー(c:uid:text:cap)になり、
 *   後から storage 側が commentNo を得ると `no:` 形に化けてキーがずれ二重吹き出しになりうる。
 *   それを避けるため、ライブ経路は commentNo 確定行だけに限定し、未確定行は従来どおり storage
 *   経路に委ねる(リアルタイムの主役 NDGR_FORWARD は commentNo を必ず持つので体感は損なわない)。
 *
 * @param {ReadonlyArray<Record<string, unknown>>} rows
 * @returns {Array<Record<string, unknown>>} commentNo(または no エイリアス)を持つ行だけ
 */
export function liveFeedSpeechRows(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const no = r.commentNo ?? r.no;
    if (no == null) continue;
    if (!String(no).trim()) continue;
    out.push(r);
  }
  return out;
}

/**
 * 新着発言を抽出する純関数。
 *
 * @param {ReadonlyArray<Record<string, unknown>>} rows ライブ新着コメント(昇順=古い→新しい想定)
 * @param {{ seenKeys?: Set<string>|null, primed?: boolean }} state
 *   seenKeys=既に処理済みのコメントキー集合 / primed=初回シード済みか(false なら初回=吹き出さない)
 * @param {{ maxEmit?: number, primeEmit?: number }} [opts] maxEmit=1回の抽出で返す最大件数(同時多発の洪水を防ぐ・既定8)/ primeEmit=初回に出す直近件数(既定0=初回無音)
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
  // primeEmit: 初回(会場を開いた瞬間)に出す「直近 N 件」。0 なら従来どおり初回は無音。
  //   過疎番組でも開いた瞬間に最近の発言が数個ポンと出て「会場が喋ってる」感を出す。
  //   過去ログ全部が一斉に飛ぶ事故は防ぐ(直近 N 件だけ)。
  const primeEmit =
    Number.isFinite(opts.primeEmit) && opts.primeEmit > 0 ? Math.floor(opts.primeEmit) : 0;
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

  // 初回(未シード): 既存キーは「既知」として覚える。ただし直近 primeEmit 件だけは
  //   seen に入れず後続の fresh 抽出に回して吹き出す(過疎番組の寂しさ対策)。
  let primeSet = null;
  if (!wasPrimed) {
    primeSet = new Set(
      speakable.slice(Math.max(0, speakable.length - primeEmit)).map((s) => s.key)
    );
    for (const s of speakable) {
      if (primeSet.has(s.key)) continue; // 直近 N 件は seen に入れない(吹き出す)
      seen.add(s.key);
    }
    if (primeEmit <= 0) {
      return { speeches: [], seenKeys: seen, primed: true };
    }
  }

  // 2回目以降(or 初回の直近 N 件): まだ見ていないキーだけを新着として返す。
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

/**
 * 新着発言者を会場行(venueSeats の入力)へマージする純関数。
 *
 * ユーザー方針(2026-06-13)「しゃべった人を席に出して吹かせる」: ニコ生実況は新着が匿名/新規
 *   ばかりで、全期間集計の常連20席はめったにしゃべらない=吹き出しが出ない。そこで新着発言者を
 *   「いましゃべった人」として会場行に足し、最終発言時刻を now にすることで buildVenueSeating の
 *   lastAt 優先ロジックが自動的に上位席へ出す。これで会場が常にしゃべって生きて見える。
 *
 * 同一 userId が既に baseRows に居れば lastAt(capturedAt)を now に更新するだけ(重複行を作らない)。
 * 名前のある発言者はアリーナ席、名前の無い匿名は観客のまま(venueParticipantKey の規約に従う)。
 *
 * @param {ReadonlyArray<{userId?: string, name?: string, avatar?: string, capturedAt?: number}>} baseRows
 * @param {ReadonlyArray<{userId?: string, name?: string, text?: string}>} speeches pickNewVenueSpeech の speeches
 * @param {number} nowMs 現在時刻(発言を最新に並べるため)
 * @returns {Array<{userId: string, name: string, avatar: string, text: string, capturedAt: number}>}
 */
export function mergeSpeakersIntoVenueRows(baseRows, speeches, nowMs) {
  const base = Array.isArray(baseRows) ? baseRows : [];
  const talks = Array.isArray(speeches) ? speeches : [];
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;

  /** @type {Map<string, {userId: string, name: string, avatar: string, text: string, capturedAt: number}>} */
  const byUid = new Map();
  const out = [];
  for (const r of base) {
    if (!r || typeof r !== 'object') continue;
    const uid = String(r.userId ?? '').trim();
    const row = {
      userId: uid,
      name: String(r.name ?? '').trim(),
      avatar: String(r.avatar ?? '').trim(),
      text: String(r.text ?? ''),
      capturedAt: Number.isFinite(Number(r.capturedAt)) ? Number(r.capturedAt) : 0
    };
    out.push(row);
    if (uid) byUid.set(uid, row);
  }

  for (const sp of talks) {
    if (!sp || typeof sp !== 'object') continue;
    const uid = String(sp.userId ?? '').trim();
    const name = String(sp.name ?? '').trim();
    if (!uid && !name) continue;
    const existing = uid ? byUid.get(uid) : null;
    if (existing) {
      // 既に会場に居る人がしゃべった→最終発言を now に更新(上位席へ繰り上がる)。
      existing.capturedAt = now;
      if (name && !existing.name) existing.name = name;
    } else {
      // 会場に居ない人がしゃべった→新規に席へ(now で最優先)。
      const row = { userId: uid, name, avatar: '', text: '', capturedAt: now };
      out.push(row);
      if (uid) byUid.set(uid, row);
    }
  }
  return out;
}
