import { judgeValueFreshness } from './anomalyVerdict.js';
import { canonicalLabel, fromAliveFailure } from './voiceFailureTaxonomy.js';

/**
 * ★v0.1.1328: この診断を「新鮮」とみなす上限。これを大きく超えたら化石値として数値を伏せる。
 *   judgeValueFreshness は 10分以上で level='bad'(化石値)を返す。
 *   読み上げ診断は3秒 min-gap で書かれるので、60秒あれば通常運用では十分に新しい。
 *
 * ★v0.1.1367: healthCells.js の VOICE_LIVE_JUDGE_WINDOW_MS(90秒・旧同名)と統合しないこと。
 *   こちらは judgeValueFreshness に渡す【基準値】で、化石値と出る実効境界は10分。
 *   向こうは live 固着判定を適用するか否かの【境界そのもの】(実効90秒)。名前が同じだっただけで別物。
 */
export const VOICE_DIAG_FRESH_MS = 60_000;

/**
 * 会場モード(comeview)の読み上げ発話キュー診断。リアルタイム性(「たまに遅れて出る」)の
 * 真因切り分け用の純観測値を組み立てる純関数群。記録/発話には一切触れない。
 *
 * 背景: voiceReadQueue.js は混雑時の速度ブースト/先読み深さ/stale drop まで実装済みで設計は良好だが、
 * 「たまに遅れる」が起きた瞬間に【キューが詰まっているのか・古い分を捨てているのか・合成が遅いのか】を
 * 観測できないと憶測でパラメータを触ることになる。そこで comeview が保持する _voiceDiag を状態速報へ
 * 集約し、F12 不要で AI 共有できるようにする(popup 診断ブリッジと同思想)。
 *
 * @typedef {{
 *   enabled: boolean,            // 読み上げ ON か
 *   queueNow: number,            // 現在の待機件数
 *   queueMax: number,            // セッション中の最大待機件数(詰まりのピーク)
 *   spokenTotal: number,         // 発話完了数
 *   staleDropTotal: number,      // 鮮度切れで捨てた件数(リアルタイム維持のための間引き)
 *   playbackTimeoutTotal: number,// 再生 watchdog 発火数(ended/error が来ず安全網で打ち切った=異常)
 *   lastSpokenBase: number,      // 最後に発話した時刻(epoch ms・0=未発話)
 *   lastSynthMs: number,         // 直近の合成所要 ms(-1=未計測)
 *   lastDepth: number,           // 直近の先読み深さ
 *   lastSpeedBoost: number,      // 直近の速度ブースト
 *   lastPhase: string,           // v0.1.895: drainVoiceQueue が最後に到達したフェーズ(固着位置の計器)
 *   lastPhaseAt: number,         // v0.1.895: lastPhase に到達した時刻(epoch ms・0=未到達)
 *   lastE2eMs: number,           // v0.1.1088: 直近1件の「到着→発声」体感遅延ms(-1=未計測)
 *   e2eAvgMs: number,            // v0.1.1088: 体感遅延のEMA平均ms(-1=未計測)
 *   mergeTotal: number,          // v0.1.1088: mergeRepeatedVoiceItem で吸収した累計(同文統合の実効計器)
 *   serviceTimeEmaMs: number,    // 2026-07-24計器(段階0=shadow): 1件あたり処理時間の実測EMA(-1=未計測)
 *   effectiveQueueMax: number,   // 2026-07-24計器: そこから算出した実効上限(表示のみ・未適用)
 *   rateClampTotal: number,      // 2026-07-24計器: playbackRateが上限1.35で飽和した累計回数
 *   voicedRatio: number,         // 2026-07-24計器: spokenTotal/(spokenTotal+staleDropTotal)(-1=未計測)
 *   synthWaitEmaMs: number,      // 2026-07-28計器: 合成待ち時間のEMA(-1=未計測。coldsynth判定の核心)
 *   playPrepEmaMs: number,       // 2026-07-28計器: 再生準備待ち(blob化〜'playing')のEMA(-1=未計測)
 *   playbackEmaMs: number,       // 2026-07-28計器: 実再生時間のEMA(-1=未計測)
 *   expectedPlayEmaMs: number,   // 2026-07-28計器: WAV申告再生時間のEMA(-1=未計測。仮説Aの物差し)
 *   arrivalPerMin: number,       // 2026-07-28計器: 需要(コメント到着レート・件/分・-1=未計測)
 *   voicedRecentRatio: number,   // 2026-07-28計器: 直近voiced率EMA(累計voicedRatioの世代錯誤を補う)
 *   lastSustainedBoost: number,  // v0.1.1222計器: 持続過負荷(pressure由来)で上乗せした速度(0=未適用)
 *   sustainedBoostTotal: number, // v0.1.1222計器: キュー長では出せない速度を実際に足した累計件数
 *   synthFailReasons: Record<string, number>, // v0.1.1224計器: 合成失敗の理由別内訳(原因を名指しする)
 *   dropCountGateTotal: number,  // 2026-07-28計器: 件数ゲート最古dropの累計(3分別のうちの1つ)
 *   dropHeadStaleTotal: number,  // 2026-07-28計器: 先頭itemの単体stale破棄の累計
 *   dropSweepStaleTotal: number, // 2026-07-28計器: 全stale時の先頭群破棄の累計
 *   synthNullTotal: number,      // 2026-08-01計器: 合成がnullで返り読まれずに消えた累計
 *   synthNullNearTimeout: number,// 同上のうち時間切れ(8000ms上限付近)由来の件数
 *   audioBlockedTotal: number,   // v0.1.1327計器: ブラウザの自動再生ブロック(NotAllowedError)で鳴らせなかった累計
 *   lastEnableFailReason: string,// v0.1.1331計器: 読み上げONに失敗した理由(timeout/refused/http-error/no-fetch)
 *   enableFailTotal: number,     // v0.1.1331計器: 読み上げONに失敗した累計回数
 *   lagVerdict: string,          // 2026-07-28計器: 体感遅延の真因判定トークン(印字専用・挙動に不使用)
 *   diagBornAt: number           // 2026-07-28計器: この診断stateが生まれた時刻(epoch ms・世代識別用)
 * }} VoiceDiagState
 */

