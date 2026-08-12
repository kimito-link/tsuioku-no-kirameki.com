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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★v0.1.1370(2026-08-12 実機で再発): 「守るものが無いから通す」は【4箇所目】だった
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 実機速報:
 *     ★減った1回(最大24→3枚=21枚減・直前の供給元light_summary)
 *     軽い供給の上書き ✅ 見送り0回(暫定供給を1回観測=判定済み)
 *   名簿19人に対し供給3件=本来 incomplete-light-supply で止まるはずが skipCount:0。
 *
 * ■ 真因: 名簿がまだこの配信を記録していない瞬間、rosterLiveId が空になり
 *   `!rosterLid` が【配信切替】と同じ扱いで通していた(旧55行)。
 *   起動直後(laneTickProbe.runs:4)はまさにその窓。
 *   ★roster-empty の穴を塞いだのに、同じ「守るものが無いから通す」判断が
 *     live-switch という【別の名前】で残っていた。
 *
 * ■ なぜ「空=切替」が危ないか(意味が違うものを同じ枝に入れた)
 *     別ID   = 守る対象が【別物】     → 通してよい(前の配信で新配信を縛らない)
 *     空     = 守る対象が【未確定】   → 通してはいけない(まだ何も分からないだけ)
 *   両者を `!rosterLid || cur !== rosterLid` で1本にまとめたのが穴。
 *   ★[[decisions-accumulate-into-regressions-2026-08-11]]: 単体では正しい判断
 *     (「配信IDが不明なら通す」)が積み重なって症状になった。
 *
 * ■ 直し: 空(未確立)は切替と分けて判定する。未確立でも【名簿に人数がある】なら
 *   守る対象は在る=名簿基準で判定する。名簿も0なら従来どおり通す(初回描画を止めない)。
 *
 * ★DOM は依然として一切見ない(12-27行の原則を維持)。
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
  const roster = Math.max(0, Math.floor(Number(args?.rosterEverSeen) || 0));

  // 現配信が不明=何を守るべきかが決まらない。従来どおり通す(初回描画を止めない)。
  if (!cur) return { skip: false, reason: 'live-unknown' };

  /*
   * ★v0.1.1370: 【別ID=切替】と【空=未確立】を分ける(旧実装は1本の枝だった)。
   *   別IDは守る対象が別物なので通す。空は「まだ分からない」だけで、
   *   名簿に人数があるなら守る対象は在る=下の名簿基準へ落として判定する。
   */
  if (rosterLid && cur !== rosterLid) return { skip: false, reason: 'live-switch' };

  // 名簿が空=まだ誰も観測していない=初回描画。守るものが無いので通す。
  // ★ここは rosterLid の有無に関わらず【人数】だけで決める(名前が無くても人数は守れる)。
  if (roster <= 0) {
    return { skip: false, reason: rosterLid ? 'roster-empty' : 'roster-unestablished' };
  }

  const next = Math.max(0, Math.floor(Number(args?.nextSupplyCount) || 0));
  // 供給が名簿に追いついているなら通す(同数・増加は正常な更新)。
  if (next >= roster) return { skip: false, reason: 'supply-complete' };

  // ここだけが見送り: 「64人見たはずなのに 3件しか無い暫定供給」=不完全。
  return { skip: true, reason: 'incomplete-light-supply' };
}

/**
 * ★v0.1.1370: 判定と記録を【1回の呼び出し】にまとめる。
 *
 * ■ なぜ関数にするか(呼び出し側の書き忘れを構造で防ぐ)
 *   旧実装は呼び出し側が observedCount++ と skipCount++ を手で書いており、
 *   通した理由(reason)を記録する場所がどこにも無かった=書き忘れではなく
 *   【書く場所が用意されていなかった】。計器を足しても呼び出し側が拾わなければ
 *   画面に出ない([[unwired-judgement-is-systemic-2026-08-12]] の片肺と同型)。
 *   → 判定結果と計器更新を必ず同時に行う入口を1つにする。
 *
 * @param {{ observedCount?: number, skipCount?: number, passReasons?: Record<string, number>,
 *   worst?: { next?: number, roster?: number }|null }} diag 計器(副作用で更新する)
 * @param {Parameters<typeof shouldSkipLightSupplyOverwrite>[0]} args 判定の入力
 * @returns {{ skip: boolean, reason: string }}
 */
