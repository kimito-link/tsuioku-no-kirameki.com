/**
 * buriedInstrumentCells.js — 速報の文章に埋もれていた判定を【セル】として掘り起こす(純関数)。
 *
 * ★なぜ要るか(2026-08-15 ユーザー指示「計器を100個ぐらいにして、それでジャンル分け」)
 *
 * ■ 実測(会議へ渡した地図)
 *     registry 登録セル : 40個
 *     lib 内の判定      : 192箇所
 *   ＝**150以上が既に存在するのに、速報の本文に埋もれて枠から引けない**。
 *   100個への道は「新しく作る」ではなく **在庫の棚卸し**。
 *
 * ■ このモジュールの掟
 *   1. ★v0.1.1401 訂正: **「使っていない」と「動くはずなのに0」を区別する**。
 *      記録中の配信があるなら、レーンや描画は【動くはず】。それが0件なら
 *      それ自体が症状なので **⚪未観測として枠に出す**(消さない)。
 *      v1400 は10箇所で「0なら出さない」にしてしまい、14セル中12個が
 *      画面から消えた＝ユーザーに「なにもかわってない」と言わせた。
 *      ★**一番知りたい異常時ほどセルが消える**という最悪の挙動だった。
 *   2. **仕様上そうなるものを異常と呼ばない**(匿名にサムネは無い、等)
 *   3. **症状の言葉**で名前を付ける(「heavy race」ではなく「レーンが揃わない」)
 *   4. 純関数・DOM を触らない・時刻は呼び出し側が渡す
 *
 * ★ここで足したセルは diagnosisRegistry と healthCellGroups の【両方】に
 *   登録すること。片方だけだと instrumentCoverage.test.js が赤になる
 *   (それがこのゲートの役割)。
 *
 * @module buriedInstrumentCells
 */

/** @param {unknown} v @returns {number|null} */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 状態セルを作る(healthCells.js の stateCell と同形)。
 * @param {string} id
 * @param {string} label
 * @param {'ok'|'warn'|'bad'|'na'} level
 * @param {string} text
 * @returns {import('./healthCells.js').HealthCell}
 */
function cell(id, label, level, text) {
  return { id, label, kind: /** @type {'state'} */ ('state'), value: null, level, text };
}

/**
 * 埋もれていた判定をセル化する。**観測が無いものは返さない**。
 *
 * @param {any} data buildHealthCells と同じ入力(形は healthCells 側が正本)
 * @returns {Array<import('./healthCells.js').HealthCell>}
 */
