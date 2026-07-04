/**
 * 「マイ効果音」(customSoundStore.js・Phase A)の取込状況を状態速報 extras(12秒間引き)に
 * 出すための純関数群。giftEffectDiag.js / voiceDiag.js と同じ思想:
 *   - 副作用(IndexedDB read)は status-entry.js 側の loader が行う(このファイルは純関数のみ)。
 *   - スナップショットの組み立てと表示行の生成をテスト可能な形に分離する。
 *
 * council/pachinko-ultimate-SYNTHESIS.md §6 Phase A 検証:
 *   「状態速報に customSound 計器(取込件数/割当キー数/rev)を extras(12秒間引き)側に追加
 *    (コアreadに足さない=既知の地雷)」への対応。
 *
 * @typedef {{
 *   blobCount: number,        // IndexedDB blobs ストアの件数(取込済み音源数)
 *   assignedKeyCount: number, // assignments ストアの件数(割当済みキー数)
 *   totalKeyCount: number,    // プリセット上の全キー数(CUSTOM_SOUND_PRESET_KEYS.length)
 *   rev: number,              // KEY_CUSTOM_SOUND_REV の現在値(世代カウンタ)
 *   dbAvailable: boolean      // IndexedDB を開けたか(false ならこのセッションでは利用不可)
 * }} CustomSoundDiagState
 */

/** IndexedDB が開けない/未計測時の初期値。 */
export function makeInitialCustomSoundDiag() {
  return {
    blobCount: 0,
    assignedKeyCount: 0,
    totalKeyCount: 0,
    rev: 0,
    dbAvailable: false
  };
}

/**
 * loader が集めた生値からスナップショットを組み立てる純関数(欠損は初期値で埋める)。
 * @param {Partial<CustomSoundDiagState>|null|undefined} raw
 * @returns {CustomSoundDiagState}
 */
export function buildCustomSoundDiagSnapshot(raw) {
  const base = makeInitialCustomSoundDiag();
  const d = /** @type {any} */ (raw && typeof raw === 'object' ? raw : {});
  /** @param {unknown} x @param {number} fallback */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    blobCount: num(d.blobCount, base.blobCount),
    assignedKeyCount: num(d.assignedKeyCount, base.assignedKeyCount),
    totalKeyCount: num(d.totalKeyCount, base.totalKeyCount),
    rev: num(d.rev, base.rev),
    dbAvailable: d.dbAvailable === true
  };
}

/**
 * 状態速報の概要に出す1行を組み立てる純関数。IndexedDB が使えない環境では
 * 「-」表示にして静かに済ませる(絶対制約: 静かに「-」表示)。
 * @param {CustomSoundDiagState|null|undefined} snap
 * @returns {string} 空文字なら行を出さない
 */
export function buildCustomSoundDiagLine(snap) {
  if (!snap || typeof snap !== 'object') return '';
  if (!snap.dbAvailable) {
    return 'マイ効果音: -(IndexedDB利用不可)';
  }
  const blobCount = Number(snap.blobCount) || 0;
  const assignedKeyCount = Number(snap.assignedKeyCount) || 0;
  const totalKeyCount = Number(snap.totalKeyCount) || 0;
  const rev = Number(snap.rev) || 0;
  return `マイ効果音: 取込${blobCount}本 / 割当${assignedKeyCount}${totalKeyCount > 0 ? `/${totalKeyCount}` : ''}キー / rev${rev}`;
}
