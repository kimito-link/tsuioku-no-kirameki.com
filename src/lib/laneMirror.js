/**
 * 応援レーンの「鏡」スナップショット純関数。popup がレーンを描いた buckets を、status が本物の
 * paintStoryUserLaneDomFilled + buildPersonTileEl でそっくり再描画できる最小データに間引いて保存する。
 * laneDiag.js(人数だけ)と同思想だが、こちらは avatar/表示名まで含む=別キー(laneMirrorKey.js)に分離。
 *
 * ★buildPersonTileEl が読むのは displaySrc / title / meta.idLine / meta.nameLine / entry.userId の
 *   5フィールドだけ(personTileDom.js)。鏡もこの5つだけ保存=最小化。
 * ★各段 cap で件数を抑え、全体が容量上限(JSON 512KB)を超えるなら cap を半減する二段ガード=status を重くしない。
 *
 * @typedef {{ displaySrc: string, title: string, idLine: string, nameLine: string, userId: string, recentTexts: string[] }} LaneMirrorCell
 * @typedef {{ visible: number, tileW: number, tileH: number }} LaneMirrorDomTier
 * @typedef {{ measured: boolean,
 *   perTier: { link: LaneMirrorDomTier, gift: LaneMirrorDomTier, ad: LaneMirrorDomTier, konta: LaneMirrorDomTier, tanu: LaneMirrorDomTier },
 *   dpr: number,
 *   measuredAt: number,
 *   fingerprint: string,
 *   fingerprintFor: string }} LaneMirrorDomSelf
 * @typedef {{
 *   liveId: string,
 *   capturedAt: number,
 *   link: LaneMirrorCell[],
 *   gift: LaneMirrorCell[],
 *   ad: LaneMirrorCell[],
 *   konta: LaneMirrorCell[],
 *   tanu: LaneMirrorCell[],
 *   domSelf: LaneMirrorDomSelf,
 *   pickedLength: number,
 *   totalCandidates: number,
 *   contentHash: string,
 *   writer: string
 * }} LaneMirrorSnapshot
 *
 * ★pickedLength = popup が paint に渡す laneDisplayedTotal(全5段=りんく+ギフト+広告+こん太+たぬ姉の
 *   合計枠)。フッター「いま N 件を表示中」「ほか M人」が popup と一致するための数=りんく段だけの
 *   picked.length ではない(取り違え注意)。totalCandidates=素性が取れた候補総数(cap 前)で「ほか M人」用。
 */

// v0.1.1112(鏡スリム化 B-1・読み手先行): displaySrc が空で userId が有るセルは、読み手が
//   anonymousIdenticonDataUrl(uid, 64)(純関数・①と同じ顔)を再生成して復元する。
//   これは B-2(書き手が匿名 data URL を鏡から落とす)の前提となる後方互換フォールバック。
//   旧鏡(data URL入り)では displaySrc 非空→再生成パス不発=byte同一出力(退行ゼロ)。
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
// v0.1.1137(lanescene-structural-review MVP): 一致証明の contentHash は capturedAt 確定前の
//   確定フィールド(userId/displaySrc/title)のみで計算する(揺れるフィールドを混ぜない=既知地雷)。
import { laneSceneContentHash } from './laneSceneEnvelope.js';

const LANE_MIRROR_TIERS = /** @type {const} */ (['link', 'gift', 'ad', 'konta', 'tanu']);
/** 1スナップショットの上限(これを超えたら各段 cap を半減して作り直す)。 */
const LANE_MIRROR_MAX_JSON_BYTES = 512 * 1024;

/** @param {unknown} value @param {boolean} [integer] */
function nonNegativeMetric(value, integer = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return integer ? Math.floor(n) : Math.round(n * 100) / 100;
}