export function buildBuriedCells(data) {
  /** @type {Array<import('./healthCells.js').HealthCell>} */
  const out = [];
  const p = data?.popupDiag?.popup ?? data?.popupDiag ?? null;
  const fast = data?.fastDiag?.content ?? null;
  /*
   * ★記録中の配信があるか。あるなら「レーンが動くはず」なので、
   *   観測0でも **⚪未観測** として枠に出す(消さない=空欄が症状を語る)。
   */
  const recording = Array.isArray(data?.livesData)
    && data.livesData.some((/** @type {any} */ l) => l && l.recording);
  /**
   * 観測が無いときのセル(記録中なら出す)。
   * @param {string} id @param {string} label
   */
  const naCell = (id, label) => (recording ? cell(id, label, 'na', '—') : null);
  /** @param {any} c */
  const push = (c) => { if (c) out.push(c); };

  /* ── 応援レーン: なぜ描かれなかったか ───────────────────── */
  const tick = p?.laneTickProbe;
  if (!tick || !(num(tick.ticks) || 0)) push(naCell('lane-tick', 'レーン描画の起動'));
  else {
    const ticks = num(tick.ticks) || 0;
    const runs = num(tick.runs) || 0;
    const skipped = Math.max(0, ticks - runs);
    const reason = String(tick.lastReason || '');
    // ★見送り自体は正常な防御。全部見送られている時だけ異常。
    const allSkipped = runs === 0 && ticks >= 3;
    out.push(cell(
      'lane-tick', 'レーン描画の起動',
      allSkipped ? 'warn' : 'ok',
      allSkipped
        ? `${ticks}回とも見送り(${reason || '理由不明'})`
        : `${runs}/${ticks}回 実行${skipped > 0 ? `(見送り${skipped})` : ''}`
    ));
  }

  /* ── レーンの取りこぼし(消えた人) ───────────────────────── */
  const roster = p?.laneRosterDelta;
  if (!roster || !(num(roster.everSeenMax) || 0)) push(naCell('lane-dropped', 'レーンから消えた人'));
  else {
    const dropped = num(roster.droppedTotal) || 0;
    out.push(cell(
      'lane-dropped', 'レーンから消えた人',
      dropped > 0 ? 'warn' : 'ok',
      dropped > 0 ? `${dropped}人が消えました` : `消えた人なし(累計${num(roster.everSeenMax)}人)`
    ));
  }

  /* ── 不完全な供給がタイルを消すのを止めた回数(防御) ───────── */
  const guard = p?.lightSupplyGuard;
  if (!guard || !(num(guard.observedCount) || 0)) push(naCell('lane-supply-guard', 'レーン保護'));
  else {
    const skip = num(guard.skipCount) || 0;
    out.push(cell(
      'lane-supply-guard', 'レーン保護',
      'ok', // ★これは防御が効いた記録=多くても異常ではない
      skip > 0 ? `${skip}回 守りました` : '守りの出番なし'
    ));
  }

  /* ── 起動時の暗さ(黒画面の直接の材料) ─────────────────── */
  const shade = p?.loadShadeProbe;
  if (!shade || num(shade.shadeAgeMs) == null) push(naCell('boot-shade', '起動時のシェード'));
  else {
    const ageMs = num(shade.shadeAgeMs) || 0;
    const present = shade.shadePresent === true;
    // ★出たまま長い=中身が見えない時間。1秒超で人が気づく。
    const bad = present && ageMs >= 2000;
    const warn = present && ageMs >= 1000;
    out.push(cell(
      'boot-shade', '起動時のシェード',
      bad ? 'bad' : warn ? 'warn' : 'ok',
      present ? `${Math.round(ageMs / 100) / 10}秒 覆っています` : '解除済み'
    ));
  }

  /* ── PICK UP に何が選ばれたか ─────────────────────────── */
  const ticker = p?.tickerPick;
  if (!ticker || !(num(ticker.domWriteTotal) || 0)) push(naCell('pickup-write', 'PICK UPの更新'));
  else {
    const wrote = num(ticker.domWriteTotal) || 0;
    const short = num(ticker.filteredTooShort) || 0;
    out.push(cell(
      'pickup-write', 'PICK UPの更新',
      'ok',
      `${wrote}件表示${short > 0 ? `(短文${short}件は除外)` : ''}`
    ));
  }

  /* ── アイコングリッドの作り直し(重さの材料) ───────────────── */
  const churn = p?.storyGrowthChurn;
  if (!churn || !(num(churn.rebuilds) || 0)) push(naCell('grid-rebuild', 'アイコングリッド'));
  else {
    const maxMs = num(churn.maxMs) || 0;
    out.push(cell(
      'grid-rebuild', 'アイコングリッド',
      maxMs >= 100 ? 'warn' : 'ok',
      `作り直し${num(churn.rebuilds)}回 最大${Math.round(maxMs)}ms`
    ));
  }

  /* ── サムネをキャッシュから引けたか ─────────────────────── */
  const remembered = p?.avatarRememberedDiag;
  if (!remembered) push(naCell('avatar-cache', 'サムネの記憶'));
  else {
    const cacheHit = num(remembered.hitProfileCache) || 0;
    const synth = num(remembered.hitSynth) || 0;
    const total = cacheHit + synth;
    if (total <= 0) push(naCell('avatar-cache', 'サムネの記憶'));
    else {
      const pct = Math.round((cacheHit / total) * 100);
      out.push(cell(
        'avatar-cache', 'サムネの記憶',
        'ok', // ★合成(ゆっくり顔)が多いのは匿名主体の配信では正常
        `本物${pct}% (記憶${cacheHit}/合成${synth})`
      ));
    }
  }

  /* ── 重複除去の種が壊れていないか ───────────────────────── */
  const seed = fast?.giftDiagnostics?.commentObservability?.dedupeSeedDiag;
  if (!seed || !(num(seed.addedTotalCount) || 0)) push(naCell('dedupe-seed', '重複の見分け'));
  else {
    const suspicious = num(seed.suspiciousAddedCount) || 0;
    out.push(cell(
      'dedupe-seed', '重複の見分け',
      suspicious > 0 ? 'warn' : 'ok',
      suspicious > 0 ? `疑わしい追加${suspicious}件` : '正常'
    ));
  }

  /* ── 記録エンジンの引っ越し(多タブ) ─────────────────────── */
  const host = fast?.hostMoveDiag;
  if (host && num(host.moveCount) != null) {
    const moves = num(host.moveCount) || 0;
    if (moves > 0) {
      out.push(cell(
        'host-move', '記録役の引っ越し',
        moves >= 3 ? 'warn' : 'ok',
        `${moves}回 移動`
      ));
    }
  }

  /* ── ★パネルが2つできた(重複生成) ───────────────────────
   * ★v0.1.1453: `duplicateSeen` は v0.1.1125 から数えられ、fastDiag の JSON にも
   *   出ていたが、**読み手が `moveCount` しか見ていなかった**ため枠に出なかった。
   *   しかも旧実装は `moves > 0` のときだけセルを出す＝**引っ越しが0なら
   *   重複が何回起きても画面に何も出ない**。
   *   即時プッシュの「受信/送信」比を読むとき、重複パネルの実在が決め手になる。
   * ★重複は **0 が正常**なので、観測ゼロなら出さない(枠を無駄にしない)。
   *   出るのは「1回以上見た」ときだけ＝出たら必ず意味がある。
   */
  const dupSeen = host ? num(host.duplicateSeen) : null;
  if (dupSeen != null && dupSeen > 0) {
    out.push(cell(
      'host-duplicate', 'パネルが2つできた',
      'warn',
      `${dupSeen}回 重複`
    ));
  }

  /* ── ★メモリ/DOM の逼迫(凍結の予兆) ───────────────────────
   * ★v0.1.1454(ユーザー指示「メモリの消費とかも計器にいれて」)。
   *   実機で watch ページに「ページが応答しません」が出たとき、
   *   **メモリもDOM総数も測っていなかった**ので数字で答えられなかった。
   * ★判定は memoryPressureProbe.js(純関数)が正本。ここは表示だけ。
   * ★測れない環境(Chrome以外)は na＝「使っていない0」と混同しない。
   */
  const mem = fast?.memoryPressure;
  if (mem && typeof mem === 'object') {
    const pct = num(mem.pct);
    push(mem.level === 'na' || pct == null
      ? naCell('memory-pressure', 'メモリの余裕')
      : cell(
        'memory-pressure', 'メモリの余裕',
        mem.level === 'bad' ? 'bad' : mem.level === 'warn' ? 'warn' : 'ok',
        `${mem.usedMB}MB (上限の${pct}%)`
      ));
    const dom = num(mem.domNodes);
    push(dom == null
      ? naCell('dom-nodes', '画面の部品数')
      : cell(
        'dom-nodes', '画面の部品数',
        mem.domLevel === 'bad' ? 'bad' : mem.domLevel === 'warn' ? 'warn' : 'ok',
        `${dom}個${mem.domLevel === 'ok' ? '' : '(推奨1,500)'}`
      ));
  }

  /* ── 北極星の描画がどこまで進んだか ─────────────────────── */
  const ns = p?.northStarRenderProbe;
  if (!ns || !(num(ns.refreshAllStarted) || 0)) push(naCell('northstar-render', '公式値の描画'));
  else {
    const started = num(ns.refreshAllStarted) || 0;
    const done = num(ns.refreshAllCompleted) || 0;
    out.push(cell(
      'northstar-render', '公式値の描画',
      done < started ? 'warn' : 'ok',
      done < started ? `${done}/${started}回 未完了` : `${done}回 完了`
    ));
  }

  /* ── 鏡publishの競合 ────────────────────────────────── */
  const race = p?.northStarMirrorPublishRace;
  if (!race || !(num(race.publishCalls) || 0)) push(naCell('mirror-publish', '鏡の書き出し'));
  else {
    const skipped = num(race.flushSkipped) || 0;
    out.push(cell(
      'mirror-publish', '鏡の書き出し',
      skipped > 0 ? 'warn' : 'ok',
      skipped > 0 ? `${skipped}回 スキップ` : `${num(race.publishCalls)}回 成功`
    ));
  }

  /* ── クリックできる見た目になっているか ───────────────────── */
  const affordance = p?.storyUserLaneClickAffordanceParity;
  if (!affordance || !(num(affordance.checked) || 0)) push(naCell('click-affordance', 'クリックの見た目'));
  else {
    const bad = num(affordance.mismatched) || 0;
    out.push(cell(
      'click-affordance', 'クリックの見た目',
      bad > 0 ? 'warn' : 'ok',
      bad > 0 ? `${bad}件ズレ` : `一致(検${num(affordance.checked)})`
    ));
  }

  /* ── レーンが揃わない(heavy race) ───────────────────────── */
  /* ── ★DOM系の3計器を【セルに出す】 ─────────────────────
   * ★ユーザー指摘(2026-08-21)「みためかわってないような」
   *   →「セルにも反映させて視覚的にもりかいしたい」
   * ★私は v0.1.1456〜1462 で3つ作ったが、どれも**コピー文にしか出しておらず**、
   *   コードの地図が言う【4 表示 の断線】そのものだった＝画面では何も変わらない。
   */
  const laneProbe = p?.storyUserLaneRenderProbe;

  // ★拡張の処理時間(カバー率つき)。★測れていないうちは犯人を断言しない。
  const auto = laneProbe?.autoSection;
  const autoPct = auto ? num(auto.coveragePct) : null;
  if (!auto || autoPct == null) push(naCell('auto-section', '拡張の処理時間'));
  else {
    const worst = String(auto.worstName || '');
    out.push(cell(
      'auto-section', '拡張の処理時間',
      auto.level === 'warn' ? 'warn' : 'ok',
      /*
       * ★カバー率が低いときは「まだ名指しできない」と正直に出す。
       *   囲んだ中の最大値を犯人と書くと、また誤診する。
       */
      auto.level === 'warn'
        ? `${autoPct}%しか測れていません(残り${num(auto.uncoveredMs) ?? 0}msは未計測)`
        : `${autoPct}%を計測${worst ? ` / 最も使うのは ${worst}` : ''}`
    ));
  }

  // ★DOMの木(総数・深さ・一番太い親)。★どこを削るかが名前で分かる。
  const tree = laneProbe?.domTreeCensus;
  const treeTotal = tree ? num(tree.total) : null;
  if (!tree || treeTotal == null) push(naCell('dom-tree', 'パネルの部品数'));
  else {
    const w = tree.widest && typeof tree.widest === 'object' ? tree.widest : null;
    const wid = w ? String(w.id || '(id無し)') : '';
    out.push(cell(
      'dom-tree', 'パネルの部品数',
      tree.level === 'warn' ? 'warn' : 'ok',
      `${treeTotal}個(深さ${num(tree.maxDepth) ?? 0})` +
        (w ? ` / 一番太い親: ${wid} 子${num(w.childCount) ?? 0}` : '')
    ));
  }

  // ★パネルを覆っている当人(黒画面の名指し)。
  const cover = laneProbe?.panelCover;
  if (!cover || cover.level === 'na') push(naCell('panel-cover', 'パネルの覆い'));
  else {
    const culprit = cover.culprit ? String(cover.culprit) : '';
    out.push(cell(
      'panel-cover', 'パネルの覆い',
      cover.level === 'bad' ? 'bad' : 'ok',
      /*
       * ★覆いが無いのも正常として出す。
       *   実機では「黒く塗っている要素は存在しない」= 停止で描けていないだけ、
       *   と分かったので、この✅自体が切り分けの証拠になる。
       */
      culprit ? `${culprit} が覆っています` : '覆っているものはありません'
    ));
  }

  const lane = p?.storyUserLaneRenderProbe;
  if (!lane || !String(lane.heavySettleState || '')) push(naCell('lane-settle', 'レーンの読み切り'));
  else {
    const st = String(lane.heavySettleState);
    out.push(cell(
      'lane-settle', 'レーンの読み切り',
      st === 'race' ? 'warn' : 'ok',
      st === 'race' ? '追い越されて未完了' : '全件そろいました'
    ));
  }

  /* ── 表示件数の増減(ちらつきの直接指標) ─────────────────── */
  const osc = lane?.laneTileOscillation;
  if (!osc || !(num(osc.samples) || 0)) push(naCell('lane-oscillation', 'レーンの増減'));
  else {
    const drops = num(osc.drops) || 0;
    out.push(cell(
      'lane-oscillation', 'レーンの増減',
      drops > 0 ? 'warn' : 'ok',
      drops > 0 ? `${drops}回 減りました` : '増える一方(正常)'
    ));
  }

  return out;
}