import { formatVoiceSynthFailureLine } from './voiceSynthFailure.js';
import {
  adviseVoiceSynthFailure,
  formatVoiceSynthFailureReasonLine
} from './voiceSynthFailureReason.js';

/** 初期 voice 診断 state。 */
export function makeInitialVoiceDiag() {
  return {
    enabled: false,
    queueNow: 0,
    queueMax: 0,
    spokenTotal: 0,
    staleDropTotal: 0,
    playbackTimeoutTotal: 0,
    lastSpokenBase: 0,
    lastSynthMs: -1,
    lastDepth: 0,
    lastSpeedBoost: 0,
    lastPhase: '',
    lastPhaseAt: 0,
    lastE2eMs: -1,
    e2eAvgMs: -1,
    mergeTotal: 0,
    serviceTimeEmaMs: -1,
    effectiveQueueMax: 8,
    rateClampTotal: 0,
    voicedRatio: -1,
    synthWaitEmaMs: -1,
    playPrepEmaMs: -1,
    playbackEmaMs: -1,
    expectedPlayEmaMs: -1,
    arrivalPerMin: -1,
    voicedRecentRatio: -1,
    lastSustainedBoost: 0,
    sustainedBoostTotal: 0,
    synthFailReasons: {},
    dropCountGateTotal: 0,
    dropHeadStaleTotal: 0,
    dropSweepStaleTotal: 0,
    // v0.1.1213: 合成が null で返って消えた件(時間切れ内訳つき)。
    synthNullTotal: 0,
    synthNullNearTimeout: 0,
    // v0.1.1327: 自動再生ブロックで鳴らせなかった件。「読み上げONなのに無音」の切り分け用
    //   (合成は成功しているのに音が出ない=ブラウザ側の制約、という状態を名指しする)。
    audioBlockedTotal: 0,
    // v0.1.1331: 「押しても一瞬で戻る」の理由。画面にしか出していなかったため
    //   ユーザー報告に理由が乗らず、原因特定ができなかった反省から計器へ載せる。
    lastEnableFailReason: '',
    enableFailTotal: 0,
    lagVerdict: '',
    diagBornAt: 0
  };
}

