/**
 * 軽い供給(summary+tail)が完全描画を上書きするのを止める判定(純関数)。
 *
 * ★v0.1.1251 真因(2026-08-04 実配信・速報が名指し):
 *   「タイルが減った直前の供給元: light_summary(暫定) 72枚→3枚」。
 *   POP が一瞬「閉じた/空になった」ように見える正体はこれ(パネル自体は消えていない=
 *   hostFlipCensus は 0回。中身が 72→3 に落ちて戻っていた)。
 *
 * ■ なぜ既存の防御を2つとも素通りしたか(同じ「DOM 0枚」が両方を無力化する)
 *   1) applyLightLaneSummary の冪等ガード:
 *        if (countStoryUserLaneDomTiles(els) > 0 && 同一配信) return;
 *      → 「既に描けているなら軽い源で上書きしない」。DOM が 0枚の瞬間だけ通ってしまう。
 *   2) shouldKeepStoryUserLaneTilesOnShrink の縮小ガード:
 *        if (prev <= 0) return false; // 前回タイル無し=守るものが無い
 *      → 同じ 0枚を見て「守る対象なし」と判断し、縮小を許可する。
 *
 *   そして DOM が 0枚になる瞬間は実在する: renderStoryUserLaneDom のガイド状態(空の案内)へ
 *   落ちる経路が 5段すべてを innerHTML='' でクリアする。この窓に軽い供給が刺さると
 *   「72枚あったのに 3枚」になる。
 *
 * ■ 直し方(この関数の役目)
 *   守りの基準を【DOM の現在枚数】から【名簿(この配信で一度でも見た人数)】へ移す。
 *   名簿 laneRosterDelta.everSeenMax は既に単調増加で持っており、DOM が一瞬空になっても
 *   消えない。「64人見たことがあるのに 3件しか無い供給」は定義上まだ不完全なので描かせない。
 *
 *   ★DOM を見ないのが要点。DOM は消える側の値なので、消える瞬間の判断材料にできない
 *     ([[lane-has-no-roster-accumulator-2026-08-02]] と同じ構図)。
 *
 * ■ fail-safe 側の担保(永久 stale にしない)
 *   - 確定供給(provisional=false)は常に通す=heavy が settle したら必ず反映される。
 *   - 配信が変わったら通す=前の配信の名簿で新配信を縛らない。
 *   - 名簿が空(まだ誰も見ていない)なら通す=初回描画を止めない。
 *   - 供給が名簿と同数以上なら通す=正常な更新は一切止めない。
 */

/**
 * 軽い(暫定)供給による上書きを見送るべきか。
 *
 * @param {object} args
 * @param {boolean} args.provisional 供給が暫定(heavy 未settle)か。false=確定。
 * @param {number} args.nextSupplyCount 今回の供給が持っているユーザー数(タイル相当)。
 * @param {number} args.rosterEverSeen この配信で一度でも観測したユーザー数(単調増加・DOM非依存)。
 * @param {string} args.currentLiveId 今回の配信 ID。
 * @param {string} args.rosterLiveId 名簿が対象にしている配信 ID。
 * @returns {{ skip: boolean, reason: string }} skip=true なら描かない。reason は計器/速報用。
 */
export function shouldSkipLightSupplyOverwrite(args) {
  const provisional = args?.provisional === true;
  // 確定供給は常に通す。heavy が settle した正当な結果を止めると永久 stale になる。
  if (!provisional) return { skip: false, reason: 'settled' };

  const cur = String(args?.currentLiveId || '').trim().toLowerCase();
  const rosterLid = String(args?.rosterLiveId || '').trim().toLowerCase();
  // 配信切替(または配信不明)は通す。前の配信の名簿で新しい配信を縛らない。
  if (!cur || !rosterLid || cur !== rosterLid) return { skip: false, reason: 'live-switch' };

  const roster = Math.max(0, Math.floor(Number(args?.rosterEverSeen) || 0));
  // 名簿が空=まだ誰も観測していない=初回描画。守るものが無いので通す。
  if (roster <= 0) return { skip: false, reason: 'roster-empty' };

  const next = Math.max(0, Math.floor(Number(args?.nextSupplyCount) || 0));
  // 供給が名簿に追いついているなら通す(同数・増加は正常な更新)。
  if (next >= roster) return { skip: false, reason: 'supply-complete' };

  // ここだけが見送り: 「64人見たはずなのに 3件しか無い暫定供給」=不完全。
  return { skip: true, reason: 'incomplete-light-supply' };
}

