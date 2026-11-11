/**
 * 会場の吹き出しと読み上げの声を「ぴったり・テンポよく」合わせる(2026-11-12 りんく「全部のプラットフォーム
 * 読み上げと吹き出しのタイミングをてんぽよくドンピシャででるようにして」)。
 *
 * ★v0.1.1979 の「声と一緒に出す(最大3秒待ち)」に残っていた2つのずれ:
 *   1. 3秒待って声づくりの途中だった件は、吹き出しを先に出して声を後から鳴らしていた(=ずれる・timedOutKeptVoice)。
 *      → 声づくりの途中なら、声が始まるまで待ち続ける(上限 VENUE_BUBBLE_VOICE_HOLD_MAX_MS)。
 *   2. 前に読む件が詰まっていて声が3秒以内に始まらない件も3秒待たせ、結局読まずに吹き出しだけ出していた(=テンポが悪い)。
 *      → 列に入れた瞬間に「声が始まるまでの見込み」を出し、3秒を超えるなら待たせずすぐ吹き出しだけ出す
 *        (大事なもの=ギフト・配信者・初コメ・スパチャ等は今までどおり読む)。
 * ★吹き出しを声に頼らせない決まり(v0.1.757)は守る: 声が最近鳴っていない・声づくりが続けて失敗しているときは待たない。
 *
 * このファイルは会場(venueBar.js)と自動試験(scripts/voice-bubble-sync-sim.mjs)が同じものを使う。
 * 全サービス(ニコ生・YouTube・Twitch・Kick・ABEMA・ふわっち・SHOWROOM・ミクチャ・TikTok)は同じ venueBar.js の会場を使う。
 */

import { VENUE_BUBBLE_VOICE_HOLD_MS } from './venueBubbleVoiceHold.js';

/** 声づくりの途中で待ち続ける上限(届いてからの ms)。読み上げの鮮度(8秒)より短く。 */
export const VENUE_BUBBLE_VOICE_HOLD_MAX_MS = 6000;
/**
 * 列に入れた時の見込みがこれを超えたら、待たせず読まずに吹き出しだけ出す(ms)。
 *   自動試験(venueBubbleVoiceSync.sim.test.js・10サービスの来方×GPU/CPU)で 3000/2000/1500 を比べて 2000 に決めた:
 *   GPU は読める件がほぼ同じ(Kick 134→132件/2分)のまま、届いて吹き出しまでの95%が 2.0〜2.2秒→1.4〜1.8秒に縮む。
 */
export const VENUE_BUBBLE_VOICE_LATE_MS = 2000;
/** 「ぴったり」とみなすずれ(ms)。これより吹き出しが先に出たら「先出し」と数える。 */
export const VENUE_BUBBLE_VOICE_SYNC_OK_MS = 300;
/** 声を待たせた件が上限まで鳴らなかった回数がこれに達したら、声が鳴るまで待たせない。 */
export const VENUE_BUBBLE_VOICE_FAIL_STREAK_MAX = 2;
/** 計器の見本の数(直近だけ) */
const SAMPLE_MAX = 200;

/**
 * 会場1つぶんの状態(声が最後に鳴った時刻・失敗の連続・計器)。
 */
export function createVenueBubbleVoiceSyncState() {
  return {
    lastAudioStartAt: 0,
    failStreak: 0,
    diag: {
      held: 0,
      shownWithVoice: 0,
      droppedWhileHeld: 0,
      timedOutDropped: 0,
      timedOutKeptVoice: 0,
      /** 見込みが3秒を超えたので待たせず、読まずに吹き出しだけ出した数 */
      skippedLate: 0,
      /** 3秒を超えて声を待ち続け、声と一緒に出せた数 */
      heldPastHold: 0,
      /** 上限まで待っても鳴らず、吹き出しだけ出した数 */
      capRevealed: 0
    },
    /** @type {Array<{ arrivedAt: number, revealedAt: number, audioAt: number }>} 直近の見本 */
    samples: []
  };
}

