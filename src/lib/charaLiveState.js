/**
 * charaLiveState.js
 *
 * 「キャラライブ」= 画面に常駐する 3 キャラ(りんく/こん太/たぬ姉)が、ふわふわ浮遊しながら
 *   勝手に表情を変え、コメント読み上げに相槌を入れ、配信者に話しかけられたら答え、
 *   AI 思考中は考え込む —— その **状態遷移だけ** を担う純関数層。
 *
 * ユーザー要望(2026-08-25):
 *   1. 3 体を常に表示・ふわふわ浮遊・自然に動く
 *   2. 勝手に少しずつ動き/表情を変えて「場にいる」空気を出す(ライブ会場のざわめき)
 *   3. コメント読み上げのタイミングで誰か 1 体が相槌/短いリアクション
 *   4. 配信者が「〇〇さん、〇〇だよね」と話しかけたら誰かが反応して答える
 *   5. AI 思考中は「シンキング」= 考え込む動き/表情
 *
 * 設計原則(このリポの既存 venue* 純関数層と同じ):
 *   - DOM / storage / chrome.* / 時間取得に触らない。nowMs は必ず外から注入する。
 *   - 乱数は外から seed を受け取る決定論。同じ入力には常に同じ結果(テスト可能)。
 *     ※「勝手に動く」ように見せるのに Math.random は使わない。時刻+個体 seed から
 *       ハッシュで導出する=リロードしても破綻せず、テストでは時刻を固定して検証できる。
 *   - 既存資産を作り直さない:
 *       表情/口の画像解決 → yukkuriBroadcastSummary.js の yukkuriCharacterImagePath
 *         (konta だけ normal 単独ファイルという地雷を既に吸収済み。ここで再実装しない)
 *       浮遊の呼吸/同期      → venueCrowdMotion.js と同じ「共通位相+個体ズレ」の考え方
 *       盛り上がり heat      → venueHeat.js の resolveVenueHeatLevel の値をそのまま受ける
 *
 * ★このファイル単体では画面は変わらない。描画側(charaLiveStage.js)と組んで初めて動く。
 */

import { yukkuriCharacterImagePath } from './yukkuriBroadcastSummary.js';

/**
 * @typedef {'rinku'|'konta'|'tanunee'} CharaId
 * @typedef {'smile'|'blink'|'half-eyes'|'normal'} CharaExpression
 *
 * @typedef {'idle'|'react'|'answer'|'thinking'} CharaMode
 *   idle     = 常駐(ふわふわ+まばたき+たまに表情が変わる)
 *   react    = コメント読み上げに合わせた相槌(短い)
 *   answer   = 配信者に話しかけられた返事(長め・口パクする)
 *   thinking = AI 思考中(考え込む)
 */

/** 3 キャラの並び。AGENTS.md §3.2「3 キャラの役割(ブレさせない)」と同じ順・同じ役割。 */
export const CHARA_LIVE_MEMBERS = Object.freeze([
  Object.freeze({ id: 'rinku', displayName: 'りんく', role: '配信者視点' }),
  Object.freeze({ id: 'konta', displayName: 'こん太', role: 'ファン視点' }),
  Object.freeze({ id: 'tanunee', displayName: 'たぬ姉', role: '匿名ガイド / しっかり者解説' })
]);

/** @type {readonly CharaId[]} */
export const CHARA_LIVE_IDS = Object.freeze(CHARA_LIVE_MEMBERS.map((m) => m.id));

/* ------------------------------------------------------------------ *
 * 決定論の乱数(Math.random を使わない理由は冒頭コメント参照)
 * ------------------------------------------------------------------ */

/**
 * FNV-1a 32bit。voiceAssignment.js と同じ手法で、文字列→安定した数値。
 * @param {unknown} value
 * @returns {number} 0..2^32-1
 */
