// laneMirrorContract.js
/**
 * `KEY_LANE_MIRROR`(応援レーンの鏡)の【契約の正本】。
 *
 * ★なぜこのファイルが要るか(2026-08-06・会場パリティが8回再発した構造的真因):
 *   同じ1つのキーについて、書き手と読み手が【正反対のこと】をコメントに書いていた。
 *     書き手 popup-entry.js: 「会場には一切関係しない=popup と status だけ」
 *     読み手 venueBar.js   : 「①の実paint鏡を【会場の正本に昇格】」
 *   書き手は会場を客だと思っておらず、読み手はそれを正本だと思っている。
 *   この状態では片側の変更がもう片側へ無言で伝播し、直しても直しても再発する。
 *   → 消費者を1箇所に列挙し、CI(laneMirrorContract.registry.test.js)が実 import と
 *     照合する。「書き手が読者を知らない」状態を構造的に作れなくする。
 *
 * ★このモジュールの責務
 *   - 消費者登録簿(LANE_MIRROR_CONSUMERS)を持つ
 *   - 読み口の関所(sanitizeLaneMirrorForRead)で段別の不変条件を強制する
 * ★このモジュールが担わないこと
 *   - 鏡の生成(laneMirror.js)・書き出し(mirrorBundleFlushScheduler.js)・描画(各entry)
 *   - DOM/chrome API への依存(純関数のみ=テストしやすさを保つ)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★domSelf の指紋契約(venue-exact-parity-SPEC-2026-08-07 §3-2/§6・v0.1.1284)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   snapshot.domSelf は【①が実際に描いた DOM の要約】であり、次の3フィールドを運ぶ:
 *
 *     fingerprint     … ①の可視タイル列の userKey を段別に並べた指紋(laneDomFingerprint)。
 *                        鍵は共有renderer が刻む `dataset.userKey = venueLaneParityKey(p)`
 *                        (renderStoryUserLaneDom.js)なので、①実DOM・会場実DOM・鏡キー列の
 *                        3起点が【同じアルファベット】で読める。
 *     fingerprintFor  … その指紋が「どの内容」を測ったかの【内容アドレス】= publish 直前の
 *                        snapshot.contentHash。会場は `fingerprintFor === snap.contentHash` の
 *                        ときだけ指紋を硬く比較し、それ以外は ⚪(指紋未計測)へ逃がす。
 *                        ★時計(measuredAt)では判定しない: sig一致で描画をスキップしている間は
 *                          DOM が不変=指紋は「古くて正しい」ので、時計で切ると正しい値を捨て、
 *                          切らないと嘘を通す。内容アドレスならどちらの誤りも起きない。
 *     measuredAt      … 診断表示専用(会場の line に「①DOM齢Ns」)。verdict には影響させない。
 *
 *   ★keys(キー列そのもの)は snapshot に載せない。hash だけを運ぶ
 *     (500人分 ~12KB/publish は 512KB フェイルセーフの守備範囲外・census の
 *      「keys は storage へ出さない」既定=venueDomCensus.js:20 にも逆行する)。
 *     「誰が欠けたか」の名指しは既存の parity 層(欠/余サンプル)の縄張りで、
 *     指紋は【一致の証明】に徹する。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★「会場=①完全一致」の読み方(状態速報の2行を AND で読む)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   「会場一致 ✅」(venueLaneParity.js) ∧ 「scene … 指紋①=会場 ✅」(laneSceneEnvelope.js)
 *   が【同時に立って初めて】完全一致。どちらか一方の緑は完全一致を意味しない。
 *     - 会場一致行 = 鏡データ ⇄ 会場の段割当 ⇄ 会場実DOM の突合(件数・寸法・重複)
 *     - scene 行   = ①実DOM ⇄ 会場実DOM の【顔ぶれ列】突合(世代・内容・指紋の3層)
 *
 *   ★関所が①の契約違反セルを落とした場合、scene 行は contentHash 差で 🔴 になる
 *     (①が焼いた hash は落とす【前】の値のため)。これは嘘の赤ではなく
 *     【書き手(①)の契約違反の名指し】である。同時に出る `鏡除外N` がその件数。
 */

import { isAnonymousStyleNicoUserId } from '../domain/user/identity.js';

