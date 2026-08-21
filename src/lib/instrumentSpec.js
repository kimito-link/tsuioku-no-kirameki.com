/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】計器1つ1つの「何を・どこで・どの単位で・いつから測るか」の宣言と、
 *                     2つの計器を比較してよいかの判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】計器の意味(文書・単位・期間・正常範囲)の根拠はこのファイルのみ
 *
 * instrumentSpec.js — 計器の【宣言テーブル】。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ なぜ要るか(2026-08-20 ユーザー提案)
 *
 *   ユーザーがメール転送管理の Excel を示して言った:
 *   「計器ですがこういう厳密な管理体制の方がいっそうずれがないとおもう」
 *
 *   そのシートの1行はこうなっていた:
 *       サイト | 送信元メール | 件名 | 送信先グループ名 | 送信内容(範囲)
 *   ★**1行読めば「どこから来て・何を条件に・どこへ・何を送るか」が確定する。**
 *   ＝実装を読まなくても経路がたどれる＝ズレようがない。
 *
 * ■ ★この提案が正しいと分かる根拠 = 実際に起きた誤診4件(すべて司令塔の失敗)
 *
 *   ① **どの文書か**が無かった
 *      → `domNodes` は watch ページ本体を数えているのに、
 *        popup.html(iframe)の実測値 13,682 の再現に使えると誤認した。
 *   ② **何を数えるか**が無かった
 *      → `sentCount`(送信【回数】)と `receivedCount`(受け取った【iframe延べ数】)を
 *        割って「1.51倍＝二重注入の疑い」と誤診。★単位が違うので比較自体が無意味。
 *   ③ **いつからの値か**が無かった
 *      → リセット経路の無い生涯累計と気づかず、6週間・約320版ぶんを
 *        「いまの状態」として読んだ。
 *   ④ **何を数えるか**(別事例)
 *      → 速報の `tanu332` は【鏡データの件数】なのに、
 *        `memoryPressureProbe.js` の冒頭に「タイルが332枚」とDOM枚数として書いた。
 *
 *   ★4件とも「列が足りない」ことが原因。**実装の欠陥ではない。**
 *
 * ■ ★先例(新概念ではない)
 *   `statusReadPolicy.js`(v0.1.1446)が同型の宣言テーブル。
 *   `writtenBy: 'popup-entry.js:19444 (AI診断コピー時のみ)'` という形で
 *   **判断の根拠をコードに固定**している。ここの `sourceRef` はそれと同義。
 *
 * ■ ★掟(ユーザー決定「正確さがほしい。それを中心に」)
 *   1. **未記入を許さない**。7列すべて必須。**デフォルト値を用意しない**。
 *      ★`diagChannelRegistry` が3ヶ月「登録1件のまま」死んだのは、
 *        未記入がデフォルトで黙って通ったから。
 *   2. **主キーは `id + doc`**。同名計器は文書ごとに別行へ強制分割する(誤診①の構造的な塞ぎ)。
 *   3. **enum は決められた値のみ**。自由文字列を許すと台帳が濁って読めなくなる。
 *   4. `diagnosisRegistry.js` は触らない(104件の完全性スコア集計を壊さない)。
 *      ここは**別ファイルで並走**し、テストで突き合わせる。
 * ───────────────────────────────────────────────────────────────────────────
 */

/** どの文書で採った値か。★同じ名前の数字が2つの文書に存在しうる(誤診①)。 */
export const INSTRUMENT_DOCS = Object.freeze(['watch', 'popup', 'status', 'background']);

/**
 * 何を数えているか。★**単位が違うものを割ってはいけない**(誤診②④)。
 *   elements       … DOM要素の個数
 *   tiles          … タイル(セル)の枚数
 *   mirror_records … 鏡(mirror)データ上の件数 ★DOMではない(誤診④の当事者)
 *   batches        … 送受信の【回数】(1回に複数行を含む)
 *   rows           … 行の件数
 *   iframe_events  … iframe 側で起きた事象の延べ数 ★batches と割ってはいけない
 *   repaints       … 実際にDOMを貼り替えた回数
 *   ms / pct / bytes … 時間 / 割合 / バイト
 */
