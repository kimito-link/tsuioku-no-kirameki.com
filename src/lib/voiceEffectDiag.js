/**
 * パチンコボイス演出(voiceDirector.js・Phase B)の発火/スキップ観測値を組み立てる純関数群。
 * 記録/演出/音には一切触れない(giftEffectDiag.js / customSoundDiag.js と同思想=
 * venueBar.js / popup-entry.js が書き、status が読んで状態速報に再表示する)。
 *
 * 目的(council/pachinko-ultimate-SYNTHESIS.md §6 Phase B): ボイスの歯止め
 *   (個別CD/上限・グローバル45秒CD・1配信20回・VOICEVOX発話中スキップ)が実際に効いているかを
 *   状態速報1枚で確認する(fired と skipped の内訳がそのまま歯止めの動作証明になる)。
 *
 * @typedef {{
 *   fired: number,             // 実際に鳴らした回数(playEffectSound の戻り値 'played' のみ)
 *   skippedCooldown: number,   // 個別CD/グローバル45秒CDでスキップした回数
 *   skippedCap: number,        // キー別上限/1配信合計20回上限でスキップした回数
 *   skippedNarrating: number,  // VOICEVOX発話中スキップの回数(voice_jackpot以外)
 *   skippedVenue: number,      // popup側が会場優先プレゼンスで譲った回数(二重再生ガード)
 *   skippedUnassigned: number, // 修正1: カスタム未割当キーでゲートstateを消費せず諦めた回数
 *   soundEnabled: boolean,     // 効果音設定が ON か(OFF なら鳴らないのが正常=誤診断防止)
 *   lastKey: string,           // 最後に鳴らした(または鳴らそうとした)ボイスキー
 *   lastEventAt: number        // 最後にボイス発火判定が走った時刻(epoch ms・0=未判定)
 * }} VoiceEffectDiagState
 */

/** 初期 ボイス演出診断 state。 */
export function makeInitialVoiceEffectDiag() {
  return {
    fired: 0,
    skippedCooldown: 0,
    skippedCap: 0,
    skippedNarrating: 0,
    skippedVenue: 0,
    skippedUnassigned: 0,
    soundEnabled: true,
    lastKey: '',
    lastEventAt: 0
  };
}

/**
 * voiceGate の拒否 reason を診断カウンタのフィールド名に変換する純関数。
 * @param {string} reason 'cooldown'|'global_cooldown'|'cap'|'global_cap'|'narrating'|その他
 * @returns {'skippedCooldown'|'skippedCap'|'skippedNarrating'|null} null=数えない(unknown_key等)
 */
export function voiceSkipFieldForGateReason(reason) {
  const r = String(reason || '');
  if (r === 'cooldown' || r === 'global_cooldown') return 'skippedCooldown';
  if (r === 'cap' || r === 'global_cap') return 'skippedCap';
  if (r === 'narrating') return 'skippedNarrating';
  return null;
}

/**
 * storage 書き込み用の軽量スナップショット(欠損は初期値で埋める)。
 * @param {Partial<VoiceEffectDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {VoiceEffectDiagState & { capturedAt: number }}
 */
export function buildVoiceEffectDiagSnapshot(diag, nowMs) {
  const base = makeInitialVoiceEffectDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return {
    fired: num(d.fired, base.fired),
    skippedCooldown: num(d.skippedCooldown, base.skippedCooldown),
    skippedCap: num(d.skippedCap, base.skippedCap),
    skippedNarrating: num(d.skippedNarrating, base.skippedNarrating),
    skippedVenue: num(d.skippedVenue, base.skippedVenue),
    skippedUnassigned: num(d.skippedUnassigned, base.skippedUnassigned),
    soundEnabled: d.soundEnabled !== false,
    lastKey: String(d.lastKey || ''),
    lastEventAt: num(d.lastEventAt, base.lastEventAt),
    capturedAt: now
  };
}

/**
 * 状態速報に出す行群を作る純関数。一度もボイス判定が走っていない(未観測)なら空配列
 * (ノイズにしない・giftEffectDiag と同方針)。
 * @param {(VoiceEffectDiagState & { capturedAt?: number })|null|undefined} snap
 * @param {number} nowMs 現在時刻(最終イベント ago の算出用)
 * @returns {string[]}
 */
export function buildVoiceEffectDiagLines(snap, nowMs) {
  if (!snap || typeof snap !== 'object') return [];
  const fired = Number(snap.fired) || 0;
  const skippedCooldown = Number(snap.skippedCooldown) || 0;
  const skippedCap = Number(snap.skippedCap) || 0;
  const skippedNarrating = Number(snap.skippedNarrating) || 0;
  const skippedVenue = Number(snap.skippedVenue) || 0;
  const skippedUnassigned = Number(snap.skippedUnassigned) || 0;
  const total = fired + skippedCooldown + skippedCap + skippedNarrating + skippedVenue + skippedUnassigned;
  if (total === 0) return []; // 未観測=このセッションでボイストリガが無かった
  const soundEnabled = snap.soundEnabled !== false;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const lastAt = Number(snap.lastEventAt) || 0;
  const agoText = lastAt > 0 && now > 0 ? ` / 最終${Math.max(0, Math.round((now - lastAt) / 1000))}秒前` : '';
  const lastKeyText = snap.lastKey ? `(${snap.lastKey})` : '';
  const lines = [];
  lines.push(`パチンコボイス: 効果音設定=${soundEnabled ? 'ON' : 'OFF'}${agoText}${lastKeyText}`);
  // スキップの内訳は歯止め(§4)が働いた証拠なので⚠にしない(意図した動き=嘘をつかない)。
  // 修正1: 未割当は「一度も鳴っていないのにCDスキップ」という嘘を防ぐため別枠で明示する
  //   (ゲートstateを消費していない=歯止めの動作証明ではなく、単に音源が無いだけ)。
  lines.push(
    `  → 発火${fired} / スキップ CD:${skippedCooldown} 上限:${skippedCap} 読み上げ中:${skippedNarrating}` +
    (skippedVenue > 0 ? ` 会場優先:${skippedVenue}` : '') +
    ` / 未割当:${skippedUnassigned}`
  );
  return lines;
}