/**
 * storage 書き込み用の軽量スナップショット(ago は読み手側で算出するため base を渡す)。
 * @param {Partial<VoiceDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {VoiceDiagState & { capturedAt: number, source: string }}
 */
export function buildVoiceDiagSnapshot(diag, nowMs) {
  const base = makeInitialVoiceDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return {
    enabled: !!d.enabled,
    queueNow: num(d.queueNow, base.queueNow),
    queueMax: num(d.queueMax, base.queueMax),
    spokenTotal: num(d.spokenTotal, base.spokenTotal),
    staleDropTotal: num(d.staleDropTotal, base.staleDropTotal),
    playbackTimeoutTotal: num(d.playbackTimeoutTotal, base.playbackTimeoutTotal),
    lastSpokenBase: num(d.lastSpokenBase, base.lastSpokenBase),
    lastSynthMs: num(d.lastSynthMs, base.lastSynthMs),
    lastDepth: num(d.lastDepth, base.lastDepth),
    lastSpeedBoost: num(d.lastSpeedBoost, base.lastSpeedBoost),
    lastPhase: String(d.lastPhase || base.lastPhase),
    lastPhaseAt: num(d.lastPhaseAt, base.lastPhaseAt),
    lastE2eMs: num(d.lastE2eMs, base.lastE2eMs),
    e2eAvgMs: num(d.e2eAvgMs, base.e2eAvgMs),
    mergeTotal: num(d.mergeTotal, base.mergeTotal),
    serviceTimeEmaMs: num(d.serviceTimeEmaMs, base.serviceTimeEmaMs),
    effectiveQueueMax: num(d.effectiveQueueMax, base.effectiveQueueMax),
    rateClampTotal: num(d.rateClampTotal, base.rateClampTotal),
    voicedRatio: num(d.voicedRatio, base.voicedRatio),
    synthWaitEmaMs: num(d.synthWaitEmaMs, base.synthWaitEmaMs),
    playPrepEmaMs: num(d.playPrepEmaMs, base.playPrepEmaMs),
    playbackEmaMs: num(d.playbackEmaMs, base.playbackEmaMs),
    expectedPlayEmaMs: num(d.expectedPlayEmaMs, base.expectedPlayEmaMs),
    synthFailReasons:
      d.synthFailReasons && typeof d.synthFailReasons === 'object' && !Array.isArray(d.synthFailReasons)
        ? { ...d.synthFailReasons }
        : base.synthFailReasons,
    lastSustainedBoost: num(d.lastSustainedBoost, base.lastSustainedBoost),
    sustainedBoostTotal: num(d.sustainedBoostTotal, base.sustainedBoostTotal),
    arrivalPerMin: num(d.arrivalPerMin, base.arrivalPerMin),
    voicedRecentRatio: num(d.voicedRecentRatio, base.voicedRecentRatio),
    synthNullTotal: num(d.synthNullTotal, base.synthNullTotal),
    synthNullNearTimeout: num(d.synthNullNearTimeout, base.synthNullNearTimeout),
    audioBlockedTotal: num(d.audioBlockedTotal, base.audioBlockedTotal),
    lastEnableFailReason: String(d.lastEnableFailReason || base.lastEnableFailReason),
    enableFailTotal: num(d.enableFailTotal, base.enableFailTotal),
    dropCountGateTotal: num(d.dropCountGateTotal, base.dropCountGateTotal),
    dropHeadStaleTotal: num(d.dropHeadStaleTotal, base.dropHeadStaleTotal),
    dropSweepStaleTotal: num(d.dropSweepStaleTotal, base.dropSweepStaleTotal),
    lagVerdict: String(d.lagVerdict || base.lagVerdict),
    diagBornAt: num(d.diagBornAt, base.diagBornAt),
    capturedAt: now,
    /*
     * ★v0.1.1328: どちらの面が書いたスナップショットかを必ず残す。
     *   読み上げは【会場(VoicePlayer)】と【コメビュ(独自実装)】の2実装が同じ
     *   storage キーを奪い合っており(last-writer-wins)、化石値を見たときに
     *   「どちらが書いたか」が分からないと調査の出発点が決まらない。
     *   venueBar は従来から 'venue' を後付けしていたが、comeview は無印だった=非対称。
     *   ここで既定を持たせ、呼び出し側が上書きする形に揃える。
     */
    source: String(d.source || '')
  };
}

