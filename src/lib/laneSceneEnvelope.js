/**
 * LaneScene一致証明の封筒(純関数)。lanescene-structural-review-DESIGN.md のMVP実装。
 *
 * 位置づけ: venueLaneParity.js が既に持つ厳密突合(P/T/X層・DOM census・幾何一致)を置き換えるもの
 *   ではない。あちらは「キー列そのもの」を突き合わせる強い判定で、こちらは「①と会場が同じ鏡世代
 *   (revision)を見ているか」を1行で確認する軽量な代理指標。両者は独立に状態速報へ出る。
 *
 * revision の由来: laneMirror.js の LaneMirrorSnapshot.capturedAt(①がpublishした壁時計)を
 *   そのままrevisionとして使う(新規カウンタを作らない・①側の実装追加ゼロ)。
 * contentHash: buckets(段別セル配列)を正規化してdjb2ハッシュにする。揺れるフィールド
 *   (capturedAt等)は絶対に混ぜない(diff-skipキー揺れ=churn再発の既知地雷)。
 *
 * DOM/chrome非依存=単体テスト可能。
 */

const TIERS = /** @type {const} */ (['link', 'gift', 'ad', 'konta', 'tanu']);

/** @param {string} str @returns {string} 8桁hexのdjb2ハッシュ(改竄耐性不要・同一性検査のみ) */
function djb2Hex(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * buckets(段別セル配列)を正規化して決定的な contentHash を返す。
 * 確定フィールド(userId/displaySrc/title)のみを使い、段順を固定する。
 * @param {Partial<Record<typeof TIERS[number], Array<{ userId?: unknown, entry?: { userId?: unknown }, displaySrc?: unknown, title?: unknown }>>>} buckets
 * @returns {string}
 */
export function laneSceneContentHash(buckets) {
  const b = buckets && typeof buckets === 'object' ? buckets : {};
  const parts = [];
  for (const tier of TIERS) {
    const arr = Array.isArray(/** @type {any} */ (b)[tier]) ? /** @type {any} */ (b)[tier] : [];
    const cellKeys = arr.map((it) => {
      const c = it && typeof it === 'object' ? /** @type {any} */ (it) : {};
      const uid = String(c.userId ?? c.entry?.userId ?? '').trim();
      const displaySrc = String(c.displaySrc || '').trim();
      const title = String(c.title || '').trim();
      return `${uid}|${displaySrc}|${title}`;
    });
    parts.push(`${tier}:${cellKeys.join(',')}`);
  }
  return djb2Hex(parts.join(';'));
}

/**
 * 鏡スナップショットからSceneEnvelope(revision/contentHash)を組み立てる。
 * @param {{ capturedAt?: unknown, link?: unknown, gift?: unknown, ad?: unknown, konta?: unknown, tanu?: unknown }|null|undefined} snap
 * @returns {{ revision: number, contentHash: string }}
 */
export function buildSceneEnvelope(snap) {
  const s = snap && typeof snap === 'object' ? /** @type {any} */ (snap) : {};
  const revision = Math.max(0, Math.floor(Number(s.capturedAt) || 0));
  const contentHash = laneSceneContentHash(s);
  return { revision, contentHash };
}

/**
 * 描画側の受領証。C1のdomFingerprint(既存laneDomSelfMeasure.jsの測定結果を要約した文字列)と
 * 組み合わせて「同一Sceneを描いたか」を後段のcompareRenderReceiptsに渡す。
 * @param {{ surface: 'pop'|'venue', revision: number, contentHash: string, domFingerprint?: string, paintedAt?: number }} input
 * @returns {{ surface: 'pop'|'venue', revision: number, contentHash: string, domFingerprint: string, paintedAt: number }}
 */
export function buildRenderReceipt(input) {
  const inp = /** @type {any} */ (input && typeof input === 'object' ? input : {});
  return {
    surface: inp.surface === 'venue' ? 'venue' : 'pop',
    revision: Math.max(0, Math.floor(Number(inp.revision) || 0)),
    contentHash: String(inp.contentHash || ''),
    domFingerprint: String(inp.domFingerprint || ''),
    paintedAt: Math.max(0, Math.floor(Number(inp.paintedAt) || 0))
  };
}

/**
 * ①のReceiptと会場のReceiptを突合し、状態速報向けの1行verdictを返す。
 * @param {ReturnType<typeof buildRenderReceipt>|null|undefined} popReceipt
 * @param {ReturnType<typeof buildRenderReceipt>|null|undefined} venueReceipt
 * @returns {{ match: boolean, line: string }}
 */
export function compareRenderReceipts(popReceipt, venueReceipt) {
  if (!popReceipt || !venueReceipt) {
    return { match: false, line: 'scene 未計測(①または会場のReceiptなし)' };
  }
  if (popReceipt.revision !== venueReceipt.revision) {
    const laggingBy = popReceipt.revision - venueReceipt.revision;
    return {
      match: false,
      line: `scene ①r${popReceipt.revision}≠会場r${venueReceipt.revision}(${laggingBy > 0 ? `${laggingBy}ms遅れ` : `${-laggingBy}ms先行`}) 🔴`
    };
  }
  if (popReceipt.contentHash !== venueReceipt.contentHash) {
    return {
      match: false,
      line: `scene r${popReceipt.revision} hash①${popReceipt.contentHash}≠会場${venueReceipt.contentHash} 🔴`
    };
  }
  return {
    match: true,
    line: `scene r${popReceipt.revision} hash${popReceipt.contentHash} ①=会場 ✅`
  };
}