/**
 * 1件ぶんの見本(届いた時刻・吹き出しが出た時刻・声が始まった時刻[鳴らなければ 0])を足す。
 * @param {ReturnType<typeof createVenueBubbleVoiceSyncState>} state
 * @param {{ arrivedAt: number, revealedAt: number, audioAt: number }} s
 */
export function noteBubbleVoiceSample(state, s) {
  if (!state || !s) return;
  const arrivedAt = Number(s.arrivedAt) || 0;
  const revealedAt = Number(s.revealedAt) || 0;
  if (arrivedAt <= 0 || revealedAt <= 0) return;
  state.samples.push({ arrivedAt, revealedAt, audioAt: Number(s.audioAt) || 0 });
  if (state.samples.length > SAMPLE_MAX) state.samples.splice(0, state.samples.length - SAMPLE_MAX);
}

/** @param {number[]} xs @param {number} p */
function pct(xs, p) {
  if (!xs.length) return -1;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))];
}

/**
 * 計器のまとめ。gap = 声の始まり − 吹き出しが出た時刻(+ なら吹き出しが先に出た)。
 * @param {ReturnType<typeof createVenueBubbleVoiceSyncState>} state
 */
export function summarizeBubbleVoiceSync(state) {
  const samples = Array.isArray(state?.samples) ? state.samples : [];
  const voiced = samples.filter((s) => s.audioAt > 0);
  const gaps = voiced.map((s) => s.audioAt - s.revealedAt);
  const absGaps = gaps.map((g) => Math.abs(g));
  const tempo = samples.map((s) => Math.max(0, s.revealedAt - s.arrivedAt));
  const early = gaps.filter((g) => g > VENUE_BUBBLE_VOICE_SYNC_OK_MS).length;
  const late = gaps.filter((g) => g < -VENUE_BUBBLE_VOICE_SYNC_OK_MS).length;
  const out = {
    n: samples.length,
    voiced: voiced.length,
    gapP50: Math.round(pct(absGaps, 0.5)),
    gapP95: Math.round(pct(absGaps, 0.95)),
    gapMax: absGaps.length ? Math.round(Math.max(...absGaps)) : -1,
    /** 吹き出しが声より 0.3秒以上先に出た件 */
    early,
    /** 声が吹き出しより 0.3秒以上先に鳴った件 */
    late,
    tempoP50: Math.round(pct(tempo, 0.5)),
    tempoP95: Math.round(pct(tempo, 0.95)),
    diag: { ...(state?.diag || {}) },
    line: ''
  };
  if (samples.length) {
    const sec = (/** @type {number} */ ms) => (ms < 0 ? '—' : `${(ms / 1000).toFixed(1)}秒`);
    out.line = `吹き出しと声: 直近${out.n}件中 声あり${out.voiced}件・ずれ 中央${out.gapP50 < 0 ? '—' : `${out.gapP50}ms`}/最大${out.gapMax < 0 ? '—' : `${out.gapMax}ms`}`
      + `・先出し${out.early}件・届いて吹き出しまで 中央${sec(out.tempoP50)}/95%${sec(out.tempoP95)}`
      + `・読まずすぐ出し${out.diag.skippedLate || 0}件`;
  }
  return out;
}

/**
 * 吹き出しを声が始まるまで待たせるか(2026-11-12)。
 *   v0.1.1979 は「60秒以内に声が鳴った」ときだけ待たせていたので、静かな配信(1分に1件より少ない)や開いて最初の
 *   コメントは吹き出しが先に出て声が後から鳴っていた。待ちには上限(VENUE_BUBBLE_VOICE_HOLD_MAX_MS)があり、
 *   上限まで鳴らなかったことが続けば待たせない(failStreak)ので、「声が鳴った実績」を条件にしなくても
 *   VOICEVOX が止まったときに吹き出しが出なくなることはない(v0.1.757 の約束)。
 * @param {{ voiceEnabled: boolean, primeBurst?: boolean, failStreak?: number }} s
 */