/**
 * ★venue-exact-parity-SPEC-2026-08-07 §3-2/M4: この関数は【個別列挙で作り直す】型なので、
 *   新しいフィールドを足しても明示的に引き継がない限り黙って落ちる
 *   ([[venue-mirror-is-the-primary-path-2026-08-01]]の再発類型・v0.1.1280 と同じ穴)。
 *   measuredAt / fingerprint / fingerprintFor は会場の一致判定が読む=必ず保存する。
 *   ★perTier の `keys` は【保存しない】。指紋(hash)だけを運ぶ設計
 *   (500人分のキー列 ~12KB を publish 毎に載せると 512KB フェイルセーフの守備範囲外で
 *    容量が膨らむ・census の「keys は storage へ出さない」既定=venueDomCensus.js:20 にも逆行)。
 * @param {unknown} input @returns {LaneMirrorDomSelf}
 */
function normalizeDomSelf(input) {
  const source = /** @type {any} */ (input && typeof input === 'object' ? input : {});
  const sourceTiers = source.perTier && typeof source.perTier === 'object' ? source.perTier : {};
  /** @type {Record<string, LaneMirrorDomTier>} */
  const perTier = {};
  for (const tier of LANE_MIRROR_TIERS) {
    const raw = sourceTiers[tier] && typeof sourceTiers[tier] === 'object' ? sourceTiers[tier] : {};
    perTier[tier] = {
      visible: nonNegativeMetric(raw.visible, true),
      tileW: nonNegativeMetric(raw.tileW),
      tileH: nonNegativeMetric(raw.tileH)
    };
  }
  const rawDpr = Number(source.dpr);
  return {
    measured: source.measured === true,
    perTier: /** @type {LaneMirrorDomSelf['perTier']} */ (perTier),
    dpr: Number.isFinite(rawDpr) && rawDpr > 0 ? Math.round(rawDpr * 1000) / 1000 : 1,
    // 診断表示専用(会場の line に「①DOM齢Ns」として出す)。verdict には影響させない。
    measuredAt: nonNegativeMetric(source.measuredAt, true),
    // ①実DOMのキー列指紋。会場実DOMの指紋と突き合わせる(比較の両辺が別ドキュメント起点)。
    fingerprint: String(source.fingerprint || ''),
    // ★この指紋が「どの内容」を測ったかの内容アドレス。会場は
    //   fingerprintFor === snap.contentHash のときだけ指紋を硬く比較する(§6・時計を使わない)。
    fingerprintFor: String(source.fingerprintFor || '')
  };
}

/**
 * 鏡セルに載せる直近発言の上限。純Web公開のサイズを膨らませないため小さく固定する
 * (会場ホバーカードは5件表示だが、鏡は容量を優先して3件に絞る)。
 */
const LANE_MIRROR_RECENT_TEXTS = 3;

/**
 * buckets の1要素を鏡セルに間引く。
 * @param {unknown} item
 * @returns {LaneMirrorCell|null}
 */