/** コード上の契約版。★snapshot には書かない(MVP は書式不変=旧読者を壊さない)。 */
export const LANE_MIRROR_CONTRACT_VERSION = 1;

/**
 * `KEY_LANE_MIRROR` を実 import する全ファイルと、その役割。
 *
 * ★ここは「実際に import しているか」を registry テストが grep で照合する。
 *   コメントで言及しているだけのファイル(commentTimelineMirrorKey.js 等)は含めない。
 *   新しい読者/書き手を足したらここに追記しないと CI が赤になる=契約の同期漏れを止める。
 *
 * @type {ReadonlyArray<{ file: string, role: 'writer'|'reader', note: string }>}
 */
export const LANE_MIRROR_CONSUMERS = Object.freeze([
  Object.freeze({
    file: 'src/extension/popup-entry.js',
    role: 'writer',
    // 書くのは renderStoryUserLane 内の publishLaneMirror 1箇所のみ。
    // INLINE_PASSIVE(②応援プレビュー)は書かない=受動ビューの不可侵原則。
    // 自身も passive 描画のために read する(7063行)。
    note: '唯一の書き手(publishLaneMirror)。passive時は書かず読むだけ'
  }),
  Object.freeze({
    file: 'src/extension/status-entry.js',
    role: 'reader',
    note: '③WEB/状態速報が本物の描画関数で描くために読む'
  }),
  Object.freeze({
    file: 'src/extension/venueBar.js',
    role: 'reader',
    // ★v0.1.1111 で「会場の正本に昇格」。会場は鏡があれば鏡の5段をそのまま使い、
    //   無ければ fallback(席から組む)へ落ちる。fallback は gift/ad を作れない(原理)。
    note: '会場モードの正本(v0.1.1111)。鏡が無い/古すぎると fallback へ降格'
  }),
  Object.freeze({
    file: 'src/lib/mirrorBundleFlushScheduler.js',
    role: 'writer',
    note: '5鏡を1回の storage.set に合流させる書き出し口(同一tick化の書き側)'
  }),
  Object.freeze({
    file: 'src/lib/statusExtrasBatch.js',
    role: 'reader',
    note: '状態速報の extras 一括read(12秒間引き)の一員として読む'
  })
]);

/** 鏡が持つ5段。①の tier 法と同じ順序。 */
export const LANE_MIRROR_TIERS = Object.freeze(['link', 'gift', 'ad', 'konta', 'tanu']);

/**
 * 段別の不変条件(★①自身の tier 法がそのまま normative source)。
 *
 *   link : 匿名不可 — domain/lane/columns/linkPolicy.js が `isAnonymousStyleNicoUserId` で弾く
 *   konta: 匿名不可 — 同 kontaPolicy.js
 *   tanu : 匿名【可】 — 同 tanuPolicy.js が匿名を吸収する段(ここで落とすと①と食い違う)
 *   gift/ad: uid 無しセルを許可 — 広告主/ギフト送り主は uid が取れないことがある
 *            (①の gift/ad は tier 判定を通さない後付けなので uid 有無を条件にできない)
 */
const ANONYMOUS_FORBIDDEN_TIERS = Object.freeze(['link', 'konta']);
const UNKEYED_ALLOWED_TIERS = Object.freeze(['gift', 'ad']);

/** @param {unknown} v */
function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * 読み口の関所。段別の不変条件を強制し、違反セルを落として件数と理由を返す。
 *
 * ★なぜ読み口で守るか: 会場の2経路(鏡 / fallback)で「法」が食い違っていた。
 *   fallback(venueLaneBuckets.js) は匿名を弾くのに、鏡経路(composeVenueLaneBuckets)は
 *   鏡の段構成を【無検査で】信じる。どちらを通ったかで画面のルールが変わる状態だった。
 *
 * ★セルの中身は一切作り変えない(spread で写すのみ)。
 *   個別フィールドを列挙して作り直す関数が中継のたびに値を落とすのが、このリポの
 *   再発バグ類型([[venue-mirror-is-the-primary-path-2026-08-01]])。同じ轍を踏まない。
 *
 * @param {unknown} rawSnap 鏡 snapshot(storage から読んだ生の値)
 * @returns {{
 *   snap: object|null,          // 検査を通った snapshot(null=使えない=fallbackへ)
 *   droppedLinkAnon: number,    // link 段から落とした匿名セル数
 *   droppedKontaAnon: number,   // konta 段から落とした匿名セル数
 *   droppedUnkeyed: number,     // uid 無しで落としたセル数(gift/ad 以外)
 *   issues: string[]            // 使えない理由(fail-closed の根拠)
 * }}
 */
