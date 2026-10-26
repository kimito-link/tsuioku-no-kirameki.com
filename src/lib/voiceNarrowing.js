// voiceNarrowing.js — 弱いPCで読み上げの声の種類を絞る(P3 下準備・2026-10-22)。DOM も chrome API も触らない純関数。
//
// ★まだどこからも呼ばない(下書き)。使うかどうか・何人に絞るかは、レッツノートで P1 の計器
//   (初めての声の件数と最大時間)を測ってから、りんくさんと数字を見て決める(計画書 §9)。
//
// りんくさんの条件(計画書 §9):
//   1. 絞るのは弱いPCのときだけ。速いPCは今の割り当てのまま。
//   2. 絞り方は固定。版を上げても常連の「いつもの声」が入れ替わらないこと。
//      → 候補は下の固定表だけ(エンジンにある全スタイルを数えない)。表の順番と中身は変えない。
//        変えると絞った人全員の声が変わるので、変えるときは版を分けて changelog に書く。
//      → 表の中での割り当ては assignVoiceForUser(FNV-1a の決定論ハッシュ)をそのまま使う。

/**
 * 絞ったときに使う声(VOICEVOX の styleId)。固定。順番も意味を持つ(ハッシュの割り当て先)。
 *   3=ずんだもん ノーマル / 2=四国めたん ノーマル / 8=春日部つむぎ / 10=雨晴はう / 13=青山龍星 / 14=冥鳴ひまり
 *   (どれも VOICEVOX 標準の早い番号で、ささやき系を含まない)
 */
export const VOICE_NARROW_STYLE_IDS = Object.freeze([3, 2, 8, 10, 13, 14]);

/** 2回目以降の合成がこれ以上かかるPCを「弱い」とみなす(ms)。自宅PC 120〜160ms、ノートPC 700ms。 */
export const VOICE_WEAK_PC_WARM_SYNTH_MS = 500;

/** 初めての声の合成がこれ以上かかったら「弱い」とみなす(ms)。ノートPC 7.7秒。 */
export const VOICE_WEAK_PC_COLD_SYNTH_MS = 3000;

/**
 * 2回目以降の合成を、これだけの件数測ってから判定する(2026-10-26)。
 *   PC 実測で、速い PC が最初の数件(声の準備と重なった回)だけで「弱い」と記録された。
 */
export const VOICE_WEAK_PC_MIN_WARM_SAMPLES = 5;

/** 速い PC と分かったら、誤って残った「弱い」の記録を消す件数。 */
export const VOICE_FAST_PC_MIN_WARM_SAMPLES = 10;

/**
 * P1 の計器から「弱いPC」かを決める。まだ測れていなければ false(=絞らない・今のまま)。
 *   2回目以降の合成は VOICE_WEAK_PC_MIN_WARM_SAMPLES 件そろってから見る。
 *   計器(voiceStageTiming)は、声の準備と重なった回を warm/cold に入れない。
 * @param {{ warmSynthEmaMs?: number, warmSynthSamples?: number, coldSynthMaxMs?: number }} diag
 * @returns {boolean}
 */
export function isWeakVoicePc(diag) {
  const warm = Number(diag?.warmSynthEmaMs);
  const samples = Number(diag?.warmSynthSamples) || 0;
  const cold = Number(diag?.coldSynthMaxMs);
  if (samples >= VOICE_WEAK_PC_MIN_WARM_SAMPLES && Number.isFinite(warm) && warm >= VOICE_WEAK_PC_WARM_SYNTH_MS) return true;
  if (Number.isFinite(cold) && cold >= VOICE_WEAK_PC_COLD_SYNTH_MS) return true;
  return false;
}

/**
 * 割り当てに使う声の一覧を返す。弱いPCでは固定表のうちエンジンにある声だけ(表の順番のまま)。
 *   固定表の声が2つ未満しか無いエンジン(古い版・別エンジン)では絞らずにそのまま返す。
 * @param {readonly number[]} availableStyleIds エンジンにある声(listVoicevoxStyleIds の結果)
 * @param {boolean} weak
 * @returns {number[]}
 */
export function narrowVoiceStyleIds(availableStyleIds, weak) {
  const available = Array.isArray(availableStyleIds) ? availableStyleIds.map(Number) : [];
  if (!weak) return available;
  const have = new Set(available);
  const narrowed = VOICE_NARROW_STYLE_IDS.filter((id) => have.has(id));
  return narrowed.length >= 2 ? narrowed : available;
}

export { KEY_VOICE_NARROW_MODE, KEY_VOICE_WEAK_PC } from './voiceKeys.js';

