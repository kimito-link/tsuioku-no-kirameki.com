/**
 * 数字カード鏡(記録/推定同時接続/来場者数+公式統計チップ)の【値セット部分】を、
 * status / 純Web 両方から再利用できる純DOMビルダーとして切り出したもの。
 *
 * スナップショット(KEY_STAT_CARDS_MIRROR / jsonBlob.statCardsMirror)は popup 側で確定済み
 * (公式チップも digest 確定)=描く側は再計算せず同じ id へ値を入れるだけ(popup と必ず一致・
 * 似せて自作しない)。元は status-entry.js#renderStatCardsMirror の後半(値セット部)。
 *
 * chrome 非依存。DOM ルート(document 互換= getElementById を持つもの)を引数で受けるので、
 * status の document でも 純Web の document でも同じ挙動になる(鮮度ガード/signature ガード/
 * section.hidden の出し入れは呼び出し側=status-entry / app/live-view が持つ)。
 *
 * @module statCardsMirrorDom
 */

/**
 * @typedef {{ getElementById: (id: string) => (HTMLElement|null) }} DomRoot
 */

/**
 * 数字カード鏡のスナップショット値を DOM へ適用する。
 *
 * 元の renderStatCardsMirror と完全同一のロジック:
 *   - setVal(id, text, isPlaceholder): textContent 更新 + is-placeholder クラストグル
 *   - setSub(id, text): textContent 更新 + 空なら hidden
 *   - official が null/未定義なら公式チップ5つを '—' + is-placeholder に戻す
 *
 * @param {DomRoot} root document 互換(getElementById を持つ)
 * @param {import('./statCardsMirror.js').StatCardsMirrorSnapshot|null|undefined} snap
 */
export function paintStatCardsMirrorValues(root, snap) {
  if (!root || typeof root.getElementById !== 'function' || !snap || typeof snap !== 'object') return;

  const $id = (/** @type {string} */ id) => root.getElementById(id);
  /** テキスト+is-placeholder トグル(popup の値セットと同じ作法・似せて自作しない)。 */
  const setVal = (/** @type {string} */ id, /** @type {string} */ text, /** @type {boolean} */ isPlaceholder) => {
    const el = $id(id);
    if (!el) return;
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('is-placeholder', isPlaceholder === true);
  };
  /** sub 行(公式行/取り込み/内訳): テキスト有なら表示・空なら hidden(popup と同じ畳み方)。 */
  const setSub = (/** @type {string} */ id, /** @type {string} */ text) => {
    const el = $id(id);
    if (!el) return;
    const t = String(text || '');
    if (el.textContent !== t) el.textContent = t;
    el.hidden = t.length === 0;
  };

  // 記録カード(値+プレースホルダ+3つの sub 行)。
  setVal('liveStatComments', String(snap.recordsText || ''), snap.recordsIsPlaceholder === true);
  setSub('liveStatCommentsOfficial', snap.recordsOfficialLine);
  setSub('liveStatCommentsBreakdown', snap.recordsBreakdownLine);
  setSub('liveStatCommentsIngest', snap.recordsIngestLine);

  // 推定同時接続カード(値+プレースホルダ・単位 sub は任意)。
  const conc = /** @type {{ estText?: string, estIsPlaceholder?: boolean, subText?: string }} */ (
    snap.concurrent && typeof snap.concurrent === 'object' ? snap.concurrent : {}
  );
  setVal('watchConcurrentEst', String(conc.estText || ''), conc.estIsPlaceholder === true);
  const subEl = $id('watchConcurrentSub');
  if (subEl && conc.subText) {
    const t = String(conc.subText);
    if (subEl.textContent !== t) subEl.textContent = t;
  }

  // 来場者数カード(値+プレースホルダ)。
  const vis = /** @type {{ text?: string, isPlaceholder?: boolean }} */ (
    snap.visitor && typeof snap.visitor === 'object' ? snap.visitor : {}
  );
  setVal('watchViewerDom', String(vis.text || ''), vis.isPlaceholder === true);

  // 公式統計チップ(5つ)。popup の paintOfficialNicoStatsStrip と同じ id・同じ class トグルで適用。
  //   official が null のときは popup と同じく「—」プレースホルダに戻す。
  const PH = { text: '—', isPlaceholder: true };
  const off = snap.official;
  /** @type {Record<string, { text?: string, isPlaceholder?: boolean }>} */
  const chip = off
    ? {
        officialStatNicoViewers: off.viewers,
        officialStatNicoComments: off.comments,
        officialStatNicoStreamAge: off.streamAge,
        officialStatNicoAdPts: off.adPts,
        officialStatNicoGiftPts: off.giftPts
      }
    : {
        officialStatNicoViewers: PH,
        officialStatNicoComments: PH,
        officialStatNicoStreamAge: PH,
        officialStatNicoAdPts: PH,
        officialStatNicoGiftPts: PH
      };
  for (const id of Object.keys(chip)) {
    const c = chip[id] || PH;
    setVal(id, String(c.text || '—'), c.isPlaceholder === true);
  }
}

/**
 * v0.1.1019(フルコピー根治): 数字カード鏡スナップショットの再描画 skip 用 signature を組む純関数。
 *   liveId+capturedAt+記録テキストが変わったときだけ paint し直す(②応援プレビューの無駄再描画を抑える)。
 * @param {any} snap
 * @returns {string}
 */
export function statCardsMirrorSig(snap) {
  const s = snap && typeof snap === 'object' ? snap : {};
  return `${String(s.liveId || '')}|${Number(s.capturedAt) || 0}|${String(s.recordsText || '')}`;
}

/**
 * v0.1.1019: sig ガード付きの数字カード鏡ペインター(状態を内部に閉じ込め=popup 側の変数/検証を増やさない)。
 *   ②応援プレビューが①の焼いた statCardsMirror 鏡を read して paint するだけ=①=②=③を同一値に。
 * @param {DomRoot} root document 互換
 * @returns {(snap: any) => void}
 */
export function createStatCardsMirrorPassivePainter(root) {
  let sig = '';
  return (snap) => {
    if (!snap || typeof snap !== 'object') return;
    const next = statCardsMirrorSig(snap);
    if (next === sig) return;
    sig = next;
    try { paintStatCardsMirrorValues(root, snap); } catch { /* no-op */ }
  };
}