export const INSTRUMENT_UNITS = Object.freeze([
  'elements', 'tiles', 'mirror_records', 'batches', 'rows',
  'iframe_events', 'repaints', 'ms', 'pct', 'bytes'
]);

/**
 * いつからの値か。
 *   instant  … いまこの瞬間の値(スナップショット)
 *   session  … この画面を開いてからの累積
 *   lifetime … ★リセットされない生涯累積(誤診③の当事者)
 */
export const INSTRUMENT_WINDOWS = Object.freeze(['instant', 'session', 'lifetime']);

/**
 * 何が起きると0に戻るか。★`window` だけでは足りない実例があるので独立させた。
 *   `laneRepaintCounts` は storage 上のリセット経路が【無い】が、
 *   popup を開き直すとモジュールごと作り直され**事実上0に戻る**。
 *   `window:'lifetime'` とだけ書くと「ずっと積み上がる」と誤読する。
 */
export const INSTRUMENT_RESET_TRIGGERS = Object.freeze([
  'none', 'popup_reopen', 'navigation', 'extension_reload', 'live_switch'
]);

/**
 * @typedef {object} InstrumentSpecRow
 * @property {string} id 計器ID(diagnosisRegistry のセルIDと一致させる。無いものは独自ID)
 * @property {string} doc どの文書で採るか(INSTRUMENT_DOCS)
 * @property {string} unit 何を数えるか(INSTRUMENT_UNITS)
 * @property {string} window いつからの値か(INSTRUMENT_WINDOWS)
 * @property {string} resetTrigger 何が起きると0に戻るか(INSTRUMENT_RESET_TRIGGERS)
 * @property {string} sourceRef 採取している実装箇所(ファイル:行)
 * @property {string} normal 正常の範囲(人が読む文字列。判定の根拠)
 * @property {string} [note] 補足(誤診の当事者ならその経緯)
 */

/**
 * ★宣言テーブル本体。
 *
 * ★着手範囲(ユーザー決定): **誤診した4件＋DOM関連**。
 *   104件すべてを一度に埋めない。未記入の数は
 *   `instrumentSpecCoverage.test.js` が固定し、**増やしたら赤**にする。
 *
 * @type {ReadonlyArray<InstrumentSpecRow>}
 */
