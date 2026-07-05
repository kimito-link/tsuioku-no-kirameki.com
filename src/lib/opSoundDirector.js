/**
 * opSoundDirector.js
 * 操作音(パチンコの「玉の打ち出し」比喩・council/operation-sound-SYNTHESIS.md Phase D1)の
 *   純関数群。DOM・storage・実際の音再生には一切触れない(effectDirector.js と同じ流儀)。
 *
 * 設計の核(§2/§3): 検知点は拡張自身のコメント投稿経路(押下=op_handle・成功=op_shot)。
 *   打ち出し音は「この配信での自分の投稿成功数 n」の純関数として4段に育つ(置換のみ)。
 *   60秒窓の連続投稿はコンボとして directHit(effectDirector.js)にそのまま乗せて一時昇格する。
 *   節目(5/10/25/50/100)到達時は op_shot の代わりに op_self_milestone を1本だけ鳴らす。
 *   乱数は一切使わない(§7 却下事項)。
 */

/** 打ち出し音の育成梯子(基準段・弱→強)。directHit の ladder にそのまま渡せる。 */
export const OP_SHOT_LADDER = Object.freeze(['op_shot_1', 'op_shot_2', 'op_shot_3', 'op_shot_4']);

/** コンボ窓(ms)。連続投稿の間合いはコメントの会話往復を想定し視聴イベントの30秒より長い60秒。 */
export const OP_SHOT_COMBO_WINDOW_MS = 60_000;

/** 自分の投稿数の節目(この値に到達したその1発だけ op_self_milestone に置換)。 */
export const OP_SELF_MILESTONES = Object.freeze([5, 10, 25, 50, 100]);

/** op_shot ファミリー共通ガード(ms)。昇格でキーが変わってもこのガードは共有する(§4.1)。 */
export const OP_SHOT_FAMILY_GUARD_MS = 600;

/** その他 op_*(handle/toggle/panel/seat/copy/publish/self_milestone)の既定ガード(ms)。 */
export const OP_SOUND_DEFAULT_GUARD_MS = 250;

/** op_* 全体横断の最短間隔(ms)。連打しても1秒3発が絶対天井(§4.1)。 */
export const OP_SOUND_GLOBAL_FLOOR_MS = 200;

/**
 * 自分の投稿成功数 n から、打ち出し音の基準キーを決める純関数(§3.1)。
 * 境界: 1〜4=shot_1 / 5〜14=shot_2 / 15〜29=shot_3 / 30+=shot_4。
 * @param {number} n この liveId での自分の投稿成功数(result.ok の回数)
 * @returns {string} OP_SHOT_LADDER のいずれか
 */
export function shotKindForSelfPostCount(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  if (count >= 30) return 'op_shot_4';
  if (count >= 15) return 'op_shot_3';
  if (count >= 5) return 'op_shot_2';
  return 'op_shot_1';
}

/**
 * n が節目(5/10/25/50/100)にちょうど到達した発かどうかを判定する純関数(§3.3)。
 * 到達したその1発だけ true を返す(2本鳴らさない=置換のみの原則)。
 * @param {number} n 今回の投稿成功後の合計数
 * @returns {boolean}
 */
export function opSelfMilestoneFor(n) {
  const count = Math.floor(Number(n) || 0);
  return OP_SELF_MILESTONES.includes(count);
}

/**
 * @typedef {{
 *   familyLastAt: Record<string, number>, // ファミリー(op_shot 等)ごとの直近再生時刻(epoch ms)
 *   globalLastAt: number                  // op_* 全体を横断した直近再生時刻(epoch ms)
 * }} OpSoundGateState
 */

/** 初期ゲート state。 */
export function makeInitialOpSoundGateState() {
  return { familyLastAt: {}, globalLastAt: 0 };
}

/**
 * キーが属するガード用ファミリー名を返す純関数。op_shot_1〜4 は共通の 'op_shot' ファミリーで
 *   まとめてガードする(昇格でキーが変わってもガードが効くように・§4.1)。それ以外は自分自身の
 *   キー名がファミリー(個別ガード)。
 * @param {string} key
 * @returns {string}
 */
export function opSoundFamilyForKey(key) {
  const k = String(key || '');
  return OP_SHOT_LADDER.includes(k) ? 'op_shot' : k;
}

/**
 * そのファミリーの既定ガード(ms)を返す純関数。op_shot/op_copy/op_publish は600ms、その他は250ms。
 * @param {string} family opSoundFamilyForKey の戻り値
 * @returns {number}
 */
export function opSoundGuardMsForFamily(family) {
  const f = String(family || '');
  return f === 'op_shot' || f === 'op_copy' || f === 'op_publish'
    ? OP_SHOT_FAMILY_GUARD_MS
    : OP_SOUND_DEFAULT_GUARD_MS;
}

/**
 * 操作音を鳴らしてよいかの決定論ゲート判定(純関数・副作用なし)。
 *   1) 全体横断200ms天井を割っていないか
 *   2) 同ファミリー(op_shot はまとめて)のガード(600ms or 250ms)を割っていないか
 *   3) P1(大当たりチェーン)実行中は自己応答レーン(op_handle/op_shot)以外は破棄(§4.2 P4.5)
 * @param {OpSoundGateState|null|undefined} state 前回までのゲート状態
 * @param {string} key 鳴らそうとしている op_* キー
 * @param {number} nowMs 現在時刻(epoch ms)
 * @param {{ isP1Active?: boolean }} [opts] P1(大当たりチェーン)実行中フラグ
 * @returns {{ allowed: boolean, reason: string, nextState: OpSoundGateState }}
 *   reason: 'ok' | 'global_floor' | 'family_guard' | 'p1_active'
 */
export function opSoundGate(state, key, nowMs, opts = {}) {
  const prev = state && typeof state === 'object' ? state : makeInitialOpSoundGateState();
  const familyLastAt = /** @type {Record<string, number>} */ (
    prev.familyLastAt && typeof prev.familyLastAt === 'object' ? prev.familyLastAt : {}
  );
  const globalLastAt = Math.max(0, Number(prev.globalLastAt) || 0);
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const k = String(key || '');
  const family = opSoundFamilyForKey(k);

  // 自己応答レーン(op_handle/op_shot*)は P1 実行中でも常時通す(§4.2の唯一例外)。
  const isSelfResponseLane = k === 'op_handle' || OP_SHOT_LADDER.includes(k);
  if (opts.isP1Active && !isSelfResponseLane) {
    return { allowed: false, reason: 'p1_active', nextState: prev };
  }

  if (globalLastAt > 0 && now - globalLastAt < OP_SOUND_GLOBAL_FLOOR_MS) {
    return { allowed: false, reason: 'global_floor', nextState: prev };
  }

  const familyAt = Math.max(0, Number(familyLastAt[family]) || 0);
  const guardMs = opSoundGuardMsForFamily(family);
  if (familyAt > 0 && now - familyAt < guardMs) {
    return { allowed: false, reason: 'family_guard', nextState: prev };
  }

  const nextFamilyLastAt = { ...familyLastAt, [family]: now };
  return {
    allowed: true,
    reason: 'ok',
    nextState: { familyLastAt: nextFamilyLastAt, globalLastAt: now }
  };
}