/**
 * 状態速報の概要に出す1行を作る純関数。voice が一度も動いていない(未取得)なら ''。
 * 「たまに遅れる」を一目で掴めるよう、待機ピーク・間引き・最終発話からの経過を出す。
 *
 * @param {(VoiceDiagState & { capturedAt?: number, source?: string })|null|undefined} snap
 * @param {number} nowMs 現在時刻(最終発話 ago の算出用)
 * @returns {string}
 */
export function buildVoiceDiagLine(snap, nowMs) {
  if (!snap || typeof snap !== 'object') return '';
  /*
   * ★v0.1.1328 化石値ガード(2026-08-11・実際に2回誤診してから入れた)
   *
   * ■ 何が起きたか
   *   KEY_VOICE_DIAG は chrome.storage.local に永続化され、リポジトリ内に
   *   リセット経路が1つも無い。コメビュ/会場を閉じるとスナップショットはそのまま凍り、
   *   読み手(状態速報)は【8日前の数字】を今の値として表示し続けていた。
   *   実際に出ていた「実効上限2 / 判定=coldsynth / 需要28.3 vs 供給13.6」は
   *   すべて 2026-08-03 頃の値。★床は 2026-08-04 に 5 へ上げてあり、
   *   現行コードでは実効上限2も coldsynth(cap<=3が条件)も【到達不能】=化石の証明。
   *
   * ■ 同じ誤読が既に2回起きている
   *   1回目 2026-08-04: 「まだ実効上限2だ、変更が効いていない」と誤読して版を重ねた
   *     (対策として judgeValueFreshness が書かれたが【どこからも呼ばれていなかった】)
   *   2回目 2026-08-11: 司令塔が同じ数字を根拠に「読み上げが重い」とユーザーに説明した
   *
   * ■ なぜ数値を隠すのか(警告を添えるだけにしない)
   *   数字が見えれば人は読む。1回目の対策(文書化)は2回目を止められなかった。
   *   止まるのは判定を共有したときだけなので、古い値は【出さない】。
   */
  const capturedAt = Number(snap.capturedAt) || 0;
  const nowForAge = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  if (capturedAt > 0 && nowForAge > 0) {
    const verdict = judgeValueFreshness(nowForAge - capturedAt, VOICE_DIAG_FRESH_MS);
    if (verdict.level === 'bad') {
      const min = Math.max(0, Math.round((nowForAge - capturedAt) / 60000));
      const src = String(snap.source || '').trim();
      const who = src ? `・${src}` : '';
      return (
        `会場読み上げ: ⚠化石値(${min}分前${who}) この数字で判断してはいけません` +
        `(会場モードかコメビュを開き直すと今の値になります)`
      );
    }
  }
  const enabled = !!snap.enabled;
  const spoken = Number(snap.spokenTotal) || 0;
  const queueNow = Number(snap.queueNow) || 0;
  const queueMax = Number(snap.queueMax) || 0;
  const drop = Number(snap.staleDropTotal) || 0;
  // 一度も ON にも発話にもなっていない=会場モード未使用=ノイズにしない。
  // ★v0.1.1213: ただし合成失敗が出ているなら黙ってはいけない。合成が全滅すると
  //   spokenTotal が 0 のままなので、この早期returnは「読み上げが最も壊れているときほど
  //   診断行が丸ごと消える」向きに効いてしまう(実配信で約34件が行方不明だった件と同根)。
  const synthNull = Number(snap.synthNullTotal) || 0;
  /*
   * ★v0.1.1331: ON失敗も早期returnの例外に加える。
   *   ユーザーが「押しても一瞬で戻る」状態は enabled=false・spoken=0・queueMax=0 に
   *   なるため、この早期returnが【まさに壊れているときだけ診断行を丸ごと消す】。
   *   上の v0.1.1213 コメントが警告していた同じ罠を、別のフィールドで踏んでいた。
   */
  const enableFail = Number(snap.enableFailTotal) || 0;
  if (!enabled && spoken === 0 && queueMax === 0 && synthNull === 0 && enableFail === 0) return '';
  const parts = [];
  parts.push(enabled ? '読み上げ:ON' : '読み上げ:OFF');
  parts.push(`待機${queueNow}(最大${queueMax})`);
  if (drop > 0) parts.push(`間引き${drop}件`); // リアルタイム維持で古い分を捨てた回数=遅延の傍証。
  // 再生 watchdog 発火=ended/error が来ず固着しかけた異常。出たら必ず見せる(本物の固着の傍証)。
  const pbTimeout = Number(snap.playbackTimeoutTotal) || 0;
  if (pbTimeout > 0) parts.push(`再生TO${pbTimeout}件`);
  const base = Number(snap.lastSpokenBase) || 0;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  if (base > 0 && now > 0) {
    parts.push(`最終発話${Math.max(0, Math.round((now - base) / 1000))}秒前`);
  }
  // v0.1.1088計器(voice-tempo-realtime-SYNTHESIS §3 Phase 1): 「到着→発声」の体感遅延。
  //   憶測でパラメータを触らないための土台(未計測=-1なら出さない・ノイズにしない)。
  const lastE2e = Number(snap.lastE2eMs);
  const avgE2e = Number(snap.e2eAvgMs);
  if (Number.isFinite(lastE2e) && lastE2e >= 0) {
    const lastSec = (lastE2e / 1000).toFixed(1);
    if (Number.isFinite(avgE2e) && avgE2e >= 0) {
      parts.push(`体感遅延${lastSec}秒(平均${(avgE2e / 1000).toFixed(1)}秒)`);
    } else {
      parts.push(`体感遅延${lastSec}秒`);
    }
  }
  const mergeTotal = Number(snap.mergeTotal) || 0;
  if (mergeTotal > 0) parts.push(`統合${mergeTotal}件`); // 同文まとめ(「ほか○件」)が効いている実測。
  const synth = Number(snap.lastSynthMs);
  if (Number.isFinite(synth) && synth >= 0) parts.push(`合成${synth}ms`);
  // 2026-07-24計器(段階0=shadow・council-fable設計venue-bubble-voice-realtime-max-DESIGN.md D章):
  //   生存者バイアスの緑防止=voicedRatioは必ず間引き件数(drop)と同一行に併記する。
  //   voicedRatio低いのにe2e緑=「間引きで買った緑」と分かるようにする。
  const voicedRatio = Number(snap.voicedRatio);
  if (Number.isFinite(voicedRatio) && voicedRatio >= 0) {
    parts.push(`voiced率${Math.round(voicedRatio * 1000) / 10}%`);
  }
  const serviceTimeEma = Number(snap.serviceTimeEmaMs);
  const effectiveMax = Number(snap.effectiveQueueMax);
  if (Number.isFinite(serviceTimeEma) && serviceTimeEma >= 0) {
    parts.push(`処理時間${Math.round(serviceTimeEma)}ms/件`);
    // v0.1.1181(段階1=apply)で実際にpushVoiceQueueのmaxへ適用済み。「(未適用)」表記は
    //   v0.1.1180(段階0=shadow)当時の名残で、実適用後もこの文言が残っていたのは表示上の
    //   不整合(実害は無いが誤解を招く)。
    if (Number.isFinite(effectiveMax)) parts.push(`実効上限${effectiveMax}`);
  }
  /*
   * ★v0.1.1331: 読み上げONに失敗した理由。ユーザー報告「押しても一瞬で戻る」に対して
   *   状態速報が理由を1文字も持っておらず、原因特定ができなかったので載せる。
   *   ★enabled が false のときほど重要なので、他の行より前に出す。
   */
  const failReason = String(snap.lastEnableFailReason || '').trim();
  const failTotal = Number(snap.enableFailTotal) || 0;
  if (failReason) {
    /*
     * ★v0.1.1335: 日本語ラベルは taxonomy(voiceFailureTaxonomy.js)が正本。
     *   ここで三項演算子を並べると、同じ cause が別の場所で別の日本語になる
     *   (実際に voiceLoadingState.js と文言が食い違っていた)。
     * ★生の値(refused 等)は消さずに併記する。次のセッションが grep で原因を追う材料であり、
     *   日本語だけにすると storage に書かれた値と突き合わせられなくなる。
     */
    const why = canonicalLabel(fromAliveFailure(failReason));
    parts.push(why ? `★ON失敗${failTotal}回: ${failReason}(${why})` : `★ON失敗${failTotal}回: ${failReason}`);
  }
  // v0.1.1327: 自動再生ブロック。合成は通っているのに音が出ない状態を名指しする
  //   (ユーザー実機「一瞬ONになって戻る」の正体。0なら何も言わない)。
  const audioBlocked = Number(snap.audioBlockedTotal) || 0;
  if (audioBlocked > 0) {
    parts.push(`再生ブロック${audioBlocked}件(ページを一度クリックすると鳴ります)`);
  }
  const rateClamp = Number(snap.rateClampTotal) || 0;
  if (rateClamp > 0) parts.push(`速度飽和${rateClamp}件`); // playbackRateが上限で追いつけていない兆候。
  // v0.1.1222: 持続過負荷ブースト。実効上限が絞られてキュー長では出せない速度を、
  //   pressure(需要/供給比)から足したぶん。0なら出さない(落ち着いている時は何も言わない)。
  //   ★「速くした結果どうなったか」を voiced率/間引き件数と並べて検算できるようにする。
  const sustainedNow = Number(snap.lastSustainedBoost) || 0;
  const sustainedTotal = Number(snap.sustainedBoostTotal) || 0;
  if (sustainedNow > 0 || sustainedTotal > 0) {
    parts.push(`速度底上げ+${sustainedNow.toFixed(2)}(適用${sustainedTotal}件)`);
  }
  // v0.1.895: 固着の切り分け。最終発話が古い(沈黙)のに待機があるとき、drainVoiceQueue が
  //   最後にどのフェーズまで進んだか(lastPhase)を出す=どこで止まったかを実データで確定する計器。
  const lastPhase = String(snap.lastPhase || '');
  const phaseAt = Number(snap.lastPhaseAt) || 0;
  if (lastPhase && queueNow > 0 && base > 0 && now > 0 && now - base >= 8000) {
    const phaseAgo = phaseAt > 0 ? Math.max(0, Math.round((now - phaseAt) / 1000)) : null;
    parts.push(phaseAgo != null ? `停止位置=${lastPhase}(${phaseAgo}秒前)` : `停止位置=${lastPhase}`);
  }
  // 2026-07-28計器(段階0=shadow・council-fable設計voice-lag-decomposition-DESIGN.md):
  //   serviceTimeの内訳(合成待/準備/実再生)。1つでも計測済みならまとめて出す(未計測項目は省略)。
  const synthWait = Number(snap.synthWaitEmaMs);
  const playPrep = Number(snap.playPrepEmaMs);
  const playback = Number(snap.playbackEmaMs);
  const breakdownParts = [];
  if (Number.isFinite(synthWait) && synthWait >= 0) breakdownParts.push(`合成待${Math.round(synthWait)}`);
  if (Number.isFinite(playPrep) && playPrep >= 0) breakdownParts.push(`準備${Math.round(playPrep)}`);
  if (Number.isFinite(playback) && playback >= 0) breakdownParts.push(`実再生${Math.round(playback)}`);
  if (breakdownParts.length > 0) parts.push(`内訳(${breakdownParts.join('/')}ms)`);
  // 需要(到着レート)vs供給(1/serviceTime)。どちらも計測済みのときだけ出す。
  const arrivalPerMin = Number(snap.arrivalPerMin);
  if (Number.isFinite(arrivalPerMin) && arrivalPerMin >= 0 && Number.isFinite(serviceTimeEma) && serviceTimeEma > 0) {
    const supplyPerMin = 60000 / serviceTimeEma;
    parts.push(`需要${Math.round(arrivalPerMin * 10) / 10}/分vs供給${Math.round(supplyPerMin * 10) / 10}/分`);
  }
  // 直近voiced率(累計voicedRatioの世代錯誤=リロード跨ぎの累計バイアスを補う)。
  const voicedRecentRatio = Number(snap.voicedRecentRatio);
  if (Number.isFinite(voicedRecentRatio) && voicedRecentRatio >= 0) {
    parts.push(`直近voiced率${Math.round(voicedRecentRatio * 1000) / 10}%`);
  }
  // drop原因の分別(件数ゲート/先頭stale/全staleスイープ)。1件でも計上があれば出す。
  const dropCountGate = Number(snap.dropCountGateTotal) || 0;
  const dropHeadStale = Number(snap.dropHeadStaleTotal) || 0;
  const dropSweepStale = Number(snap.dropSweepStaleTotal) || 0;
  if (dropCountGate > 0 || dropHeadStale > 0 || dropSweepStale > 0) {
    parts.push(`drop内訳(件数${dropCountGate}/鮮度${dropHeadStale}/全stale${dropSweepStale})`);
  }
  // v0.1.1213: 合成が null で返って消えた件。drop内訳の隣に置く(どちらも「読まれなかった理由」)。
  //   実配信で「需要52.2/分・読めた6件・間引き12件」=約34件がどの計器にも乗らない穴があった。
  const synthFailureLine = formatVoiceSynthFailureLine(snap);
  if (synthFailureLine) parts.push(synthFailureLine);
  // v0.1.1224: 「その他N件」の正体を名前で割る。原因ごとに打つ手が正反対なので対処文も出す
  //   (接続不能=拡張では直せない / HTTP拒否=過負荷で絞れば直る / 時間切れ=処理が重い)。
  const reasonLine = formatVoiceSynthFailureReasonLine(snap.synthFailReasons);
  if (reasonLine) {
    parts.push(reasonLine);
    const advice = adviseVoiceSynthFailure(snap.synthFailReasons);
    if (advice) parts.push(`→ ${advice}`);
  }
  // 真因判定。ok/insufficientは「間引きは偶発」「データ不足」でノイズになるため出さない。
  const lagVerdict = String(snap.lagVerdict || '');
  if (lagVerdict && lagVerdict !== 'ok' && lagVerdict !== 'insufficient') {
    parts.push(`判定=${lagVerdict}`);
  }
  // 計測開始からの経過分。snapshot間の比較でリロード跨ぎ(計器リセット)を誤診しないための世代識別。
  const diagBornAt = Number(snap.diagBornAt) || 0;
  if (diagBornAt > 0 && now > 0) {
    parts.push(`計測${Math.max(0, Math.round((now - diagBornAt) / 60000))}分`);
  }
  return `会場読み上げ: ${parts.join(' / ')}`;
}