export function sanitizeLaneMirrorForRead(rawSnap) {
  /** @type {string[]} */
  const issues = [];
  /** @type {{ snap: object|null, droppedLinkAnon: number, droppedKontaAnon: number, droppedUnkeyed: number, issues: string[] }} */
  const empty = { snap: null, droppedLinkAnon: 0, droppedKontaAnon: 0, droppedUnkeyed: 0, issues };

  if (!rawSnap || typeof rawSnap !== 'object') {
    issues.push('snapshotが無い');
    return empty;
  }
  const snap = /** @type {Record<string, any>} */ (rawSnap);
  // 単一グローバルキーなので、別配信の①が最後に書いた鏡を掴みうる。
  // liveId が無い鏡は「どの配信のものか名乗れない」=使えない(照合は呼び出し側の責務)。
  if (!String(snap.liveId || '').trim()) {
    issues.push('liveIdが空');
    return empty;
  }
  // ★段は snapshot の【トップレベル】にある(`snap.link` …)。`snap.buckets` は存在しない。
  //   書き手 laneMirror.js:177-193 が `{ liveId, capturedAt, ...tiers, domSelf, … }` と
  //   spread で展開するため。v0.1.1280 で `snap.buckets` を探して【鏡を100%捨てていた】
  //   (会場だけが fallback へ降格し gift/ad 段が消えた真因)。
  //   ここは restoreLaneMirrorBuckets / venueRowsFromLaneMirror と同じ読み方に揃える。
  if (!LANE_MIRROR_TIERS.some((tier) => Array.isArray(/** @type {any} */ (snap)[tier]))) {
    issues.push('段が無い');
    return empty;
  }

  let droppedLinkAnon = 0;
  let droppedKontaAnon = 0;
  let droppedUnkeyed = 0;

  /** @type {Record<string, any[]>} */
  const nextTiers = {};
  for (const tier of LANE_MIRROR_TIERS) {
    const rows = asArray(/** @type {any} */ (snap)[tier]);
    const kept = [];
    for (const cell of rows) {
      // ★uid は二刀流で読む。鏡セルは laneMirror.js:119 が返す【フラット】形
      //   `{ displaySrc, title, idLine, nameLine, userId, recentTexts }` で、
      //   `entry.userId` は復元後(restoreLaneMirrorBuckets)にしか生えない。
      //   venueLaneParity.js:63 の venueLaneParityKey が既に二刀流=それに揃える。
      const uid = String(cell?.userId ?? cell?.entry?.userId ?? '').trim();
      if (!uid) {
        // uid 無しは gift/ad(広告主・送り主)だけ許す。
        if (UNKEYED_ALLOWED_TIERS.includes(tier)) {
          kept.push(cell);
        } else {
          droppedUnkeyed += 1;
        }
        continue;
      }
      if (ANONYMOUS_FORBIDDEN_TIERS.includes(tier) && isAnonymousStyleNicoUserId(uid)) {
        if (tier === 'link') droppedLinkAnon += 1;
        else droppedKontaAnon += 1;
        continue;
      }
      kept.push(cell);
    }
    nextTiers[tier] = kept;
  }

  // ★他フィールド(capturedAt/pickedLength/totalCandidates/domSelf 等)は spread で丸ごと写す。
  //   旧版が書いた snapshot(新フィールド無し)もそのまま通る=additive-only の互換。
  // ★段は【トップレベルへ書き戻す】。下流(restoreLaneMirrorBuckets:228-232 /
  //   venueRowsFromLaneMirror / laneMirrorTierKeySequences)は全て `s[tier]` を読むため、
  //   `buckets` に入れて返すと関所を通した瞬間に全段が空として扱われる。
  return {
    snap: { ...snap, ...nextTiers },
    droppedLinkAnon,
    droppedKontaAnon,
    droppedUnkeyed,
    issues
  };
}