export const INSTRUMENT_SPEC = Object.freeze([
  /* ── ★v0.1.1463: 【パネルが黒い・重い】枠の3計器 ───────────────── */
  Object.freeze({
    id: 'auto-section', doc: 'popup', unit: 'ms',
    window: 'session', resetTrigger: 'popup_reopen',
    sourceRef: 'popup-entry.js:669(_measuredSection)',
    normal: 'カバー率>=30%で初めて犯人を名指しできる',
    note: '★区間そのものを実測する。markBlockerSection はラベルを置くだけで'
      + ' finally で抜けた瞬間に戻すため、囲んでいても「(拡張の外)」と出ていた。'
      + ' ★50ms未満も捨てない(20ms×100回=2秒が見えなくなるため)'
  }),
  Object.freeze({
    id: 'dom-tree', doc: 'popup', unit: 'elements',
    window: 'instant', resetTrigger: 'popup_reopen',
    sourceRef: 'popup-entry.js:19420(getElementsByTagName走査)',
    normal: '深さ<=20 / 1親の子<=60',
    note: '★市販のDOM可視化拡張は chrome-extension:// に注入できないので'
      + ' サイドパネルの中身には届かない＝自前で採る。走査は上限4000で1回のみ'
  }),
  Object.freeze({
    id: 'panel-cover', doc: 'popup', unit: 'rows',
    window: 'instant', resetTrigger: 'popup_reopen',
    sourceRef: 'popup-entry.js:19410',
    normal: '暗くて不透明な層が中央を覆っていないこと',
    note: '★覆いが無いのも正常として出す。実機では✅正常だった＝'
      + ' 黒く塗る要素は存在せず、停止で描けていないだけ、という切り分けの証拠になる'
  }),
  /* ── 誤診①の当事者: 同じ名前が2つの文書に存在する ───────────────── */
  Object.freeze({
    id: 'dom-nodes', doc: 'watch', unit: 'elements',
    window: 'instant', resetTrigger: 'navigation',
    sourceRef: 'content-entry.js:7052',
    normal: '<=1500(業界推奨)',
    note: '★watchページ本体の数。popup.html(iframe)は含まない。'
      + ' 13,682 は popup 側の値なので【この行では再現できない】(誤診①)'
  }),
  /*
   * ★この行はまだ【製品コードで採取していない】(Step1 で evaluate_script で測る段階)。
   *   それでも `sourceRef` に「どこで採るか」を書く＝**測る場所を先に固定する**。
   *   ★空欄やダミーを許すと台帳が濁る(ユーザー決定「正確さ中心」)。
   */
  Object.freeze({
    id: 'dom-nodes', doc: 'popup', unit: 'elements',
    window: 'instant', resetTrigger: 'popup_reopen',
    sourceRef: 'renderStoryUserLaneDom.js:120',
    normal: '<=1500(業界推奨) / 実測: タイル0枚で1092・1108枚で13682',
    note: '★DOMが膨らむのはこちら。1タイル=5要素(personTileDom.js)。'
      + ' ★製品コードでの常時採取は未実装＝Step1 は evaluate_script で測る'
  }),
  Object.freeze({
    id: 'memory-pressure', doc: 'watch', unit: 'pct',
    window: 'instant', resetTrigger: 'navigation',
    sourceRef: 'content-entry.js:7052',
    normal: '<70%(warn) / <85%(bad)',
    note: 'performance.memory は Chrome限定・同一プロセスのJSヒープのみ'
  }),

  /* ── 誤診②の当事者: 単位が違うのに割った ─────────────────────── */
  Object.freeze({
    id: 'instant-push-sent', doc: 'watch', unit: 'batches',
    window: 'lifetime', resetTrigger: 'none',
    sourceRef: 'content-entry.js:4187',
    normal: '(比較対象なし)',
    note: '★送った【回数】。1回に複数行を含む。'
      + ' receivedCount(iframe延べ数)と割ってはいけない(誤診②)'
  }),
  Object.freeze({
    id: 'instant-push-received', doc: 'popup', unit: 'iframe_events',
    window: 'lifetime', resetTrigger: 'none',
    sourceRef: 'popup-entry.js:6472',
    normal: '(比較対象なし)',
    note: '★生存する iframe が各自1回ずつ数える延べ数。sent と母集団が違う'
  }),
  Object.freeze({
    id: 'instant-reject', doc: 'popup', unit: 'iframe_events',
    window: 'lifetime', resetTrigger: 'none',
    sourceRef: 'popup-entry.js:6415',
    normal: '(比較対象なし)',
    note: 'nonce不一致 or 行の検証落ちで破棄した数'
  }),

  /* ── 誤診③の当事者: リセットされないのに「いまの状態」と読んだ ───── */
  Object.freeze({
    id: 'lane-repaint', doc: 'popup', unit: 'repaints',
    window: 'lifetime', resetTrigger: 'popup_reopen',
    sourceRef: 'renderStoryUserLaneDom.js:479',
    normal: '(差分で読む。絶対値に意味は無い)',
    note: '★replaceChildren した回数だけ+1。呼び出し回数ではない。'
      + ' storage上のリセットは無いが popup 再開で0に戻る＝none と書くと誤読する'
  }),

  /* ── DOM/レーン関連(調査対象) ──────────────────────────────── */
  Object.freeze({
    id: 'host-duplicate', doc: 'watch', unit: 'batches',
    window: 'session', resetTrigger: 'navigation',
    sourceRef: 'inlineHostMoveProbe.js:64',
    normal: '0(重複は仕様上あってはならない)',
    note: '★v0.1.1125から数えていたが読み手が居らず枠に出ていなかった'
  }),
  Object.freeze({
    id: 'host-move', doc: 'watch', unit: 'batches',
    window: 'session', resetTrigger: 'navigation',
    sourceRef: 'content-entry.js:7038',
    normal: '<3回',
    note: 'host のDOM移設。iframe リロードの実害を伴う'
  }),
  Object.freeze({
    id: 'lane-tick', doc: 'popup', unit: 'batches',
    window: 'session', resetTrigger: 'popup_reopen',
    sourceRef: 'popup-entry.js:19289',
    normal: '>0(0なら描画が起動していない)',
    note: 'レーン描画の起動回数'
  }),
  Object.freeze({
    id: 'lane-paint', doc: 'popup', unit: 'ms',
    window: 'instant', resetTrigger: 'popup_reopen',
    sourceRef: 'popup-entry.js:19289',
    normal: '(実測値。閾値は未確定)',
    note: 'レーン描画の所要'
  }),
  Object.freeze({
    id: 'lane-hollow', doc: 'popup', unit: 'tiles',
    window: 'instant', resetTrigger: 'popup_reopen',
    sourceRef: 'renderStoryUserLaneDom.js:120',
    normal: '0(LOD停止中は0が正常)',
    note: '中身LOD が効いているかの実測。LANE_CONTENT_LOD_ENABLED=false の間は必ず0'
  }),

  /* ── 誤診④の当事者: 鏡データをDOM枚数と読んだ ────────────────── */
  Object.freeze({
    id: 'venue-lane-pop', doc: 'popup', unit: 'mirror_records',
    window: 'instant', resetTrigger: 'live_switch',
    sourceRef: 'venueLaneParity.js:389',
    normal: '(件数。DOM枚数ではない)',
    note: '★速報の「会場一致 … tanu332」の332はこれ。'
      + ' ★DOMのタイル枚数ではない(誤診④)。実DOM枚数は同行の「可視N」を見る'
  })
]);

