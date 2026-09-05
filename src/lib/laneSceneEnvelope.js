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
 * 段別キー列の【指紋】。①実DOM(laneDomSelfMeasure.keys)・会場実DOM(venueDomCensus.perSection[].keys)・
 * 鏡(venueLaneParity.laneMirrorTierKeySequences)の3起点が、同じ canonical 形で hash 化できる。
 *
 * ★なぜ要るか(venue-exact-parity-SPEC-2026-08-07 §1・C1〜C3):
 *   従来の scene 行は「比較の両辺が同じ鏡オブジェクト起点」だったため恒真で、
 *   ①が0件描画でも鏡さえ残れば ✅ が出ていた。①の実DOMと会場の実DOMは
 *   【物理的に別のドキュメント】であり、これ以上独立な起点は存在しない。
 *   共有renderer(renderStoryUserLaneDom.js:400)が `tileEl.dataset.userKey = venueLaneParityKey(p)`
 *   を刻むので、3起点とも同じ鍵アルファベット(`u:uid` / `c:idLine|title`)で読める。
 *
 * ★空キーは除外する(dataset.userKey='' の無鍵タイルは census の unkeyed 計数の縄張り)。
 * ★順序は保存する(段内の並び違いも検出対象)。段順は laneSceneContentHash と同じ固定順。
 * ★hash だけを運ぶ。キー列そのものは storage に出さない(venueDomCensus.js:20 の既定=PII/容量)。
 *
 * @param {Partial<Record<typeof TIERS[number], string[]>>|null|undefined} perTierKeys
 * @returns {string} 8桁hex(djb2・laneSceneContentHash と同系)
 */
