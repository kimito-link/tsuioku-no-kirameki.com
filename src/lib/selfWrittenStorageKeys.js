// selfWrittenStorageKeys.js — refresh() 自身が書くキー(=再描画を誘発してはいけないキー)の判定。
//
// ───────────────────────────────────────────────────────────────────────────
// なぜ要るか(2026-08-04 実測・真因確定):
//   実配信で【1コメントあたり77回の描き直し】(3分で描画+2013回=毎秒11回)が観測され、
//   ユーザーには「ちかちか点滅」として見えていた。
//
//   真因は refresh() の自己フィードバックループ。2つの穴が噛み合っていた:
//
//     穴1: popupStorageRefreshCoalesce.js の schedule() は
//          allHighFreq=false のとき 450ms throttle を【完全にバイパス】して即時実行する
//          (コメントは「設定トグルを想定」と書かれていた)。
//
//     穴2: isHighFrequencyCommentRelatedStorageKey(popup-entry.js) に
//          refresh() 自身が書く8キーが【1つも含まれていない】。
//
//   結果:
//     refresh() → 診断/鏡キーを storage.set → onChanged 発火
//       → allHighFreq=false → throttle素通り → 即時 refresh()
//       → また storage.set → …(ループが閉じる)
//
//   各書き込みの間引き(perfDiag 2秒 / 鏡 400ms / paintPerf 2秒 / laneDiag 3秒)は
//   別々のタイマーで位相がずれるため、合計すると数十〜百ms間隔で発火しうる。
//   毎秒11回(約90ms間隔)と整合する。
//
// ★過去10回のちらつき修正(v0.1.618/622/1037/1038/1039/1125/1128/1135/1170/1179)は
//   すべて「描画される側」への対処(diff-skip・in-flightガード・アトミック差し替え)だった。
//   つまり「呼ばれるのは許容し、呼ばれた後に無駄を省く」方針。10回繰り返しても再発した。
//   本モジュールは【呼ぶ側を断つ】ためのもの。
//
// 設計方針:
//   ・除外するのは refresh() 自身(および描画パス)が書くキーだけに限定する。
//     外部由来の変更(コメント記録・設定トグル等)は従来どおり通す=挙動を壊さない。
//   ・「これらのキーだけが変わったなら再描画しない」という判定に使う。
//     他のキーが1つでも混ざっていれば従来どおり処理する(取りこぼしを作らない)。
// ───────────────────────────────────────────────────────────────────────────

/**
 * refresh() / 描画パス自身が書き出すキーのパターン。
 *
 * 2026-08-04 に popup-entry.js を追って実際に確認したもの:
 *   nls_perf_diag_<lv>            popup-entry.js:1991 (recordPerfDiagThrottled・2秒間引き)
 *   nls_paint_perf_ring_v1        popup-entry.js:3950 (2秒間引き)
 *   nls_lane_diag_v1              popup-entry.js:7410 (3秒間引き)
 *   nls_preview_render_ack_v1     popup-entry.js:7071/7121
 *   nls_lane_mirror_v1            鏡バンドル(400ms trailing)
 *   nls_stat_cards_mirror_v1      同上
 *   nls_north_star_mirror_v1      同上
 *   nls_comment_timeline_mirror_v1 同上(publishCommentTimelineMirror・refresh内16505から)
 *
 * これらは「描画した結果を記録するため」に書かれるものであり、
 * これらが変わったからといって【描き直す理由にはならない】。
 */
const SELF_WRITTEN_PATTERNS = Object.freeze([
  /^nls_perf_diag_/i,
  /^nls_paint_perf_ring_v\d+$/i,
  /^nls_lane_diag_v\d+$/i,
  /^nls_preview_render_ack_v\d+$/i,
  /^nls_lane_mirror_v\d+$/i,
  /^nls_stat_cards_mirror_v\d+$/i,
  /^nls_north_star_mirror_v\d+$/i,
  /^nls_comment_timeline_mirror_v\d+$/i,
  /*
   * ★v0.1.1344: 鏡バンドルの【残り5種】を追加(2026-08-04 の根治後に鏡が増え、
   *   このリストの更新が漏れていた)。
   *
   * ■ 実測(2026-08-12 状態速報)
   *     描き直しの内訳(計2285回): storage_changed1891 / self_write_skipped352
   *     1コメントあたり30回(正常は3回以下)・表示遅延5秒
   *   ＝2026-08-04 に一度根治したはずの自己フィードバックループが再発していた。
   *
   * ■ 真因(コードだけで確定・実データ不要だった)
   *   mirrorBundleFlushScheduler.js:36-44 は【9種】の鏡を同じバンドルで書くが、
   *   ここには4種しか無かった。isAllSelfWrittenRenderArtifacts は every() なので
   *   **未登録の鏡が1つ混ざるだけでスキップ判定が丸ごと false** になり、
   *   さらに popupStorageRefreshCoalesce の allHighFreq も false になって
   *   450ms スロットルまで素通りする(穴1と穴2が再び噛み合った)。
   *
   * ★検査 selfWrittenCoversMirrorBundle.test.js が「バンドルの全キーがここに載ること」を
   *   機械照合する。鏡を足したらこのリストも足す、を人間の記憶に頼らない。
   */
  /^nls_top_supporters_mirror_v\d+$/i,
  /^nls_gift_history_mirror_v\d+$/i,
  /^nls_room_heat_mirror_v\d+$/i,
  /^nls_session_summary_mirror_v\d+$/i,
  /^nls_story_diag_mirror_v\d+$/i
]);

/**
 * そのキーが「refresh 自身が書いたもの(=再描画を誘発してはいけない)」かを判定する。
 *
 * @param {unknown} key
 * @returns {boolean}
 */
export function isSelfWrittenRenderArtifactKey(key) {
  const k = String(key == null ? '' : key);
  if (!k) return false;
  return SELF_WRITTEN_PATTERNS.some((re) => re.test(k));
}

/**
 * 変更キー一覧が「自己書き込みだけ」かを判定する。
 * true なら再描画をスキップしてよい(=ループを断つ)。
 *
 * 空配列は false を返す。呼び出し側は既に空チェックしているが、
 * ここで true を返すと「何も変わっていないのにスキップ扱い」になり
 * 意味が曖昧になるため。
 *
 * @param {readonly unknown[]|null|undefined} keys
 * @returns {boolean}
 */
export function isAllSelfWrittenRenderArtifacts(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return false;
  return keys.every((k) => isSelfWrittenRenderArtifactKey(k));
}

/**
 * 変更キー一覧から、自己書き込みキーを取り除いた配列を返す。
 *
 * allHighFreq の判定に使う。現状は keys.every() で判定しているため、
 * 高頻度キー(nls_comments_* 等)と自己書き込みキーが【同一 changes に混ざる】と
 * 全体が非高頻度扱いになり throttle を失う(実測で確認した穴)。
 * 自己書き込みキーを先に除いてから判定すれば、この取り違えが起きない。
 *
 * @param {readonly unknown[]|null|undefined} keys
 * @returns {string[]}
 */
export function stripSelfWrittenRenderArtifacts(keys) {
  if (!Array.isArray(keys)) return [];
  return keys
    .map((k) => String(k == null ? '' : k))
    .filter((k) => k && !isSelfWrittenRenderArtifactKey(k));
}
