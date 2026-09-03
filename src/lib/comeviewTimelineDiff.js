/**
 * comeviewTimelineDiff.js — コメビュの「整合(reconcile)」を差分で描くための純関数。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜ要るか（実機症状・2026-09-03 ユーザー報告「りりーすしたものはちらちらしていました」）
 * ─────────────────────────────────────────────────────────────────────────
 *   comeview-entry.js の renderFullTimeline は 60秒ごと(RECONCILE_INTERVAL_MS)に
 *     listEl.innerHTML = timeline.map(timelineRowHtml).join('')
 *   で TIMELINE_LIMIT(120)行を【全部破棄して作り直して】いた。
 *   ⟹ 全 <img>(アバター)が破棄→再取得され、キャッシュに無いものは一瞬空白になる。
 *     これが「60秒ごとにちらつく」の正体（★短時間では再現しない＝60秒待つと必ず出る）。
 *
 *   ★対して新着追加パス(appendTimelineItems)は最初から正しい追記のみ設計だった。
 *     整合パスだけが全再構築で、しかも直前に _renderedKeys/_timelineItemsByKey を
 *     clear() して【せっかくある鍵を捨てて】いた。
 *
 * ★この関数がやること: 「今DOMに並んでいる key 列」と「あるべき timeline」を突き合わせ、
 *   消す key・足す item・作り直しが要るか を返すだけ。DOM は触らない(呼び出し側の仕事)。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★設計の要（ここを外すと過去の事故が再発する）
 * ─────────────────────────────────────────────────────────────────────────
 *   ★(a) 「変化が無いときは触らない」が目的。「全再構築を無くす」ことではない。
 *        整合の本来の役目は「テール/IDB とのズレを直す」なので、順序が入れ替わる
 *        ケースは【正直に全再構築へ倒す】(reorderNeeded=true)。無理に差分で表現しない。
 *
 *   ★(b) 二重表示の防波堤。comeview-entry.js:1639 の
 *          pickNewComeviewTimelineItems(appended, _renderedKeys)
 *        が「もう出したか」の【唯一の判定】で、_renderedKeys が DOM とズレると
 *        同じコメントが2行出る。これは実際に起きた事故:
 *          v0.1.671 f6275931「二重表示根治」/ v0.1.672 9a04cabb「残り2経路を根治」
 *        ★従来は clear()+innerHTML が同時だったので【全再構築が一致を保証していた】。
 *          差分にするとその保証が消えるため、呼び出し側は remove した要素を必ず
 *          forgetTimelineElement に通すこと(keys と DOM を同時に動かす)。
 *
 *   ★(c) 時刻を鍵に混ぜない。key は item.key(既存の識別子)だけを使う。
 *        [[timestamp-in-dedupe-key-double-counts]] / v0.1.1409 / v0.1.1412 で
 *        このリポは「署名に時刻を入れて毎tick再構築」を3回踏んでいる。
 *
 * ★このモジュールは純関数のみ(DOM も chrome API も触らない)。
 * @module comeviewTimelineDiff
 */

/**
 * @typedef {Object} ComeviewTimelineDiff
 * @property {string[]} removeKeys      DOM から取り除く key(timeline に無くなったもの)
 * @property {Array<any>} appendItems   末尾に足す item(DOM にまだ無いもの・timeline 順)
 * @property {boolean} reorderNeeded    true なら差分で表現できない=全再構築へ倒す
 * @property {boolean} unchanged        true なら DOM を1バイトも触らなくてよい
 */

/**
 * 現在の DOM の key 列と、あるべき timeline を突き合わせて差分を出す。
 *
 * ★判定の順序:
 *   1. 残る key(= timeline にもある key)が DOM 上と timeline 上で【同じ並び】か。
 *      違えば reorderNeeded=true(呼び出し側は従来どおり全再構築)。
 *   2. 足す item は「timeline にあって DOM に無い」もの。★ただし残存分の【後ろ】に
 *      並んでいる場合だけ末尾 append で表現できる。間に挟まるなら reorderNeeded=true。
 *   3. 何も消さず何も足さないなら unchanged=true。
 *
 * @param {ReadonlyArray<string>} domKeys 今 DOM に並んでいる key(文書順)
 * @param {ReadonlyArray<any>} timeline   あるべき item 列(表示順)
 * @returns {ComeviewTimelineDiff}
 */
export function diffComeviewTimeline(domKeys, timeline) {
  const dom = Array.isArray(domKeys) ? domKeys.filter((k) => typeof k === 'string' && k) : [];
  const items = Array.isArray(timeline) ? timeline.filter((it) => it && it.key) : [];

  const wantKeys = items.map((it) => String(it.key));
  const wantSet = new Set(wantKeys);

  // ★timeline(上流)側に重複 key があれば全再構築へ倒す。
  //   ここが無いと「同じ key の item を2つ append する」＝v0.1.671/672 の二重表示を
  //   自分で作る。★冗長に見えるが【実際に毒テストで赤くなることを確認した生きたガード】
  //   (dom 側の重複は後段の順序照合が必ず捕まえるので、専用ガードは置かない=死んだコードを残さない)。
  if (wantKeys.length !== wantSet.size) {
    return { removeKeys: [], appendItems: [], reorderNeeded: true, unchanged: false };
  }

  const domSet = new Set(dom);
  const removeKeys = dom.filter((k) => !wantSet.has(k));
  const keptFromDom = dom.filter((k) => wantSet.has(k));

  // ★残るものの相対順序が変わっていたら差分では表現しない(正直に全再構築)。
  const keptFromWant = wantKeys.filter((k) => domSet.has(k));
  if (keptFromDom.length !== keptFromWant.length) {
    return { removeKeys: [], appendItems: [], reorderNeeded: true, unchanged: false };
  }
  for (let i = 0; i < keptFromDom.length; i += 1) {
    if (keptFromDom[i] !== keptFromWant[i]) {
      return { removeKeys: [], appendItems: [], reorderNeeded: true, unchanged: false };
    }
  }

  // ★新しく足すものは「残存分より後ろ」に全部並んでいる必要がある(末尾 append で表現できる形)。
  //   間に挟まる新着があるなら差分では書けないので全再構築へ倒す。
  const lastKeptIndexInWant = keptFromWant.length
    ? wantKeys.lastIndexOf(keptFromWant[keptFromWant.length - 1])
    : -1;
  for (let i = 0; i < lastKeptIndexInWant; i += 1) {
    if (!domSet.has(wantKeys[i])) {
      return { removeKeys: [], appendItems: [], reorderNeeded: true, unchanged: false };
    }
  }

  const appendItems = items.slice(lastKeptIndexInWant + 1).filter((it) => !domSet.has(String(it.key)));

  return {
    removeKeys,
    appendItems,
    reorderNeeded: false,
    unchanged: removeKeys.length === 0 && appendItems.length === 0
  };
}