export function laneDomFingerprint(perTierKeys) {
  const src = perTierKeys && typeof perTierKeys === 'object' ? /** @type {any} */ (perTierKeys) : {};
  const parts = [];
  for (const tier of TIERS) {
    const arr = Array.isArray(src[tier]) ? src[tier] : [];
    const keys = arr.map((k) => String(k ?? '').trim()).filter(Boolean);
    parts.push(`${tier}:${keys.join(',')}`);
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
 * ①と会場の受領証を【3つの独立起点】から組み立てる(venue-exact-parity-SPEC-2026-08-07 §3-3)。
 *
 * ★このシグネチャ自体が C1(自己代入で恒真)の再発を殺す檻である。
 *   旧実装(venueBar.js:5300-5324・v0.1.1137〜1283)は venueReceipt.revision に
 *   `popEnvelope.revision` を代入していた=revision 比較が恒真だった。
 *   ここでは pop 側が acceptedSnap、venue 側が paintedSnap と【別の入力変数】から出るので、
 *   自己代入は関数の外から作れない(作るには本体を書き換えるしかなく、T-2 が赤で捕まえる)。
 *
 * | フィールド | popReceipt(①側)                     | venueReceipt(会場側)                       |
 * |---|---|---|
 * | revision      | acceptedSnap.capturedAt              | paintedSnap.capturedAt   ← C1修正           |
 * | contentHash   | acceptedSnap.contentHash(★①が焼いた値を初めて読む=C3修正) | laneSceneContentHash(paintedBuckets)=会場側の再計算 ← C2修正 |
 * | domFingerprint| domSelf.fingerprintFor === contentHash のときだけ domSelf.fingerprint | venueDomFingerprint(census keys 由来) |
 *
 * ★fingerprintFor(内容アドレス)ゲートの意味(§6):
 *   publish は paint より【前】(v0.1.1281)なので、snapshot N が「N-1 paint の指紋」を運びうる。
 *   中身が変わっていなければ hash が一致して比較でき、変わっていれば【時計に頼らず】
 *   「旧内容の指紋」と分かって '' に落ちる=⚪(fail-closed・偽🔴を構造的に排除)。
 *
 * @param {{
 *   acceptedSnap: object|null|undefined,
 *   paintedSnap: object|null|undefined,
 *   paintedBuckets: unknown,
 *   venueDomFingerprint?: string
 * }} input
 * @returns {{ popReceipt: ReturnType<typeof buildRenderReceipt>, venueReceipt: ReturnType<typeof buildRenderReceipt> }|null}
 *   どちらかの snapshot が欠けたら null(=scene 未計測)。
 */
export function buildVenueSceneReceipts(input) {
  const inp = /** @type {any} */ (input && typeof input === 'object' ? input : {});
  const acceptedSnap = inp.acceptedSnap && typeof inp.acceptedSnap === 'object' ? inp.acceptedSnap : null;
  const paintedSnap = inp.paintedSnap && typeof inp.paintedSnap === 'object' ? inp.paintedSnap : null;
  if (!acceptedSnap || !paintedSnap) return null;

  // ①が snapshot に焼いた contentHash をここで初めて読む(C3修正)。
  //   旧実装は会場側で restoreLaneMirrorBuckets して再計算していた=①が焼いた値は誰も読まなかった。
  const popContentHash = String(acceptedSnap.contentHash || '');
  // 会場側は「実際に paint に使った buckets」から【再計算】する(C2修正=別起点)。
  const venueContentHash = laneSceneContentHash(/** @type {any} */ (inp.paintedBuckets));

  const domSelf = acceptedSnap.domSelf && typeof acceptedSnap.domSelf === 'object' ? acceptedSnap.domSelf : null;
  const fingerprintFor = String(domSelf?.fingerprintFor || '');
  // 内容アドレスが一致したときだけ①の指紋を採用する。不一致/未搭載(旧版snapshot)は '' = ⚪へ。
  const popDomFingerprint =
    popContentHash && fingerprintFor && fingerprintFor === popContentHash
      ? String(domSelf?.fingerprint || '')
      : '';

  return {
    popReceipt: buildRenderReceipt({
      surface: 'pop',
      revision: Number(acceptedSnap.capturedAt) || 0,
      contentHash: popContentHash,
      domFingerprint: popDomFingerprint
    }),
    venueReceipt: buildRenderReceipt({
      surface: 'venue',
      revision: Number(paintedSnap.capturedAt) || 0,
      contentHash: venueContentHash,
      domFingerprint: String(inp.venueDomFingerprint || '')
    })
  };
}

/**
 * ①のReceiptと会場のReceiptを突合し、状態速報向けの1行verdictを返す。
 *
 * ★判定順(先に出たものが名前を持つ=[[instrument-must-name-the-cause-2026-08-01]]):
 *   revision差 → 「会場が古い/先の世代を描いている」(陳腐化・説明可能)
 *   contentHash差 → 「同じ世代なのに中身が違う」(バグ・未説明)
 *   指紋差 → 「データは同じなのに画面の顔ぶれが違う」(描画バグ・diff-skip消し残り)
 *   指紋が片方でも空 → ⚪「指紋未計測」= match:false(★DOMを写さない✅は構造的に出ない)
 *
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
  // ★指紋(実DOM起点)。両方揃って初めて「画面の顔ぶれまで一致」を主張できる。
  const popFp = String(popReceipt.domFingerprint || '');
  const venueFp = String(venueReceipt.domFingerprint || '');
  if (!popFp || !venueFp) {
    // fail-closed: 実DOMを写せていないときは ✅ を名乗らない(venueLaneParity.js:367-369 と同じ思想)。
    return {
      match: false,
      line: `scene r${popReceipt.revision} hash${popReceipt.contentHash} 指紋未計測(①${popFp || '無'}/会場${venueFp || '無'}) ⚪`
    };
  }
  if (popFp !== venueFp) {
    return {
      match: false,
      line: `scene r${popReceipt.revision} 指紋①${popFp}≠会場${venueFp} 🔴`
    };
  }
  return {
    match: true,
    line: `scene r${popReceipt.revision} hash${popReceipt.contentHash} 指紋${popFp} ①=会場 ✅`
  };
}