function toMirrorCell(item) {
  const it = /** @type {{ displaySrc?: unknown, title?: unknown, meta?: { idLine?: unknown, nameLine?: unknown }, entry?: { userId?: unknown }, recentTexts?: unknown }} */ (
    item && typeof item === 'object' ? item : {}
  );
  const displaySrc = String(it.displaySrc || '').trim();
  const title = String(it.title || '').trim();
  const idLine = String(it.meta?.idLine || '');
  const nameLine = String(it.meta?.nameLine || '');
  const userId = String(it.entry?.userId || '').trim();
  // 会場一致gift/ad根治(2026-07-14): 鏡の会員資格=「照合キーを持つ」であり、displaySrcの
  //   有無ではない。displaySrc空+userId有りは restoreLaneMirrorBuckets(B-1・v0.1.1112)が
  //   anonymousIdenticonDataUrlで復元する正常なスリムセル。ここでuserIdを見ずに落とすと
  //   B-1の復元ロジックに永遠に到達できない(旧バグ=会場のgift/ad段DOM欠落の真因)。
  //   顔も素性(uid/idLine/title)も無いセルだけ従来どおり落とす(鏡に出せない)。
  const hasIdentity = userId !== '' || `${idLine.trim()}|${title}` !== '|';
  // v0.1.1235(鏡スリム化 B-2・書き手): ①が生成した匿名 identicon の data URL は uid から
  //   純関数で再生成できる(B-1・読み手側は :207-209 に実装済み)。1件約2.5KBを鏡から落とすと
  //   匿名258人で 622KB→33KB になり、512KB フェイルセーフの cap 半減が発動しない。
  //   ★実配信 lv351092763 で「①POP 266 / ③WEB鏡 137(たぬ姉が129へ半減)」を観測した根治。
  // ★バイト完全一致のときだけ落とす(可逆)。部分一致・data: 接頭辞判定は禁止=実サムネの
  //   data URL まで消して別人化する。広告段 yukkuriFaceFor(seed=roomKey≠uid)は不一致で残る。
  // ★hasIdentity は strip 前の値で判定済み(上行)。slim 後の空を見ると、落としたセルが
  //   丸ごと捨てられる(旧バグ=会場のgift/ad段DOM欠落と同じ穴)。
  const slimSrc =
    userId && displaySrc === anonymousIdenticonDataUrl(userId, 64) ? '' : displaySrc;
  if (!slimSrc && !hasIdentity) return null;
  // v0.1.1220: 会場ホバーカードの直近発言。会場は鏡が使えるとき鏡を優先する
  //   (venueBar.js composeVenueBaseRows)ため、ここに載せないと候補側に足しても届かない
  //   =実際に v0.1.1218/1219 で2回踏んだ。純Web公開のサイズは1人あたり数十バイト。
  const recentTexts = Array.isArray(it.recentTexts)
    ? it.recentTexts.filter((t) => typeof t === 'string' && t).slice(0, LANE_MIRROR_RECENT_TEXTS)
    : [];
  return { displaySrc: slimSrc, title, idLine, nameLine, userId, recentTexts };
}

/**
 * 各段を cap 件に間引いた鏡 buckets を作る。
 * @param {Record<string, unknown[]>} buckets
 * @param {number} cap
 * @returns {Record<typeof LANE_MIRROR_TIERS[number], LaneMirrorCell[]>}
 */
function buildTiers(buckets, cap) {
  const out = /** @type {Record<string, LaneMirrorCell[]>} */ ({});
  for (const tier of LANE_MIRROR_TIERS) {
    const arr = Array.isArray(buckets?.[tier]) ? buckets[tier] : [];
    out[tier] = arr.slice(0, cap).map(toMirrorCell).filter(Boolean);
  }
  return /** @type {any} */ (out);
}

/**
 * buckets から「全段を切り捨てなく載せられる有限の cap」を求める(v0.1.1234)。
 *
 * ★なぜ Infinity を使わないか: buildLaneMirrorSnapshot の 512KB フェイルセーフ
 *   (cap を半減して作り直す)は**有限値でしか働かない**。Infinity を渡すと
 *   Math.floor(Infinity / 2) === Infinity となり半減が無力化し、超過スナップショットが
 *   そのまま書かれる。実際の最大段長(有限)を渡せば slice は無発動のまま
 *   「全員載せる」と「容量の最終防衛」を両立できる。
 *
 * @param {Record<string, unknown[]>|null|undefined} buckets
 * @returns {number} 1以上の有限値
 */
export function laneMirrorCapFromBuckets(buckets) {
  let max = 0;
  for (const tier of LANE_MIRROR_TIERS) {
    const arr = Array.isArray(buckets?.[tier]) ? buckets[tier] : [];
    if (arr.length > max) max = arr.length;
  }
  return Math.max(1, max);
}

/**
 * storage 書き込み用の鏡スナップショット。容量超過時は cap を半減して作り直す(status を重くしない)。
 * @param {{ liveId?: unknown, buckets?: Record<string, unknown[]>, pickedLength?: unknown,
 *   totalCandidates?: unknown, domSelf?: unknown }} input
 * @param {{ cap?: number, nowMs?: number, writer?: string }} [opts]
 *   writer: この鏡を焼いた主体('popup' 既定)。★2026-08-08 追加。将来 content 側の
 *   書き手を足したとき「最後に書いたのは誰か」を読み手が見分けられるようにするための印。
 * @returns {LaneMirrorSnapshot}
 */
