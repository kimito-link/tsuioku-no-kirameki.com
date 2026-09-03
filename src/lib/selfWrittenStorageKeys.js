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
  /^nls_story_diag_mirror_v\d+$/i,
  /*
   * ★v0.1.1345: per-live 版の鏡(配信IDが末尾に付く)を追加。
   *
   * ■ v0.1.1344 の修正は【不完全だった】。実機の計器が名指しした:
   *     storage_changed:nls_lane_mirror_v2_*+nls_lane_receipt_v1_* が 3,456回(69%)
   *   上の `/^nls_lane_mirror_v\d+$/` は **`$` で終わる**ため、実際に書かれている
   *   `nls_lane_mirror_v2_lv351156267` に**一致しない**(旧 v1 の配信ID無しキー専用だった)。
   *   `nls_lane_receipt_v1_<lv>` に至っては登録すら無かった。
   *   → 1コメントあたり31回の描き直しが残っていた(v1344 出荷後の実測)。
   *
   * ★教訓: パターンを足すときは【実際に書かれているキー文字列】で照合すること。
   *   定数名(KEY_LANE_MIRROR)だけ見て正規表現を書くと、per-live 版の存在を見落とす。
   *   正本: laneMirrorKey.js の laneMirrorKeyFor / laneReceiptKeyFor。
   */
  /^nls_lane_mirror_v\d+_lv\d{1,15}$/i,
  /^nls_lane_receipt_v\d+_lv\d{1,15}$/i,

  /*
   * ★v0.1.1503: 鏡バンドル以外の自己書き込み3種を追加。
   *
   * ■ 実測(2026-08-23状態速報・v0.1.1484の内訳計器で確定)
   *     描き直し1,106回のうちコメント由来は3.0%だけ。残り97%は storage 更新。
   *     最多3つ: nls_panel_summary_*(219) / nls_watch_snapshot_*(196) /
   *              ai_share+status_lite(173)
   *   このうち後者2種(196+173=369回・33.3%)は isHighFrequencyCommentRelatedStorageKey が
   *   false のため、popupStorageRefreshCoalesce.js の allHighFreq 判定に混ざると
   *   450msスロットルを丸ごと素通りする(このファイル冒頭の stripSelfWrittenRenderArtifacts
   *   と同型の穴が、鏡以外のキーには塞がれていなかった)。
   *
   * ■ nls_watch_snapshot_<lv> … popup 自身が書く(popup-entry.js の cached-first render
   *   write-through)。popup 自身の onChanged が即座に受けて再描画する自己フィードバック。
   *   正本: storageKeys.js#watchSnapshotStorageKey。実キーで確認済み(定数名だけで
   *   正規表現を書かない・v0.1.1345の教訓)。
   *
   * ■ ai_share_fast_diag / status_fast_diag_lite … 純粋な診断キー。中身が同じでも
   *   書き込み時刻の記録が毎回更新されるため必ず onChanged が発火する。status.html は
   *   自前の2秒ループで読んでおり popup の onChanged には依存しないため、
   *   popup 側の再描画トリガーから外しても失うものが無い。
   *
   * ★panel_summary(219回・最多)は【あえて含めない】。watchUrlFreshness.js が
   *   その updatedAt を「配信がまだ生きているか」の生存確認に使っており、
   *   自己書き込み扱いで無変化スキップすると誤診の恐れがあるため触らない。
   */
  /^nls_watch_snapshot_lv\d{1,15}$/i,
  /^nls_ai_share_fast_diag_v\d+$/i,
  /^nls_status_fast_diag_lite_v\d+$/i
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