function fnv1a32(value) {
  const s = String(value ?? '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * seed から 0..1 の決定論的な値。
 * @param {unknown} seed
 * @returns {number} 0..1
 */
export function charaHashUnit(seed) {
  return fnv1a32(seed) / 0x100000000;
}

/**
 * 0..1 にクランプ。
 * @param {unknown} v
 * @returns {number}
 */
function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/* ------------------------------------------------------------------ *
 * ① ふわふわ浮遊(常駐の「生きている」感)
 * ------------------------------------------------------------------ */

/** 浮遊 1 往復の基準ミリ秒。venueCrowdMotion の BASE_PERIOD_MS より遅い=ゆったり漂う。 */
export const FLOAT_BASE_PERIOD_MS = 5200;

/**
 * キャラ 1 体の浮遊オフセット。
 *
 * venueCrowdMotion.resolveCrowdSpriteMotion と同じ「全員共通の位相 + 個体ズレ」構造。
 * ただし観客(=同期して沸く群衆)と違い、3 キャラは **わざと位相をずらす**。
 *   3 体が完全同期で上下すると「機械が 3 つ動いている」ように見え、
 *   バラバラだと「それぞれが勝手に居る」ように見える(=ざわめき/空気感の正体)。
 *
 * @param {number} timeMs 単調増加時刻(performance.now 等)
 * @param {CharaId|string} charaId 個体シード
 * @param {{ heatLevel?: number, reducedMotion?: boolean }} [opts]
 *   heatLevel=会場の盛り上がり 0..1(上がるほど少し速く大きく動く)
 *   reducedMotion=true なら完全静止(prefers-reduced-motion 尊重)
 * @returns {{ x: number, y: number, rotateDeg: number, scale: number }}
 *   x/y=px オフセット、rotateDeg=傾き(度)、scale=拡大率(1 前後)
 */
export function resolveCharaFloat(timeMs, charaId, opts = {}) {
  if (opts.reducedMotion === true) {
    return { x: 0, y: 0, rotateDeg: 0, scale: 1 };
  }
  const t = Number(timeMs) || 0;
  const heat = clamp01(opts.heatLevel);
  // 個体ごとに固定の位相ズレ(0..1)。3 体が別々のタイミングで漂う。
  //
  // ★ハッシュ「だけ」で決めてはいけない(2026-08-25 実測で踏んだ):
  //   charaHashUnit('float:konta')=0.1735 と 'float:tanunee'=0.1736 がほぼ衝突し、
  //   こん太とたぬ姉が永久にほぼ同位相で上下していた(=揃って動く機械に見える)。
  //   3 体は固定メンバーなので、まず **index で等間隔(0, 1/3, 2/3)に配る** のが正しい。
  //   ハッシュはその上に乗せる微小なゆらぎに留める(等間隔すぎる規則性も消す)。
  const idx = CHARA_LIVE_IDS.indexOf(/** @type {any} */ (charaId));
  const evenPhase = idx >= 0 ? idx / CHARA_LIVE_IDS.length : 0;
  const phaseSeed = (evenPhase + charaHashUnit(`float:${charaId}`) * 0.08) % 1;
  // 盛り上がるほど少しだけ速く(5200ms → 3600ms 程度)。
  const period = Math.max(1200, FLOAT_BASE_PERIOD_MS - heat * 1600);
  const base = (t / period) * Math.PI * 2 + phaseSeed * Math.PI * 2;

  // 縦: 主成分。ゆっくり大きく上下(ふわふわの本体)。
  const y = Math.sin(base) * (5 + heat * 3);
  // 横: 縦とわずかに違う周期にして「8 の字」に近い軌道にする(直線往復に見せない)。
  const x = Math.sin(base * 0.63 + phaseSeed * 3.1) * (3 + heat * 2);
  // 傾き: さらに遅い周期。首をかしげる程度の微小量に留める。
  const rotateDeg = Math.sin(base * 0.41 + phaseSeed * 1.7) * (1.6 + heat * 1.2);
  // 拡大: 呼吸。1 を中心に ±1% 程度(気づかないが「止まっていない」と感じる量)。
  const scale = 1 + Math.sin(base * 0.77 + phaseSeed * 2.3) * 0.012;

  return { x, y, rotateDeg, scale };
}

/* ------------------------------------------------------------------ *
 * ② まばたき / 表情のゆらぎ(勝手に少しずつ変化する)
 * ------------------------------------------------------------------ */

/** まばたき 1 回の長さ(ms)。人間の瞬目は 100〜150ms 程度。 */
export const BLINK_DURATION_MS = 130;
/** まばたきの平均間隔(ms)。実際は個体ごとに ±40% ゆらぐ。 */
export const BLINK_INTERVAL_MS = 4200;

/**
 * いま「まばたき中」か。
 *
 * 一定間隔ちょうどだと 3 体が揃って瞬きして不自然なので、間隔そのものを
 * 個体 seed とサイクル番号でゆらがせる(=毎回わずかに違うタイミングで瞬く)。
 *
 * @param {number} timeMs
 * @param {CharaId|string} charaId
 * @returns {boolean}
 */
export function isCharaBlinking(timeMs, charaId) {
  const t = Number(timeMs) || 0;
  if (t < 0) return false;
  const seed = charaHashUnit(`blink:${charaId}`);
  // 個体ごとの基準間隔(3.4〜5.0 秒程度に散らす)。
  const interval = BLINK_INTERVAL_MS * (0.8 + seed * 0.4);
  const cycle = Math.floor(t / interval);
  // サイクルごとに「その回だけ」のズレを足す=規則正しさを消す。
  const jitter = charaHashUnit(`blink:${charaId}:${cycle}`) * interval * 0.5;
  const startAt = cycle * interval + jitter;
  return t >= startAt && t < startAt + BLINK_DURATION_MS;
}

/** idle 中の表情がゆらぐ周期(ms)。この単位で normal/smile/half-eyes を行き来する。 */
export const IDLE_EXPRESSION_PERIOD_MS = 7000;

/**
 * idle 時の「素の表情」(まばたきは別レイヤーで上書きする)。
 *
 * ずっと normal だと能面なので、時々 smile / half-eyes に寄る。
 * heat が高い(盛り上がっている)ほど smile の出現率を上げる=会場の空気に連動する。
 *
 * @param {number} timeMs
 * @param {CharaId|string} charaId
 * @param {{ heatLevel?: number }} [opts]
 * @returns {CharaExpression}
 */
export function resolveIdleExpression(timeMs, charaId, opts = {}) {
  const t = Number(timeMs) || 0;
  const heat = clamp01(opts.heatLevel);
  const seed = charaHashUnit(`expr:${charaId}`);
  // 個体ごとに周期を散らす(全員同時に表情が変わらないように)。
  const period = IDLE_EXPRESSION_PERIOD_MS * (0.75 + seed * 0.5);
  const slot = Math.floor(t / period);
  const roll = charaHashUnit(`expr:${charaId}:${slot}`);
  // 盛り上がるほど smile 寄り。静かなときは normal 中心で落ち着かせる。
  const smileChance = 0.22 + heat * 0.38;
  if (roll < smileChance) return 'smile';
  // たまに半目(退屈/まったり)。盛り上がっている時は減らす。
  if (roll > 1 - 0.14 * (1 - heat)) return 'half-eyes';
  return 'normal';
}

/* ------------------------------------------------------------------ *
 * ③ 口パク(読み上げ/返事に合わせて口を開閉する)
 * ------------------------------------------------------------------ */

/** 口の開閉 1 往復(ms)。日本語のモーラは概ね 150〜200ms なのでその近辺。 */
export const LIPSYNC_PERIOD_MS = 180;

/**
 * 発話中の口の開閉。
 *
 * 実際の音声波形は取れない(VOICEVOX の音声は Audio 要素で鳴っているだけ)ので、
 * 一定周期 + 個体ゆらぎの擬似口パクにする。等間隔だと機械的なので、
 * サイクルごとに開いている割合を変える(喋っている感じのムラを作る)。
 *
 * @param {number} elapsedMs 発話開始からの経過 ms
 * @param {CharaId|string} charaId
 * @returns {boolean} true=口を開ける
 */
export function isCharaMouthOpen(elapsedMs, charaId) {
  const e = Number(elapsedMs);
  if (!Number.isFinite(e) || e < 0) return false;
  const cycle = Math.floor(e / LIPSYNC_PERIOD_MS);
  const within = (e % LIPSYNC_PERIOD_MS) / LIPSYNC_PERIOD_MS;
  // このサイクルで口を開けている割合(0.35〜0.75)。喋りのムラ。
  const openRatio = 0.35 + charaHashUnit(`lip:${charaId}:${cycle}`) * 0.4;
  return within < openRatio;
}

/* ------------------------------------------------------------------ *
 * ④ 誰が反応するか(相槌 / 返事の担当決め)
 * ------------------------------------------------------------------ */

/**
 * コメント読み上げの相槌を「3 体のうち誰が」入れるか決める。
 *
 * 要望は「誰か 1 体」。ランダムに見えて欲しいが、同じ子ばかり喋ると不自然なので
 * **直前に喋った子を除外**してから選ぶ(会話が回っているように見せる)。
 *
 * @param {string} commentKey コメントの一意キー(venueSpeechKey の値)。同じコメントなら常に同じ子。
 * @param {CharaId|null} [lastSpeaker] 直前に反応した子(いれば除外する)
 * @returns {CharaId}
 */
export function pickReactingChara(commentKey, lastSpeaker = null) {
  const pool = CHARA_LIVE_IDS.filter((id) => id !== lastSpeaker);
  // 全員除外されることはない(3 体中 1 体しか除外しない)が、防御的に。
  const list = pool.length ? pool : CHARA_LIVE_IDS;
  const idx = fnv1a32(`react:${commentKey}`) % list.length;
  return /** @type {CharaId} */ (list[idx]);
}

/**
 * 配信者の呼びかけ(「〇〇さん、〇〇だよね」)から **名指しされた子** を取り出す。
 *
 * 名前で呼ばれたらその子が答えるのが自然。名指しが無ければ null を返し、
 * 呼び出し側が pickReactingChara 等で誰かに振る。
 *
 * 表記ゆれを吸収する: 「りんく」「リンク」「link」/「こん太」「コン太」「konta」/
 *   「たぬ姉」「たぬねえ」「tanunee」。さん/ちゃん/くん付けも通す。
 *
 * @param {string} text 配信者の発話テキスト(音声認識結果 or 手入力)
 * @returns {CharaId|null}
 */
export function detectAddressedChara(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const s = raw.toLowerCase();
  // 先に出てきた名前を優先する(「りんく、たぬ姉はどう思う?」なら呼びかけは りんく)。
  /** @type {{ id: CharaId, at: number }[]} */
  const hits = [];
  /** @type {Readonly<Record<CharaId, readonly string[]>>} */
  const ALIASES = {
    rinku: ['りんく', 'リンク', 'link', 'rinku'],
    konta: ['こん太', 'コン太', 'こんた', 'コンタ', 'konta'],
    tanunee: ['たぬ姉', 'たぬねえ', 'タヌ姉', 'たぬネエ', 'tanunee', 'tanu']
  };
  for (const id of CHARA_LIVE_IDS) {
    for (const alias of ALIASES[id]) {
      const at = s.indexOf(alias.toLowerCase());
      if (at >= 0) {
        hits.push({ id, at });
        break;
      }
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.at - b.at);
  return hits[0].id;
}

/* ------------------------------------------------------------------ *
 * ⑤ モードごとの見た目(表情 + 画像パス)
 * ------------------------------------------------------------------ */

/** react/answer/thinking がそれぞれ最低限続く時間(ms)。短すぎると気づけない。 */
export const REACT_MIN_MS = 1400;
export const ANSWER_MIN_MS = 1800;

/**
 * 「シンキング」の表情。
 *
 * 考え込む = 半目(half-eyes)で口を閉じる。まばたきは止めない(止めると固まって見える)。
 * 加えて描画側が首をゆっくり傾ける(resolveThinkingTilt)。
 *
 * @param {number} elapsedMs thinking 開始からの経過 ms
 * @returns {{ expression: CharaExpression, mouthOpen: boolean }}
 */
export function resolveThinkingLook(elapsedMs) {
  const e = Number(elapsedMs) || 0;
  // 考えが「まとまりかけて」また戻る往復を表情で出す:
  //   ほとんど half-eyes、時々 normal に戻る(=ふと顔を上げる)。
  const slot = Math.floor(e / 1500);
  const roll = charaHashUnit(`think:${slot}`);
  return {
    expression: roll < 0.75 ? 'half-eyes' : 'normal',
    mouthOpen: false
  };
}

/** シンキング中に首をかしげる最大角(度)。 */
export const THINKING_TILT_MAX_DEG = 9;

/**
 * シンキング中の首の傾き。ゆっくり片側に傾けて、ゆっくり戻す。
 * 「考え込んでいる」と一目で分かる最小の動き。
 *
 * @param {number} elapsedMs
 * @returns {number} 傾き(度)
 */
export function resolveThinkingTilt(elapsedMs) {
  const e = Number(elapsedMs) || 0;
  // 2.4 秒で片道。往復させる(sin だと速度が均一すぎるので緩急を付ける)。
  const phase = (e / 2400) * Math.PI;
  return Math.sin(phase) * THINKING_TILT_MAX_DEG;
}

/**
 * キャラ 1 体の「いまの見た目」を 1 つに解決する。
 *
 * ここが状態機械の合流点: mode ごとに表情/口/傾きを決め、最後に画像パスへ落とす。
 * 描画側はこの戻り値をそのまま DOM に反映するだけでよい(判断を描画側に残さない)。
 *
 * 優先順位(上ほど強い):
 *   thinking > answer > react > idle
 *   ただし「まばたき」は idle/react/answer に共通で最後に上書きする
 *   (thinking は半目なのでまばたき無し=考え込んでいる表情を壊さない)。
 *
 * @param {{
 *   charaId: CharaId,
 *   mode: CharaMode,
 *   timeMs: number,
 *   modeStartedAtMs?: number,
 *   heatLevel?: number,
 *   reducedMotion?: boolean
 * }} input
 * @returns {{
 *   charaId: CharaId,
 *   mode: CharaMode,
 *   expression: CharaExpression,
 *   mouthOpen: boolean,
 *   imagePath: string,
 *   float: { x: number, y: number, rotateDeg: number, scale: number },
 *   tiltDeg: number
 * }}
 */
export function resolveCharaLiveLook(input) {
  const charaId = /** @type {CharaId} */ (input?.charaId || 'rinku');
  const mode = /** @type {CharaMode} */ (input?.mode || 'idle');
  const timeMs = Number(input?.timeMs) || 0;
  const startedAt = Number(input?.modeStartedAtMs);
  const elapsed = Number.isFinite(startedAt) ? Math.max(0, timeMs - startedAt) : timeMs;
  const heatLevel = clamp01(input?.heatLevel);
  const reducedMotion = input?.reducedMotion === true;

  const float = resolveCharaFloat(timeMs, charaId, { heatLevel, reducedMotion });

  /** @type {CharaExpression} */
  let expression;
  let mouthOpen = false;
  let tiltDeg = 0;
  let allowBlink = true;

  if (mode === 'thinking') {
    const look = resolveThinkingLook(elapsed);
    expression = look.expression;
    mouthOpen = look.mouthOpen;
    tiltDeg = reducedMotion ? 0 : resolveThinkingTilt(elapsed);
    // 半目で考え込んでいる最中にまばたきを重ねると、表情が跳ねて落ち着かない。
    allowBlink = false;
  } else if (mode === 'answer') {
    // 返事は笑顔で、口パクする(喋っていることを口で示す)。
    expression = 'smile';
    mouthOpen = isCharaMouthOpen(elapsed, charaId);
  } else if (mode === 'react') {
    // 相槌は短い。笑顔+口パク(「うんうん」「へぇ〜」のイメージ)。
    expression = 'smile';
    mouthOpen = isCharaMouthOpen(elapsed, charaId);
  } else {
    expression = resolveIdleExpression(timeMs, charaId, { heatLevel });
    mouthOpen = false;
  }

  // まばたきは最後に上書き(どの表情からでも瞬きは起こる)。
  // blink 画像は mouth-closed/open の両方があるので、口の状態は保つ。
  if (allowBlink && isCharaBlinking(timeMs, charaId)) {
    expression = 'blink';
  }

  return {
    charaId,
    mode,
    expression,
    mouthOpen,
    // konta の normal 単独ファイル問題は yukkuriCharacterImagePath が吸収済み。
    imagePath: yukkuriCharacterImagePath(charaId, expression, mouthOpen),
    float,
    tiltDeg
  };
}

/* ------------------------------------------------------------------ *
 * ⑥ 3 体ぶんの状態を回すステート(唯一の可変部分)
 * ------------------------------------------------------------------ */

/**
 * @typedef {{
 *   mode: CharaMode,
 *   modeStartedAtMs: number,
 *   untilMs: number,
 *   text: string
 * }} CharaSlotState
 *
 * @typedef {{
 *   slots: Record<CharaId, CharaSlotState>,
 *   lastSpeaker: CharaId|null
 * }} CharaLiveState
 */

/**
 * 初期状態(全員 idle)。
 * @returns {CharaLiveState}
 */
export function makeInitialCharaLiveState() {
  /** @type {any} */
  const slots = {};
  for (const id of CHARA_LIVE_IDS) {
    slots[id] = { mode: 'idle', modeStartedAtMs: 0, untilMs: 0, text: '' };
  }
  return { slots, lastSpeaker: null };
}

/**
 * 期限切れのモードを idle に戻す。毎フレーム呼んでよい(冪等)。
 *
 * @param {CharaLiveState} state 破壊的に更新する
 * @param {number} nowMs
 * @returns {CharaLiveState} 同じ参照
 */
export function expireCharaModes(state, nowMs) {
  const now = Number(nowMs) || 0;
  for (const id of CHARA_LIVE_IDS) {
    const slot = state?.slots?.[id];
    if (!slot || slot.mode === 'idle') continue;
    // thinking は untilMs=Infinity で入る(AI が終わるまで続く)。
    if (Number.isFinite(slot.untilMs) && now >= slot.untilMs) {
      slot.mode = 'idle';
      slot.modeStartedAtMs = now;
      slot.untilMs = 0;
      slot.text = '';
    }
  }
  return state;
}

/**
 * 読み上げに合わせた相槌を 1 体に入れる。
 *
 * 歯止め(会場が騒がしくならないように):
 *   - 既に react/answer/thinking 中の子には重ねない(別の子を選ぶ)
 *   - 全員ふさがっていたら何もしない(無理に喋らせない)
 *
 * @param {CharaLiveState} state 破壊的に更新する
 * @param {{ commentKey: string, text?: string, nowMs: number, durationMs?: number }} input
 * @returns {CharaId|null} 実際に反応した子(誰も反応できなければ null)
 */
export function triggerCharaReaction(state, input) {
  const now = Number(input?.nowMs) || 0;
  const commentKey = String(input?.commentKey ?? '');
  const duration = Number.isFinite(input?.durationMs)
    ? Math.max(REACT_MIN_MS, Number(input.durationMs))
    : REACT_MIN_MS;

  const first = pickReactingChara(commentKey, state?.lastSpeaker ?? null);
  // first が塞がっていたら、残りを順に試す(誰か 1 体は必ず相槌を入れたい)。
  const order = [first, ...CHARA_LIVE_IDS.filter((id) => id !== first)];
  for (const id of order) {
    const slot = state?.slots?.[id];
    if (!slot) continue;
    if (slot.mode !== 'idle') continue;
    slot.mode = 'react';
    slot.modeStartedAtMs = now;
    slot.untilMs = now + duration;
    slot.text = String(input?.text ?? '');
    state.lastSpeaker = id;
    return id;
  }
  return null;
}

/**
 * 配信者の呼びかけへの返事を始める。
 *
 * 名指しがあればその子。無ければ「直前に喋った子以外」から選ぶ。
 * 名指しされた子が thinking 中でも **返事は名指し優先で上書きする**
 * (呼ばれたのに別の子が答えると会話が壊れるため)。
 *
 * @param {CharaLiveState} state 破壊的に更新する
 * @param {{ prompt: string, answer?: string, nowMs: number, durationMs?: number }} input
 * @returns {CharaId} 返事をする子
 */
export function triggerCharaAnswer(state, input) {
  const now = Number(input?.nowMs) || 0;
  const prompt = String(input?.prompt ?? '');
  const duration = Number.isFinite(input?.durationMs)
    ? Math.max(ANSWER_MIN_MS, Number(input.durationMs))
    : ANSWER_MIN_MS;

  const addressed = detectAddressedChara(prompt);
  const id = addressed || pickReactingChara(`answer:${prompt}`, state?.lastSpeaker ?? null);
  const slot = state?.slots?.[id];
  if (slot) {
    slot.mode = 'answer';
    slot.modeStartedAtMs = now;
    slot.untilMs = now + duration;
    slot.text = String(input?.answer ?? '');
    state.lastSpeaker = id;
  }
  return id;
}

/**
 * AI 思考の開始。終わりが読めないので untilMs=Infinity で入れ、
 * endCharaThinking で明示的に閉じる(finally で必ず呼ぶこと)。
 *
 * 誰が考えるか: 名指しがあればその子、無ければ たぬ姉(= AGENTS.md §3.2 の
 *   「しっかり者解説」役)。解説役が考えるのが役割として自然。
 *
 * @param {CharaLiveState} state 破壊的に更新する
 * @param {{ nowMs: number, charaId?: CharaId|null, prompt?: string }} input
 * @returns {CharaId} 考え込む子
 */
export function startCharaThinking(state, input) {
  const now = Number(input?.nowMs) || 0;
  const explicit = input?.charaId && CHARA_LIVE_IDS.includes(input.charaId) ? input.charaId : null;
  const id = explicit || detectAddressedChara(String(input?.prompt ?? '')) || 'tanunee';
  const slot = state?.slots?.[id];
  if (slot) {
    slot.mode = 'thinking';
    slot.modeStartedAtMs = now;
    slot.untilMs = Infinity;
    slot.text = '';
  }
  return /** @type {CharaId} */ (id);
}

/**
 * AI 思考の終了。thinking 中の子だけを idle に戻す。
 * charaId 省略で「thinking 中の全員」を解除する(取りこぼし防止)。
 *
 * @param {CharaLiveState} state 破壊的に更新する
 * @param {{ nowMs: number, charaId?: CharaId|null }} input
 * @returns {CharaId[]} 解除した子
 */
export function endCharaThinking(state, input) {
  const now = Number(input?.nowMs) || 0;
  const only = input?.charaId ?? null;
  /** @type {CharaId[]} */
  const cleared = [];
  for (const id of CHARA_LIVE_IDS) {
    if (only && id !== only) continue;
    const slot = state?.slots?.[id];
    if (!slot || slot.mode !== 'thinking') continue;
    slot.mode = 'idle';
    slot.modeStartedAtMs = now;
    slot.untilMs = 0;
    slot.text = '';
    cleared.push(id);
  }
  return cleared;
}

/**
 * 3 体ぶんの描画モデルを一度に作る。描画側は毎フレームこれを呼ぶだけでよい。
 *
 * @param {CharaLiveState} state
 * @param {{ timeMs: number, heatLevel?: number, reducedMotion?: boolean }} opts
 * @returns {Array<ReturnType<typeof resolveCharaLiveLook> & { displayName: string, text: string }>}
 */
export function buildCharaLiveRenderModel(state, opts) {
  const timeMs = Number(opts?.timeMs) || 0;
  return CHARA_LIVE_MEMBERS.map((member) => {
    const id = /** @type {CharaId} */ (member.id);
    const slot = state?.slots?.[id] || {
      mode: 'idle',
      modeStartedAtMs: 0,
      untilMs: 0,
      text: ''
    };
    const look = resolveCharaLiveLook({
      charaId: id,
      mode: /** @type {CharaMode} */ (slot.mode),
      timeMs,
      modeStartedAtMs: slot.modeStartedAtMs,
      heatLevel: opts?.heatLevel,
      reducedMotion: opts?.reducedMotion
    });
    return { ...look, displayName: member.displayName, text: slot.text || '' };
  });
}