export function judgeAndRecordLightSupply(diag, args) {
  const verdict = shouldSkipLightSupplyOverwrite(args);
  if (diag && typeof diag === 'object') {
    diag.observedCount = (Number(diag.observedCount) || 0) + 1;
    if (verdict.skip) {
      diag.skipCount = (Number(diag.skipCount) || 0) + 1;
      const roster = Math.max(0, Math.floor(Number(args?.rosterEverSeen) || 0));
      const next = Math.max(0, Math.floor(Number(args?.nextSupplyCount) || 0));
      const worst = diag.worst && typeof diag.worst === 'object' ? diag.worst : null;
      if (!worst || roster - next > (Number(worst.roster) || 0) - (Number(worst.next) || 0)) {
        diag.worst = { next, roster };
      }
    } else {
      // ★通した理由を必ず残す。ここが無いと「なぜ素通りしたか」が永久に分からない。
      if (!diag.passReasons || typeof diag.passReasons !== 'object') diag.passReasons = {};
      const key = String(verdict.reason || 'unknown');
      diag.passReasons[key] = (Number(diag.passReasons[key]) || 0) + 1;
    }
  }
  return verdict;
}

/**
 * 見送り計器のスナップショットから速報の1行を作る。
 * 件数0でも「観測できている(=計器は動いている)」ことが読めるよう、必ず判定文言を出す。
 * ★[[zero-count-may-mean-unmeasured-2026-08-04]]: 0 が「異常なし」か「未計測」かを
 *   区別できるよう、判定に使ったサンプル数(観測した暫定供給の回数)を必ず併記する。
 *
 * @param {{ skipCount?: number, observedCount?: number, paintedDuringAwaitCount?: number,
 *   passReasons?: Record<string, number>,
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
  /*
   * ★v0.1.1370: 【通した理由】を必ず出す。
   *
   * ■ なぜ要るか(2026-08-12: この計器が私を誤誘導した)
   *   旧実装は _verdict.reason を skip したときしか使わず、通したときは捨てていた。
   *   実機で「名簿19人に対し供給3件」が素通りしたのに、速報は
   *     軽い供給の上書き ✅ 見送り0回(暫定供給を1回観測=判定済み)
   *   としか言わず、【どの枝で通ったか】が永久に分からなかった。
   *   ★消去法で live-switch と推定するしかなく、観測ではなく推測になった
   *     ([[screen-only-info-never-reaches-the-report-2026-08-11]] と同型)。
   *   ★「✅見送り0回」は【正常】にも【穴で素通り】にも出る=区別できない表示は嘘に近い。
   *
   * ■ 判定: 縮小が起きているのに見送り0回なら、それは正常ではない。
   *   passReasons を並べれば「どの fail-open を通ったか」がそのまま次の一手になる。
   */
  const passReasons = d.passReasons && typeof d.passReasons === 'object' ? d.passReasons : null;
  const passNote = passReasons
    ? (() => {
        /** @type {Array<{ key: string, n: number }>} */
        const pairs = Object.keys(passReasons)
          .map((k) => ({ key: k, n: Math.max(0, Math.floor(Number(passReasons[k]) || 0)) }))
          .filter((p) => p.n > 0)
          .sort((a, b) => b.n - a.n);
        if (!pairs.length) return '';
        return `\n  → 通した理由の内訳: ${pairs.map((p) => `${p.key}${p.n}`).join(' / ')}`;
      })()
    : '';
  if (observed <= 0) {
    return `軽い供給の上書き ⚪ 未計測(暫定供給の観測0回=判定していません)${awaitNote}`;
  }
  if (skip <= 0) {
    return `軽い供給の上書き ✅ 見送り0回(暫定供給を${observed}回観測=判定済み)${awaitNote}${passNote}`;
  }
  const worst = d.worst && typeof d.worst === 'object' ? d.worst : null;
  const detail = worst
    ? ` / 最大の食い違い: 名簿${Math.floor(Number(worst.roster) || 0)}人に対し供給${Math.floor(Number(worst.next) || 0)}件`
    : '';
  return `軽い供給の上書き 🛡 ${skip}回見送り(暫定供給を${observed}回観測)${detail}${awaitNote}${passNote}\n  → 不完全な軽い供給がタイルを消すのを止めました(これが出るのは正常な防御)`;
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