/**
 * 見送り計器のスナップショットから速報の1行を作る。
 * 件数0でも「観測できている(=計器は動いている)」ことが読めるよう、必ず判定文言を出す。
 * ★[[zero-count-may-mean-unmeasured-2026-08-04]]: 0 が「異常なし」か「未計測」かを
 *   区別できるよう、判定に使ったサンプル数(観測した暫定供給の回数)を必ず併記する。
 *
 * @param {{ skipCount?: number, observedCount?: number, paintedDuringAwaitCount?: number,
 *   worst?: { next?: number, roster?: number }|null }|null|undefined} diag
 * @returns {string}
 */
export function formatLightSupplyGuardLine(diag) {
  const d = diag && typeof diag === 'object' ? diag : null;
  if (!d) return '';
  const skip = Math.max(0, Math.floor(Number(d.skipCount) || 0));
  const observed = Math.max(0, Math.floor(Number(d.observedCount) || 0));
  /*
   * ★v0.1.1359: await 中に heavy が描き切ったため軽い供給が降りた回数。
   *   これはタイル消失(39→3)の根治が実際に効いた回数=出るのは正常な防御。
   *   ★observed(名簿との食い違い判定)とは別経路なので、observed=0 でも出す。
   */
  const paintedDuringAwait = Math.max(0, Math.floor(Number(d.paintedDuringAwaitCount) || 0));
  const awaitNote = paintedDuringAwait > 0
    ? ` / 🛡描画済みのため降りた${paintedDuringAwait}回(await中にheavyが完成=完全描画を守った)`
    : '';
  if (observed <= 0) {
    return `軽い供給の上書き ⚪ 未計測(暫定供給の観測0回=判定していません)${awaitNote}`;
  }
  if (skip <= 0) {
    return `軽い供給の上書き ✅ 見送り0回(暫定供給を${observed}回観測=判定済み)${awaitNote}`;
  }
  const worst = d.worst && typeof d.worst === 'object' ? d.worst : null;
  const detail = worst
    ? ` / 最大の食い違い: 名簿${Math.floor(Number(worst.roster) || 0)}人に対し供給${Math.floor(Number(worst.next) || 0)}件`
    : '';
  return `軽い供給の上書き 🛡 ${skip}回見送り(暫定供給を${observed}回観測)${detail}${awaitNote}\n  → 不完全な軽い供給がタイルを消すのを止めました(これが出るのは正常な防御)`;
}

/**
 * ★v0.1.1359: 「storage read の await をまたいだ後に、まだ書いてよいか」を判定する。
 *
 * ■ なぜ要るか(2026-08-12 実機・複数配信で再現したタイル消失 39→3)
 *   軽い供給(light_summary)は冒頭で「既に描けているなら何もしない」と判定するが、
 *   その判定は storage read の await より【前】にある。await 中に heavy_refresh が
 *   39枚を描き切ると、復帰した軽い経路は「まだ0枚だった頃の判定」のまま
 *   短い候補(3枚)を書き込み、完全描画を潰す。
 *   ★入口で1回見ただけの判定は、await をまたいだ時点で古い。
 *   ★実機の provisional 食い違い(shrinkCulprit:1 vs paintSkipReasons:provisional-false)は
 *     heavy が共有フラグを上書きした後に読んだ値=この時間差の指紋だった。
 *
 * 掟: 数えるだけ・DOM/データを触らない(枚数と liveId は呼び出し側が読んで渡す)。
 *
 * @param {{ skipCount?: number, paintedDuringAwaitCount?: number }|null|undefined} diag 計器(副作用でカウントを進める)
 * @param {{ domTiles?: unknown, stateLiveId?: unknown, liveId?: unknown }} args
 * @returns {boolean} true=もう描かれているので軽い供給は降りる / false=書いてよい
 */
export function shouldSkipLightSupplyAfterAwait(diag, args) {
  const tiles = Math.max(0, Math.floor(Number(args?.domTiles) || 0));
  if (tiles <= 0) return false; // まだ誰も描いていない=軽い供給で描いてよい
  const cur = String(args?.stateLiveId ?? '').trim().toLowerCase();
  const live = String(args?.liveId ?? '').trim().toLowerCase();
  // ★同一配信のときだけ降りる。配信切替なら前の配信の描画を守る理由が無い。
  if (!live || cur !== live) return false;
  if (diag && typeof diag === 'object') {
    diag.skipCount = (Number(diag.skipCount) || 0) + 1;
    diag.paintedDuringAwaitCount = (Number(diag.paintedDuringAwaitCount) || 0) + 1;
  }
  return true;
}