export function buildLaneMirrorSnapshot(input, opts = {}) {
  const liveId = String(input?.liveId || '');
  const buckets = input?.buckets && typeof input.buckets === 'object' ? input.buckets : {};
  const pickedLength = Math.max(0, Math.floor(Number(input?.pickedLength) || 0));
  const totalCandidates = Math.max(0, Math.floor(Number(input?.totalCandidates) || 0));
  const domSelf = normalizeDomSelf(input?.domSelf);
  const nowMs = Number.isFinite(Number(opts?.nowMs)) ? Number(opts.nowMs) : 0;
  let cap = Math.max(1, Math.floor(Number(opts?.cap) || 48));

  /** @param {number} c */
  const make = (c) => {
    const tiers = buildTiers(/** @type {any} */ (buckets), c);
    return {
      liveId,
      capturedAt: nowMs,
      ...tiers,
      domSelf,
      pickedLength,
      totalCandidates,
      // ★2026-08-08: 誰がこの鏡を焼いたか。既定は 'popup'(=①の描画経路)。
      //   背景: 会場/③WEBが古い鏡を見る症状の切り分けで「最後に書いたのは誰か」が
      //   読めないと、書き手を増やしたとき静かな上書き劣化に気づけない。
      //   ★laneMirrorContract.js:80 の「唯一の書き手」不変条件は現時点では維持している。
      //     将来 content 側の書き手を足すなら、この値で見分けられるようにしておく。
      writer: String(opts?.writer || 'popup'),
      // v0.1.1137(lanescene-structural-review MVP): revisionはcapturedAt(壁時計)をそのまま使う
      //   (新規カウンタを作らない)。
      // 会場一致gift/ad根治(2026-07-14 Patch 2b): contentHashは復元正準形(読み手B-1適用後)で
      //   署名する=会場が実際に受け取り描く中身とバイト同一の範囲。displaySrc空+uid有りのスリム
      //   セルはB-1でidenticonに復元されるため、復元前(tiers生値)で署名すると会場が正しく
      //   描いても①=会場のhashが恒常的に不一致になる(scene行の偽🔴を防ぐための必須対応)。
      contentHash: laneSceneContentHash(
        /** @type {any} */ (restoreLaneMirrorBuckets(/** @type {any} */ (tiers)))
      )
    };
  };

  let snap = make(cap);
  // 容量上限を超えたら cap を半減して作り直す(最大2回まで=最小16件)。
  for (let i = 0; i < 2; i += 1) {
    if (JSON.stringify(snap).length <= LANE_MIRROR_MAX_JSON_BYTES) break;
    cap = Math.max(16, Math.floor(cap / 2));
    snap = make(cap);
  }
  return /** @type {LaneMirrorSnapshot} */ (snap);
}

/**
 * 鏡スナップショットを paintStoryUserLaneDomFilled が受ける buckets 形({displaySrc,title,meta,entry})に復元する。
 * @param {Partial<LaneMirrorSnapshot>|null|undefined} snap
 * @returns {{ link: object[], gift: object[], ad: object[], konta: object[], tanu: object[] }}
 */
export function restoreLaneMirrorBuckets(snap) {
  const s = /** @type {any} */ (snap && typeof snap === 'object' ? snap : {});
  const restore = (/** @type {unknown} */ arr) =>
    (Array.isArray(arr) ? arr : []).map((c) => {
      const cell = /** @type {LaneMirrorCell} */ (c && typeof c === 'object' ? c : {});
      const userId = String(cell.userId || '').trim();
      // v0.1.1112 B-1: displaySrc 空+uid有り=スリム化された匿名セル→①と同じ顔を再生成(冪等)。
      const displaySrc =
        String(cell.displaySrc || '') || (userId ? anonymousIdenticonDataUrl(userId, 64) : '');
      return {
        displaySrc,
        title: String(cell.title || ''),
        meta: { idLine: String(cell.idLine || ''), nameLine: String(cell.nameLine || '') },
        entry: { userId }
      };
    });
  return {
    link: restore(s.link),
    gift: restore(s.gift),
    ad: restore(s.ad),
    konta: restore(s.konta),
    tanu: restore(s.tanu)
  };
}

