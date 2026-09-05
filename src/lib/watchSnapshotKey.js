/**
 * heavy read の「まだ現配信のものか」を判定する snapshotKey を作る純関数。
 *
 * ★2026-08-11(v0.1.1324) 会場の鏡が映らない件の真因:
 *   実機計器が `heavySettleState: "stale-snapshot" / heavyEverSettled: false /
 *   heavyRaceReturns: 36` を出し続け、応援レーンが light(暫定)だけで描かれて
 *   98枚→1枚に潰れていた(= 会場は①の鏡なので、会場にも映らない)。
 *
 * ■ 何が起きていたか
 *   旧: `snapshotKey = `${lv}|${url}|s17``  ← url を【生のまま】鍵に入れていた。
 *   url は `pickWatchUrlFromMultipleSources`(popupWatchUrlResolveMultiTab.js)が
 *   返す値で、勝った供給元によって**同じ配信でも文字列が違う**:
 *     - inlineParam  : `buildInlineOwnWatchUrlFromLv` が lv から組む正規形
 *                      → 例 `https://live.nicovideo.jp/watch/lv351148095`
 *     - activeTab 等 : ブラウザが持つ実URLそのまま
 *                      → 例 `.../watch/lv351148095?ref=...`、末尾 `#`、`&` 付き
 *   heavy read は数百ms〜秒かかるため、その間に供給元が入れ替わると
 *   `watchMetaCache.key !== snapshotKey` が成立し、**読めた全件を捨てて**
 *   `STALE_SNAPSHOT` で bail する(popup-entry.js の heavyDataPromise.then 冒頭)。
 *   → heavy は永遠に settle せず、light の暫定供給だけが画面を上書きし続ける。
 *
 * ■ なぜ「配信の同一性」に url の細部が要らないか
 *   鍵の目的は「この heavy 結果は今の配信のものか」の判定だけ。
 *   配信の同一性は **liveId が決める**(lv が変われば別配信)。
 *   クエリ(`?ref=`)・ハッシュ・末尾スラッシュは同じ配信の同じページを指すので、
 *   同一性の判定材料にしてはいけない。
 *
 * ■ それでも url を鍵に残す理由
 *   lv を取り出せない URL(watch 以外・空)のときは、生成元が違えば別物として
 *   扱いたい。その場合だけ正規化した文字列を使う(lv があれば lv が支配する)。
 *
 * 純関数(DOM/chrome.* 非依存・テスト可能)。
 */

/** 鍵のスキーマ版。判定ロジックを変えたら上げる(旧鍵と混ざらないようにする)。 */
export const WATCH_SNAPSHOT_KEY_SCHEMA = 's18';

/**
 * URL から「配信の同一性に関係する部分」だけを取り出して正規化する。
 *
 * - クエリ(`?…`)・ハッシュ(`#…`)を落とす: 同じ配信の同じページを指すため。
 * - 末尾スラッシュを落とす: `/watch/lv1` と `/watch/lv1/` は同じ。
 * - 小文字化 + 前後空白除去。
 * - URL として解釈できない文字列は、素朴な文字列処理で同じ規則を当てる
 *   (`new URL` は相対URLや空文字で投げるため)。
 *
 * @param {unknown} rawUrl
 * @returns {string} 正規化後の URL(取り出せなければ '')
 */
export function normalizeWatchUrlForKey(rawUrl) {
  const raw = String(rawUrl ?? '').trim();
  if (!raw) return '';
  let out = raw;
  try {
    const u = new URL(raw);
    // origin + pathname のみ。search/hash は同一性に無関係。
    out = `${u.origin}${u.pathname}`;
  } catch {
    // 相対URL・壊れた文字列: 手作業で ? と # を落とす。
    const q = out.indexOf('?');
    if (q >= 0) out = out.slice(0, q);
    const h = out.indexOf('#');
    if (h >= 0) out = out.slice(0, h);
  }
  // ?/# を落とした結果、末尾に空白が残ることがある(`'not a url #frag'` 等)。
  // 鍵に空白差を持ち込まないようここでも trim する。
  out = out.trim().replace(/\/+$/, ''); // 末尾スラッシュ(複数可)を除去
  return out.toLowerCase();
}

/**
 * heavy read の結果を「まだ採用してよいか」を判定する。
 *
 * ★2026-08-11(v0.1.1325) v1324 で鍵から url を外しても
 *   `heavyEverSettled:false / heavySettleState:"stale-snapshot"` が消えなかった。
 *   実機(v0.1.1324)で再測定して分かった【もう半分の真因】:
 *
 *   `watchMetaCache.key` は heavy 読み込みの最中に **意図的に '' へリセットされる**。
 *     - 3秒 polling(interval_poll): stale-while-revalidate で「fetch を促す」ため
 *       key だけ空にする(snapshot は残す)。popup-entry の `heavyReadActive` ガードは
 *       あるが、**snapshot fetch 中(fetchInflight)や別経路では通り抜ける**。
 *     - visibilitychange(タブ復帰): 同じく key を空にする(ガード無し)。
 *   その後 heavy が完了すると `watchMetaCache.key('') !== snapshotKey` が成立し、
 *   **読めた全件を捨てて** STALE_SNAPSHOT で bail していた。
 *   → 鍵の中身を直しても、鍵が「消される」経路が残っていたので症状は変わらなかった。
 *
 * ■ 空文字は「別配信になった」ではなく「再取得を促す合図」
 *   同じ判断は既に snapshot fetch 側(popup-entry の
 *   `cacheKeyStillTargetsThisRefresh`)が持っていた:
 *     `key === snapshotKey || (key === '' && snapshotKey.startsWith(lv + '|'))`
 *   heavy 側だけがこの救済を持っていなかった。ここで同じ規則を共有する。
 *
 * ■ 本物の配信切替は必ず捨てる
 *   key が空でなく、かつ snapshotKey と違う = 別配信へ移った = bail が正しい。
 *
 * @param {{ cacheKey?: unknown, snapshotKey?: unknown }} input
 * @returns {boolean} true=この heavy 結果を採用してよい / false=捨てる(STALE_SNAPSHOT)
 */
export function heavyResultStillTargetsThisWatch(input) {
  const cacheKey = String(input?.cacheKey ?? '');
  const snapKey = String(input?.snapshotKey ?? '');
  if (!snapKey) return false; // 鍵が作れていない=判定不能なので採用しない
  if (cacheKey === snapKey) return true;
  // ★空 = polling / visibilitychange が「再取得を促す」ために消しただけ。
  //   配信が変わったわけではないので、読めた全件は採用してよい。
  if (cacheKey === '') return true;
  return false; // 別配信へ移った
}

/**
 * heavy read 用の snapshotKey を作る。
 *
 * ★lv があるときは **lv だけ**で同一性を決める(url は鍵に入れない)。
 *   これが今回の根治。供給元が inlineParam⇄activeTab で入れ替わっても鍵が動かない。
 * ★lv が無いときだけ、正規化した url を使う(watch 以外のページの取り違え防止)。
 *
 * @param {{ liveId?: unknown, url?: unknown }} input
 * @returns {string}
 */
export function buildWatchSnapshotKey(input) {
  const lv = String(input?.liveId ?? '').trim().toLowerCase();
  if (lv) return `${lv}|${WATCH_SNAPSHOT_KEY_SCHEMA}`;
  const url = normalizeWatchUrlForKey(input?.url);
  return `|${url}|${WATCH_SNAPSHOT_KEY_SCHEMA}`;
}