/**
 * 絞り込みの設定。既定は 'auto'(v0.1.1768・りんく判断: 遅い PC と分かった時だけ絞る)。
 *   PC 実測でグラボ無しは新しい人の声の準備が最大13.6秒かかり、32件飛ばした。速い PC は変わらない。
 *   自分で「しない」を選んだ人('off' が保存されている)はそのまま。
 */
export const VOICE_NARROW_MODES = Object.freeze(['off', 'auto', 'on']);

/**
 * @param {unknown} raw
 * @returns {'off'|'auto'|'on'}
 */
export function normalizeVoiceNarrowMode(raw) {
  return raw === 'off' || raw === 'on' ? raw : 'auto';
}

/**
 * 設定と「このPCは遅い」の記録から、今回絞るかを決める。
 * @param {unknown} mode
 * @param {unknown} weakRemembered
 * @returns {boolean}
 */
export function isVoiceNarrowActive(mode, weakRemembered) {
  const m = normalizeVoiceNarrowMode(mode);
  return m === 'on' || (m === 'auto' && weakRemembered === true);
}

/**
 * 読み上げ ON のときに呼ぶ。使う声を決め、絞るときは裏でモデルを先に読み込む(待たない)。
 *   設定が読めない・先読みが失敗しても、読み上げは今までどおり続ける。
 * @param {readonly number[]} allStyleIds
 * @param {{
 *   readSettings: () => Promise<{ mode?: unknown, weak?: unknown }>,
 *   initSpeaker?: (styleId: number) => Promise<unknown>
 * }} deps
 * @returns {Promise<{ styleIds: number[], narrowed: boolean }>}
 */
export async function prepareVoiceStyleIds(allStyleIds, deps) {
  const all = Array.isArray(allStyleIds) ? allStyleIds.map(Number) : [];
  /** @type {{ mode?: unknown, weak?: unknown }} */
  let settings = {};
  try {
    settings = (await deps.readSettings()) || {};
  } catch {
    settings = {};
  }
  const active = isVoiceNarrowActive(settings.mode, settings.weak);
  const styleIds = narrowVoiceStyleIds(all, active);
  const narrowed = active && styleIds.length < all.length;
  if (narrowed && typeof deps.initSpeaker === 'function') {
    const init = deps.initSpeaker;
    // エンジンは1件ずつ処理するので、順番に読み込む(並べて投げない)。
    void (async () => {
      for (const id of styleIds) {
        try { await init(id); } catch { /* 先読みの失敗は無視(初回の合成で読み込まれる) */ }
      }
    })();
  }
  return { styleIds, narrowed };
}

/**
 * 合成のたびに呼ぶ。遅いPCと分かったら一度だけ記録する('auto' のとき次の読み上げ ON から絞る)。
 *   同じセッションの途中で声を入れ替えない(常連の声が配信の途中で変わらないように)。
 * @param {{ warmSynthEmaMs?: number, coldSynthMaxMs?: number }} diag
 * @param {{ saved: boolean }} state
 * @param {(weak: true) => unknown} write
 */
export function rememberWeakVoicePc(diag, state, write) {
  if (state.saved || !isWeakVoicePc(diag)) return;
  state.saved = true;
  Promise.resolve().then(() => write(true)).catch(() => { /* 記録の失敗は読み上げに影響させない */ });
}

/**
 * 速い PC と十分に分かったか(2回目以降の合成が十分な件数そろって速く、初めての声も遅くない)。
 * @param {{ warmSynthEmaMs?: number, warmSynthSamples?: number, coldSynthMaxMs?: number }} diag
 * @returns {boolean}
 */
export function isFastVoicePc(diag) {
  const warm = Number(diag?.warmSynthEmaMs);
  const samples = Number(diag?.warmSynthSamples) || 0;
  const cold = Number(diag?.coldSynthMaxMs) || 0;
  return samples >= VOICE_FAST_PC_MIN_WARM_SAMPLES
    && Number.isFinite(warm) && warm >= 0 && warm < VOICE_WEAK_PC_WARM_SYNTH_MS
    && cold < VOICE_WEAK_PC_COLD_SYNTH_MS;
}

/**
 * 2026-10-26: 「弱い」と誤って記録された速い PC の記録を一度だけ消す(PC 実測で起きた)。
 *   消さないと、短いコメントまで少しずつ受け取り、かえって遅くなる(0.3秒→0.7秒)。
 * @param {{ warmSynthEmaMs?: number, warmSynthSamples?: number, coldSynthMaxMs?: number }} diag
 * @param {{ cleared?: boolean }} state
 * @param {() => unknown} clear
 */
export function forgetWeakVoicePcIfFast(diag, state, clear) {
  if (state.cleared || !isFastVoicePc(diag)) return;
  state.cleared = true;
  Promise.resolve().then(() => clear()).catch(() => { /* 記録の失敗は読み上げに影響させない */ });
}