export function shouldHoldBubbleForVoiceSync(s) {
  if (s?.voiceEnabled !== true || s?.primeBurst === true) return false;
  return (Number(s?.failStreak) || 0) < VENUE_BUBBLE_VOICE_FAIL_STREAK_MAX;
}

/**
 * 声が始まるまでの見込みが長すぎて、待たせずに読まない(吹き出しだけすぐ出す)か。
 *   前に何も無い件(今すぐ声づくりに入る件)は読む(遅い PC で1件も鳴らなくなるのを防ぐ)。大事なものは読む。
 * @param {{ estimateMs: number, important?: boolean, aheadCount: number }} s
 *   estimateMs = VoicePlayer.estimateStartDelayMs の答え(-1 = 見積もれない) / aheadCount = 前に読む件(再生中を含む)
 */
export function shouldSkipVoiceAsLate(s) {
  if (s?.important) return false;
  if (!(Number(s?.aheadCount) > 0)) return false;
  const est = Number(s?.estimateMs);
  if (!Number.isFinite(est) || est < 0) return false;
  return est > VENUE_BUBBLE_VOICE_LATE_MS;
}

/**
 * 待たせている吹き出しが 3秒を過ぎた時の扱い。
 * @param {'dropped'|'inflight'|'not-queued'} dropResult VoicePlayer.dropQueuedUnstarted の答え(dropped なら外れた)
 * @returns {'reveal'|'keep-holding'} keep-holding = 声づくりの途中なので声が始まるまで待ち続ける(上限まで)
 */
export function decideHeldBubbleAfterHold(dropResult) {
  return dropResult === 'dropped' ? 'reveal' : 'keep-holding';
}

/**
 * 発言1件の吹き出しと声を始める(会場の processSpeechRows から1件ずつ呼ぶ)。
 * @param {ReturnType<typeof createVenueBubbleVoiceSyncState>} state
 * @param {any} speech
 * @param {{
 *   voicePlayer: any,
 *   primeBurst: boolean,
 *   arrivedAt: number,
 *   now?: () => number,
 *   setTimer?: (fn: () => void, ms: number) => any,
 *   clearTimer?: (t: any) => void,
 *   isOpen: () => boolean,
 *   showBubble: (speech: any) => any,
 *   onSpeaking: (bubble: any) => void,
 *   onDone: (bubble: any) => void,
 *   onResolved: (bubble: any) => void,
 *   onCharaSpoken?: () => void,
 *   onCharaEnd?: () => void,
 *   onAudible?: () => void,
 *   itemFields?: Record<string, any>,
 *   lease?: { whenMine: (liveId: string, mine: () => void, other: () => void) => void, liveId: string } | null,
 *   onReaderYield?: () => void
 * }} ctx
 * @returns {boolean} 吹き出しを出した(または出す予定)か
 */