/**
 * 主キー(id + doc)を作る。★同名計器を文書ごとに別行へ分けるための鍵。
 * @param {{ id?: unknown, doc?: unknown }} row
 * @returns {string}
 */
export function specKey(row) {
  return `${String(row?.id ?? '')}@${String(row?.doc ?? '')}`;
}

/** @type {Map<string, InstrumentSpecRow>} */
const BY_KEY = new Map(INSTRUMENT_SPEC.map((r) => [specKey(r), r]));

/**
 * 台帳から1行引く。
 * ★`doc` を省略した場合、その id の行が**1つだけ**なら返す。
 *   複数あるなら **null**(どちらか分からないまま返さない＝誤診①の再発防止)。
 * @param {string|{ id?: string, doc?: string }} q
 * @returns {InstrumentSpecRow|null}
 */
export function findInstrumentSpec(q) {
  if (typeof q === 'string') {
    const hits = INSTRUMENT_SPEC.filter((r) => r.id === q);
    return hits.length === 1 ? hits[0] : null;
  }
  const id = String(q?.id ?? '');
  const doc = String(q?.doc ?? '');
  if (id && doc) return BY_KEY.get(specKey({ id, doc })) ?? null;
  if (id) {
    const hits = INSTRUMENT_SPEC.filter((r) => r.id === id);
    return hits.length === 1 ? hits[0] : null;
  }
  return null;
}

/**
 * @typedef {object} ComparabilityVerdict
 * @property {boolean} comparable 2つの計器を比較(割り算・引き算)してよいか
 * @property {string} reason 人が読む理由
 */

/**
 * ★2つの計器を**比較してよいか**を構造で返す純関数。
 *
 * ★これが「1.51倍」の誤診を機械的に止める装置。
 *   単位・文書・期間のどれかが違えば **comparable:false**。
 *
 * @param {string|{id?:string,doc?:string}} a
 * @param {string|{id?:string,doc?:string}} b
 * @returns {ComparabilityVerdict}
 */
export function judgeInstrumentSpec(a, b) {
  const ra = findInstrumentSpec(a);
  const rb = findInstrumentSpec(b);
  if (!ra || !rb) {
    return {
      comparable: false,
      reason: '台帳に無い(または文書が特定できない)計器は比較できない。まず宣言を足す。'
    };
  }
  if (ra.doc !== rb.doc) {
    return {
      comparable: false,
      reason: `文書が違う(${ra.doc} vs ${rb.doc})。別の文書の数字は比較できない。`
    };
  }
  if (ra.unit !== rb.unit) {
    return {
      comparable: false,
      reason: `単位が違う(${ra.unit} vs ${rb.unit})。数えているものが違うので割ってはいけない。`
    };
  }
  if (ra.window !== rb.window) {
    return {
      comparable: false,
      reason: `期間が違う(${ra.window} vs ${rb.window})。母集団が違うので比較できない。`
    };
  }
  return { comparable: true, reason: '文書・単位・期間が一致。比較してよい。' };
}
