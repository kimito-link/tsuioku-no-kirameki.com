/**
 * BGMディレクター(bgmDirector.js)+フェーズディレクター(phaseDirector.js)の観測値を組み立てる
 * 純関数群(Phase C・council/pachinko-ultimate-SYNTHESIS.md §6 検証)。記録/演出/音には一切触れない
 * (voiceEffectDiag.js / customSoundDiag.js と同思想=venueBar.js / popup-entry.js が書き、
 *  status が読んで状態速報に再表示する)。
 *
 * @typedef {{
 *   phase: string,           // phaseDirector.PHASE.* の現在値
 *   r: number,               // 直近の相対比R
 *   b: number,               // 直近のベースラインB
 *   reachInCount: number,    // リーチBGMをinした回数
 *   reachOutCount: number,   // リーチBGMをoutした回数
 *   feverInCount: number,    // フィーバーBGMをinした回数
 *   feverOutCount: number,   // フィーバーBGMをoutした回数
 *   bgmEnabled: boolean,     // BGMトグルON/OFF(既定OFF=オプトイン)
 *   lastEventAt: number      // 最後に計器を更新した時刻(epoch ms・0=未観測)
 * }} BgmPhaseDiagState
 */

/** 初期 BGM/フェーズ診断 state。 */
export function makeInitialBgmPhaseDiag() {
  return {
    phase: 'normal',
    r: 0,
    b: 0,
    reachInCount: 0,
    reachOutCount: 0,
    feverInCount: 0,
    feverOutCount: 0,
    bgmEnabled: false,
    lastEventAt: 0
  };
}

/**
 * storage 書き込み用の軽量スナップショット(欠損は初期値で埋める)。
 * @param {Partial<BgmPhaseDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {BgmPhaseDiagState & { capturedAt: number }}
 */
export function buildBgmPhaseDiagSnapshot(diag, nowMs) {
  const base = makeInitialBgmPhaseDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return {
    phase: String(d.phase || base.phase),
    r: num(d.r, base.r),
    b: num(d.b, base.b),
    reachInCount: num(d.reachInCount, base.reachInCount),
    reachOutCount: num(d.reachOutCount, base.reachOutCount),
    feverInCount: num(d.feverInCount, base.feverInCount),
    feverOutCount: num(d.feverOutCount, base.feverOutCount),
    bgmEnabled: d.bgmEnabled === true,
    lastEventAt: num(d.lastEventAt, base.lastEventAt),
    capturedAt: now
  };
}

/** フェーズ内部値→日本語ラベル(表示用)。 @type {Readonly<Record<string, string>>} */
const PHASE_LABEL = Object.freeze({
  normal: '通常',
  atsui: '煽り',
  reach: 'リーチ',
  breakthrough: '突破',
  jackpot: '大当たり',
  payout: '払い出し'
});

/**
 * 状態速報に出す行群を作る純関数。一度も観測が無い(未観測=lastEventAt===0)なら空配列
 * (ノイズにしない・voiceEffectDiagと同方針)。
 * @param {(BgmPhaseDiagState & { capturedAt?: number })|null|undefined} snap
 * @param {number} nowMs 現在時刻(最終イベント ago の算出用)
 * @returns {string[]}
 */
export function buildBgmPhaseDiagLines(snap, nowMs) {
  if (!snap || typeof snap !== 'object') return [];
  const lastAt = Number(snap.lastEventAt) || 0;
  if (lastAt <= 0) return []; // 未観測=このセッションでフェーズ判定が一度も走っていない
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const agoText = now > 0 ? ` / 最終${Math.max(0, Math.round((now - lastAt) / 1000))}秒前` : '';
  const phaseLabel = PHASE_LABEL[String(snap.phase)] || String(snap.phase || '通常');
  const r = Number(snap.r) || 0;
  const b = Number(snap.b) || 0;
  const bgmEnabled = snap.bgmEnabled === true;
  const lines = [];
  lines.push(`パチンコBGM/フェーズ: 現在=${phaseLabel} / R=${r.toFixed(2)} / B=${b.toFixed(2)}${agoText}`);
  lines.push(
    `  → BGM設定=${bgmEnabled ? 'ON' : 'OFF'} / リーチ in:${Number(snap.reachInCount) || 0} out:${Number(snap.reachOutCount) || 0}` +
    ` / フィーバー in:${Number(snap.feverInCount) || 0} out:${Number(snap.feverOutCount) || 0}`
  );
  return lines;
}