export function startVenueSpeechBubbleVoice(state, speech, ctx) {
  const now = ctx.now || Date.now;
  const setTimer = ctx.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = ctx.clearTimer || ((t) => clearTimeout(t));
  const vp = ctx.voicePlayer;
  const diag = state.diag;
  const arrivedAt = Number(ctx.arrivedAt) || now();
  const holdForVoice = shouldHoldBubbleForVoiceSync({ voiceEnabled: !!vp?.enabled, primeBurst: ctx.primeBurst, failStreak: state.failStreak });
  let bubble = holdForVoice ? null : ctx.showBubble(speech);
  const shown = !!bubble || holdForVoice;
  let revealedAt = holdForVoice ? 0 : now();
  let audioAt = 0;
  let sampled = false;
  let holdTimer = /** @type {any} */ (0);
  let capTimer = /** @type {any} */ (0);
  const clearHoldTimers = () => {
    if (holdTimer) { clearTimer(holdTimer); holdTimer = 0; }
    if (capTimer) { clearTimer(capTimer); capTimer = 0; }
  };
  const sample = () => {
    if (sampled || !revealedAt) return;
    sampled = true;
    noteBubbleVoiceSample(state, { arrivedAt, revealedAt, audioAt });
  };
  const reveal = () => {
    if (revealedAt) return;
    revealedAt = now();
    clearHoldTimers();
    if (ctx.isOpen()) bubble = ctx.showBubble(speech);
  };
  if (holdForVoice) diag.held += 1;
  if (!vp?.enabled) {
    if (bubble) sample();
    return shown;
  }
  /** 待たせている最中に外されたか(計器: 3秒の見切りとは別に数える) */
  let holding = holdForVoice;
  const onDropped = () => {
    if (!revealedAt && holding) diag.droppedWhileHeld += 1;
    holding = false;
    reveal();
    if (bubble) ctx.onResolved(bubble);
    ctx.onCharaEnd?.();
    sample();
  };
  const voiceIt = () => {
    vp.enqueue([{
      ...(ctx.itemFields || {}),
      kind: 'comment',
      userId: speech.userId,
      nickname: speech.name,
      key: speech.key,
      text: speech.text,
      onAudible: ctx.onAudible,
      onAudioStart: () => {
        state.lastAudioStartAt = now();
        state.failStreak = 0;
        audioAt = now();
        if (!revealedAt) {
          diag.shownWithVoice += 1;
          if (holding && audioAt - arrivedAt > VENUE_BUBBLE_VOICE_HOLD_MS) diag.heldPastHold += 1;
        }
        holding = false;
        reveal();
        if (bubble) ctx.onSpeaking(bubble);
        ctx.onCharaSpoken?.();
        sample();
      },
      onAudioEnd: () => {
        if (bubble) ctx.onDone(bubble);
        ctx.onCharaEnd?.();
      },
      onDropped
    }]);
    if (!holdForVoice || revealedAt) return;
    // 列に入れた瞬間の見込み: 3秒を超えるなら待たせず、読まずに吹き出しだけ出す(テンポ)。
    const est = typeof vp.estimateStartDelayMs === 'function' ? vp.estimateStartDelayMs(onDropped) : null;
    if (est && shouldSkipVoiceAsLate({ estimateMs: est.ms, important: est.important, aheadCount: est.ahead })) {
      if (vp.dropQueuedUnstarted(onDropped) === 'dropped') {
        diag.skippedLate += 1;
        return; // onDropped が吹き出しを出した
      }
    }
  };
  if (holdForVoice) {
    holdTimer = setTimer(() => {
      holdTimer = 0;
      if (revealedAt) return;
      // 3秒待っても声が始まらない: まだ声づくりを頼んでいない件は読まずに外す(onDropped が吹き出しを出す)。
      //   声づくりの途中なら、吹き出しを先に出さず声が始まるまで待ち続ける(上限まで)。
      holding = false; // ここから先に外れた件は「3秒の見切り」側で数える
      const r = vp.dropQueuedUnstarted(onDropped);
      if (r === 'dropped') { diag.timedOutDropped += 1; return; }
      diag.timedOutKeptVoice += 1;
      if (decideHeldBubbleAfterHold(r) === 'reveal') { reveal(); return; }
      holding = true;
      capTimer = setTimer(() => {
        capTimer = 0;
        if (revealedAt) return;
        holding = false;
        diag.capRevealed += 1;
        state.failStreak += 1;
        // 上限まで鳴らなかった: 声はもう読まない(後から鳴るとずれる)。吹き出しだけ出す。
        const gone = typeof vp.dropQueuedAny === 'function' ? vp.dropQueuedAny(onDropped) : 'not-queued';
        if (gone !== 'dropped') reveal();
        sample();
      }, Math.max(0, VENUE_BUBBLE_VOICE_HOLD_MAX_MS - (now() - arrivedAt)));
    }, VENUE_BUBBLE_VOICE_HOLD_MS);
  }
  // v0.1.1794: コメビュが同じ配信を読んでいれば鳴らさない(吹き出しは声なしの寿命へ)。
  if (!ctx.lease) voiceIt();
  else ctx.lease.whenMine(ctx.lease.liveId, voiceIt, () => { reveal(); if (bubble) ctx.onResolved(bubble); ctx.onReaderYield?.(); sample(); });
  if (!holdForVoice && !revealedAt) sample();
  return shown;
}