/**
 * ★v0.1.1300: 実DOM受領証(Receipt)を鏡データ本体から分離して組む純関数。
 *
 * ■ なぜ分離するか
 *   domSelf は「①(サイドパネル)が実際に描いた DOM の要約」= 表示面固有の受領証。
 *   配信の共通データではない。会場は別ドキュメントの DOM を持つので、
 *   受領証をデータ本体に同梱したままだと「同じデータなのに hash が違う」を
 *   構造的に作る(=完全一致を永久に名乗れない)。
 *   → データ(共通・全 reader が等値で持つ)と受領証(表示面ごと)を分け、
 *     contentHash で安全に関連付ける。
 *
 * ■ 比較のしかた(laneMirrorContract.js の domSelf 指紋契約と同じ規律)
 *   `receipt.fingerprintFor === snap.contentHash` のときだけ指紋を硬く比較する。
 *   一致しなければ「⚪指紋未計測」へ逃がす=時計(measuredAt)では判定しない。
 *   ★時計で切ると、sig一致で描画をスキップしている間の「古くて正しい指紋」を
 *     捨ててしまう。内容アドレスならその誤りが起きない。
 *
 * @param {{ liveId?: unknown, domSelf?: unknown, contentHash?: unknown }} input
 * @param {{ nowMs?: number, surface?: string }} [opts] surface=どの表示面の受領証か
 * @returns {{ liveId: string, surface: string, capturedAt: number,
 *   fingerprint: string, fingerprintFor: string, measured: boolean,
 *   perTier: object, dpr: number, measuredAt: number }}
 */
export function buildLaneReceipt(input, opts = {}) {
  const dom = normalizeDomSelf(input?.domSelf);
  const nowMs = Number.isFinite(Number(opts?.nowMs)) ? Number(opts.nowMs) : 0;
  return {
    liveId: String(input?.liveId || '').trim().toLowerCase(),
    // 表示面の名前。①=popup(サイドパネル内) / 会場=venue。
    // ★受領証は表示面ごとに別物=どの面のものか名乗れないと比較できない。
    surface: String(opts?.surface || 'popup'),
    capturedAt: nowMs,
    fingerprint: dom.fingerprint,
    // ★この受領証が「どの内容」を測ったかの内容アドレス。
    //   受け手はこれが snapshot.contentHash と一致するときだけ硬く比較する。
    fingerprintFor: String(input?.contentHash || dom.fingerprintFor || ''),
    measured: dom.measured,
    perTier: dom.perTier,
    dpr: dom.dpr,
    measuredAt: dom.measuredAt
  };
}

/**
 * ★v0.1.1300: 受領証と鏡が「同じ内容を指しているか」を判定する純関数。
 *
 * @param {{ contentHash?: unknown }|null|undefined} snap 鏡 snapshot
 * @param {{ fingerprintFor?: unknown, fingerprint?: unknown }|null|undefined} receipt
 * @returns {{ comparable: boolean, reason: string }}
 *   comparable=true のときだけ指紋を硬く比較してよい。
 */
export function isReceiptComparable(snap, receipt) {
  const hash = String(snap?.contentHash || '').trim();
  const forHash = String(receipt?.fingerprintFor || '').trim();
  const fp = String(receipt?.fingerprint || '').trim();
  if (!hash) return { comparable: false, reason: '鏡にcontentHashが無い' };
  if (!receipt) return { comparable: false, reason: '受領証が無い(未描画)' };
  if (!fp) return { comparable: false, reason: '指紋未計測' };
  if (!forHash) return { comparable: false, reason: '受領証が対象内容を名乗っていない' };
  if (forHash !== hash) return { comparable: false, reason: '受領証は別の内容を測っている(世代差)' };
  return { comparable: true, reason: '' };
}
