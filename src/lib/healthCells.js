// v0.1.1056: パリティ根本修正 Phase4(この修正自体が動いているかを診断シートで検証可能にする)。
//   parityVerdict.js の世代パリティ判定を再利用(一方向 import・循環なし)。
import { judgePreviewGenerationParity } from './parityVerdict.js';

/**
 * healthCells.js — status ファーストビューの「健全度セル」を作る純関数(v0.1.843)。
 *
 * 背景(council/health-panel-SYNTHESIS.md): ユーザー要望「ファーストビューに20個ぐらいのセル・
 * 正常を100%・おかしいのは90/88と数値で一目で分かるように」。既存 statusMindmapModel/statusActionAdvisor が
 * 計算する値を【%+色】に再表示するだけ(新規集計ゼロ・hot path を重くしない)。
 *
 * 重要(星野ロミ式・失敗体験の除去): 不明/該当データ無しは 0%=赤にしない=【na('—')】にして色もスコアも
 * 付けない。正常配信で赤だらけにならないように。数値が意味を持つセルだけ pct、状態セルは state(色+短文)。
 *
 * 入力は status-entry が既に持つ { livesData, fastDiag }(buildStatusActions と同じ契約)。副作用なし。
 * 各セル= { id, label, kind:'pct'|'state', value:number|null, level:'ok'|'warn'|'bad'|'na', text?:string }。
 */

/**
 * v0.1.845: level に 'processing'(青) を追加。会議(health-panel-allgreen-SYNTHESIS)全員一致=
 *   「配信を見た瞬間ほぼ全部緑に見せたいが嘘はつかない」を、進行中(backfill中/取得中)を
 *   【異常な黄】でなく【正常な途中=青】に分けて実現。黄/赤は本当の異常(失速/エラー/停止)だけ。
 *   renderer(status-entry.js:495)は `hc-${level}` で CSS クラス化=`.hc-processing` を status.html に追加。
 */
/** @typedef {{ id:string, label:string, kind:'pct'|'state', value:number|null, level:'ok'|'warn'|'bad'|'na'|'processing', text?:string }} HealthCell */

/** @param {unknown} x @returns {number|null} */
function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * v0.1.1004: voiceDiag(会場読み上げ観測値)が「今の状態」と見なせる鮮度上限(ms)。
 *   会場が稼働中は comeview が頻繁に publishVoiceDiag するので capturedAt は新しい。これより古ければ
 *   会場非稼働(watch タブ無し/会場閉じた)=過去セッションの待機/沈黙が残存しているだけ=live 固着判定を
 *   しない(stale な「待機8・最終発話5.5日前」で🔴を誤発火しないため)。90秒=数十秒間隔の publish に余裕。
 */
const VOICE_DIAG_FRESH_MS = 90 * 1000;

/**
 * % セル: value(0-100) と 80/40 閾値で level。value=null は na('—')。
 * v0.1.845: opts.processing=true なら閾値評価をせず level='processing'(青・進行中=正常な途中)。
 *   数値(value)はそのまま保持=嘘をつかない(率70%は70%のまま色だけ青)。
 * @param {string} id @param {string} label @param {number|null} value
 * @param {{ okAt?:number, warnAt?:number, processing?:boolean }} [opts]
 * @returns {HealthCell}
 */
function pctCell(id, label, value, opts = {}) {
  const okAt = opts.okAt ?? 80;
  const warnAt = opts.warnAt ?? 40;
  if (value == null) return { id, label, kind: 'pct', value: null, level: 'na', text: '—' };
  const v = Math.max(0, Math.min(100, Math.round(value)));
  if (opts.processing) return { id, label, kind: 'pct', value: v, level: 'processing' };
  const level = v >= okAt ? 'ok' : v >= warnAt ? 'warn' : 'bad';
  return { id, label, kind: 'pct', value: v, level };
}

/**
 * 状態セル: level と短文。
 * @param {string} id @param {string} label @param {'ok'|'warn'|'bad'|'na'|'processing'} level @param {string} [text]
 * @returns {HealthCell}
 */
function stateCell(id, label, level, text) {
  return { id, label, kind: 'state', value: null, level: level || 'na', text: text || (level === 'na' ? '—' : '') };
}

/**
 * 北極星レーンの state → セル level。no_event/該当無しは na(赤にしない)。
 * v0.1.845: iframe_unrendered/loading は「取得中=正常な途中」なので processing(青)に
 *   (会議 health-panel-allgreen)。fetch_error(本当の失敗)は bad のまま。
 * v0.1.849: event_present_unscrapable は warn→na(対象外)に。これは「NDGR はイベント参加を示すが
 *   公式の順位/スコアの"数値"が cross-origin iframe で構造的に読めない」ケース(northStarLaneReason.js:22)。
 *   匿名 userId と同じく原理的に100%不可能=異常でない。さらにこのレーン自体は v0.1.282/05-19 で
 *   「空placeholderがスペース浪費」とユーザー実機指摘で popup 表示から撤回(非表示)済みなのに、
 *   健全度パネルだけ黄で蒸し返していた=v0.1.846「構造的限界は正常(na)扱い」の入れ漏れを是正。
 * v0.1.889: no_ranking_data の文言を laneKind で文脈化。「貢献度ランキング」の正体は koken の
 *   【ギフト貢献度】(API URL に /gift/・kokenContributionRankingApi.js)で、ギフトを投げた人の
 *   ランキング=ギフト0ptの配信は投げた人0人で正しく空になる。なのに「ランキング無し」とだけ出ると
 *   「広告ptはあるのに貢献度が無い=バグ?」とユーザーが誤解した(実機 lv350800580=広告24,200pt/
 *   ギフト0pt で貢献度 no_ranking_data=仕様通りだが文言が不親切だった)。laneKind で「まだギフト無し」
 *   等の文脈を添えて、空が正常だと分かるようにする。
 * @param {unknown} state
 * @param {'gift-contrib'|'ad'|'other'} [laneKind] no_ranking_data の文言を文脈化するためのレーン種別
 * @returns {{ level:'ok'|'warn'|'bad'|'na'|'processing', text:string }}
 */
function northStarLevel(state, laneKind = 'other') {
  const s = String(state || '');
  if (s === 'ok') return { level: 'ok', text: 'OK' };
  if (s === 'iframe_unrendered' || s === 'loading') return { level: 'processing', text: '取得中' };
  if (s === 'fetch_error') return { level: 'bad', text: '取得エラー' };
  if (s === 'event_present_unscrapable') return { level: 'na', text: '参加中(数値は取得不可)' };
  // v0.1.851: no_ranking_data=通信成功だがランキング0件(この配信に無いだけ)=赤にしない(na)。
  //   fetch_error は本物の取得失敗(ok===false)専用に分離(council/adlane-fetcherror-SYNTHESIS)。
  // v0.1.889: laneKind で「空が正常」と分かる文言に(ギフト貢献度=ギフト投げた人がいないだけ/
  //   広告=ニコニ広告が無いだけ)。広告ptの有無と混同させない。
  if (s === 'no_ranking_data') {
    if (laneKind === 'gift-contrib') return { level: 'na', text: 'まだギフト無し' };
    if (laneKind === 'ad') return { level: 'na', text: 'まだ広告無し' };
    return { level: 'na', text: 'ランキング無し' };
  }
  if (s === 'not_yet') return { level: 'processing', text: '取得中' }; // 起動直後=途中=青(赤/黄にしない)。
  if (s === 'no_event' || s === 'no_program_gift' || s === '' || s === 'missing') {
    return { level: 'na', text: '—' }; // その配信に該当が無いだけ=赤にしない。
  }
  return { level: 'warn', text: s };
}

/**
 * v0.1.894: 会場モード読み上げの健全度セルを作る純関数(ユーザー要望「マップに読み上げ特化の
 *   セルを入れて・タイミングや大量コメントでも抜け漏れなく全部読めるか分かるように」)。
 *
 * 既存の voiceDiag(comeview が KEY_VOICE_DIAG へ書く純観測値)を【%/色セル】に再表示するだけ=
 *   新規集計ゼロ・hot path に触れない(healthCells 全体の設計と同じ)。読み上げ未使用なら空配列を
 *   返す=死にセル(na の—)でファーストビューを埋めない(既存セルの na 方針と整合)。
 *
 * ユーザーの2つの関心に1セルずつ対応:
 *   ①「タイミング」(リアルタイムで出るか)= voice-timing セル:
 *      最終発話からの経過・直近合成ms・再生watchdog発火(固着)から level を決める。
 *      止まっている(最終発話が古い)/合成が重い/再生TO発生 を黄〜赤で一目に。
 *   ②「大量コメントでも抜け漏れなく全部読むか」= voice-coverage セル:
 *      staleDropTotal(鮮度切れで読まずに捨てた累計)=まさに「抜け漏れ」。
 *      0=全部読めている(緑)・出ていれば件数を黄で見せる(リアルタイム維持で間引いた=正常な
 *      トレードオフだが「全部は読めていない」事実は隠さない)。
 *
 * @param {(import('./voiceDiag.js').VoiceDiagState & { capturedAt?: number })|null|undefined} voiceDiag
 * @param {number} nowMs 最終発話 ago の算出用(現在時刻)
 * @returns {HealthCell[]}
 */
function buildVoiceHealthCells(voiceDiag, nowMs) {
  const snap = voiceDiag && typeof voiceDiag === 'object' ? voiceDiag : null;
  if (!snap) return [];
  const enabled = !!snap.enabled;
  const spoken = num(snap.spokenTotal) || 0;
  const queueMax = num(snap.queueMax) || 0;
  // 一度も ON にも発話にもなっていない=会場モード未使用=セルを足さない(死にセルで埋めない)。
  if (!enabled && spoken === 0 && queueMax === 0) return [];

  /** @type {HealthCell[]} */
  const out = [];
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const lastBase = num(snap.lastSpokenBase) || 0;
  const sinceSpokenMs = lastBase > 0 && now > 0 ? Math.max(0, now - lastBase) : null;
  const synthMs = num(snap.lastSynthMs);
  const pbTimeout = num(snap.playbackTimeoutTotal) || 0;
  const drop = num(snap.staleDropTotal) || 0;
  const queueNow = num(snap.queueNow) || 0;
  // ★v0.1.1004 stale 誤検知の根治: voiceDiag が古い(comeview が長く書いていない=会場非稼働/
  //   watch タブ無し)ときは、queueNow/lastSpokenBase が過去セッションの値のまま残り「待機8・
  //   最終発話5.5日前」で🔴を誤発火する(番犬は発火していない=今まさに固着ではない)。
  //   capturedAt が VOICE_DIAG_FRESH_MS より古ければ「今の状態は不明」として live 固着判定をしない。
  const capturedAt = num(snap.capturedAt) || 0;
  const diagFresh = capturedAt > 0 && now > 0 ? now - capturedAt <= VOICE_DIAG_FRESH_MS : true;

  // ① 読み上げ追従(タイミング)。判定は【今の状態】を最優先にする(v0.1.895)。
  //   重要: playbackTimeoutTotal は【累計】=一度でも再生TO/固着回復が起きると永久に増えたまま。
  //   これを bad の最優先にすると、過去に1回回復しただけで永久に🔴=「全部グリーンにならない」。
  //   固着の自動回復(v0.1.895 番犬)は正常動作なので、今読めていれば緑にする。今まさに止まって
  //   いるか(待機ありで沈黙が続く)を最優先に判定し、累計TOは緑時の補足情報に格下げする。
  if (!enabled) {
    out.push(stateCell('voice-timing', '読み上げ追従', 'na', 'OFF'));
  } else if (!diagFresh) {
    // ★v0.1.1004: voiceDiag が古い=会場が今稼働していない(過去セッションの待機/沈黙が残存)。
    //   「今まさに固着」ではないので🔴にせず、判定対象外(na)にして総合判定を汚さない。
    out.push(stateCell('voice-timing', '読み上げ追従', 'na', '会場休止中'));
  } else if (sinceSpokenMs != null && queueNow > 0 && sinceSpokenMs >= 30000) {
    // 待機があるのに30秒以上発話していない=今まさに止まっている(番犬の回復前 or 回復不能)。
    out.push(stateCell('voice-timing', '読み上げ追従', 'bad', `${Math.round(sinceSpokenMs / 1000)}秒沈黙`));
  } else if (sinceSpokenMs != null && queueNow > 0 && sinceSpokenMs >= 8000) {
    out.push(stateCell('voice-timing', '読み上げ追従', 'warn', `${Math.round(sinceSpokenMs / 1000)}秒待ち`));
  } else if (Number.isFinite(synthMs) && synthMs >= 2500) {
    // 合成が重い=遅れの主因(VOICEVOX 詰まり)。発話は進んでいても黄で予兆を見せる。
    out.push(stateCell('voice-timing', '読み上げ追従', 'warn', `合成${synthMs}ms`));
  } else {
    // 今は追従できている=緑。過去に固着回復があった場合だけ件数を添える(緑のまま・正常動作の記録)。
    out.push(stateCell('voice-timing', '読み上げ追従', 'ok', pbTimeout > 0 ? `追従中(復帰${pbTimeout})` : '追従中'));
  }

  // ② 読み上げ漏れ(大量コメントでも全部読めているか)。staleDropTotal=読まずに捨てた【累計】。
  //   間引きは大量コメント時にリアルタイムを保つための【正常なトレードオフ】=異常(黄)ではない。
  //   v0.1.895: 累計を黄にすると一度でも間引いたら永久に🟡=「全部グリーンにならない」。なので件数は
  //   見せる(抜け漏れの事実は隠さない=ユーザー要望)が、色は na(対象外・総合判定を汚さない)に。
  //   0件なら ok「漏れ無し」(全部読めている達成感)。
  if (!enabled) {
    out.push(stateCell('voice-coverage', '読み上げ漏れ', 'na', '—'));
  } else if (drop <= 0) {
    out.push(stateCell('voice-coverage', '読み上げ漏れ', 'ok', '漏れ無し'));
  } else {
    out.push(stateCell('voice-coverage', '読み上げ漏れ', 'na', `間引き${drop}件`));
  }

  return out;
}

/**
 * v0.1.902: 会場モードの座席健全度セルを作る純関数(ユーザー要望「会場座席情報も健全度パネルに
 *   載せれば AI も人間もミス(配信者本人の混入・顔ぶれずれ・会場の固着)を一目で発見できる」)。
 *
 * 会場が KEY_VENUE_SEATS_DIAG へ書く純観測値(venueSeatsDiag)を【色セル】に再表示するだけ=
 *   新規集計ゼロ・hot path に触れない(healthCells 全体の設計と同じ)。会場未使用なら空配列を
 *   返す=死にセル(na の—)でファーストビューを埋めない(voice セルと同じ作法)。
 *
 * ユーザーの関心に対応:
 *   ①「配信者本人が席に混ざっていないか」= venue-broadcaster セル:
 *      broadcasterInSeats=true(除外漏れ=v0.1.901 の本人除外が効いていない)なら bad。
 *      配信者 uid 不明(broadcasterKnown=false)は判定不能なので na(赤にしない)。
 *   ②「会場が固まっていないか」= venue-seats セル:
 *      座席更新が古い(lastUpdateAt が一定以上前)なら warn(会場が止まっている兆候)。
 *      更新できていれば ok(表示席数/参加者数を添える)。
 *
 * @param {(import('./venueSeatsDiag.js').VenueSeatsDiagState & { capturedAt?: number })|null|undefined} venueSeatsDiag
 * @param {number} nowMs 更新 ago の算出用(現在時刻)
 * @returns {HealthCell[]}
 */
function buildVenueSeatsHealthCells(venueSeatsDiag, nowMs) {
  const snap = venueSeatsDiag && typeof venueSeatsDiag === 'object' ? venueSeatsDiag : null;
  if (!snap) return [];
  const enabled = !!snap.enabled;
  // 会場モードが一度も開かれていない=未使用=セルを足さない(死にセルで埋めない)。
  if (!enabled) return [];

  /** @type {HealthCell[]} */
  const out = [];
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const seatsShown = num(snap.seatsShown) || 0;
  const participants = num(snap.participantCount) || 0;
  const otherCount = num(snap.otherCount) || 0;
  const perRow = num(snap.perRow) || 0;
  const venueMaxRows = num(snap.venueMaxRows) || 0;
  const seatAreaWidth = num(snap.seatAreaWidth) || 0;
  const capReason =
    typeof snap.visibleCapReason === 'string' ? snap.visibleCapReason : '';
  const lastUpdateAt = num(snap.lastUpdateAt) || 0;
  const sinceUpdateMs = lastUpdateAt > 0 && now > 0 ? Math.max(0, now - lastUpdateAt) : null;
  const broadcasterInSeats = !!snap.broadcasterInSeats;
  const broadcasterKnown = !!snap.broadcasterKnown;

  // ① 配信者混入(v0.1.901 の本人除外が効いているか)。混入していたら bad=除外漏れの即検知。
  if (!broadcasterKnown) {
    // 配信者 uid 未取得=混入判定ができない(赤にしない・対象外)。
    out.push(stateCell('venue-broadcaster', '配信者混入', 'na', 'ID未取得'));
  } else if (broadcasterInSeats) {
    out.push(stateCell('venue-broadcaster', '配信者混入', 'bad', '混入'));
  } else {
    out.push(stateCell('venue-broadcaster', '配信者混入', 'ok', 'なし'));
  }

  // ② 会場座席(固着検出+稼働状況)。更新が古い=会場が止まっている兆候。
  const otherSuffix = otherCount > 0 ? `+他${otherCount}` : '';
  if (sinceUpdateMs != null && sinceUpdateMs >= 60000) {
    out.push(stateCell('venue-seats', '会場座席', 'warn', `更新${Math.round(sinceUpdateMs / 1000)}秒前`));
  } else {
    out.push(stateCell('venue-seats', '会場座席', 'ok', `${seatsShown}席/${participants}人${otherSuffix}`));
  }

  // ③ v0.1.1043: 「参加者は居るのに席に描画されていない」を計器で可視化(全員着席の真因切り分け)。
  //   参加者>0 かつ 描画席が参加者を大きく下回る=絞られている。理由(participant/grid/hardCap)と
  //   perRow/段/幅を添えて、状態速報のコピペだけで真因(画面幅・レイアウト・上限)を特定できるようにする。
  //   幅=0px は clientWidth 未確定の事故。理由=grid は列数×段数で頭打ち。理由=participant は絞られていない。
  if (participants > 0 && (perRow > 0 || seatAreaWidth > 0)) {
    const reasonLabel =
      capReason === 'participant'
        ? '全員可視'
        : capReason === 'grid'
          ? '列×段で頭打ち'
          : capReason === 'hardCap'
            ? '500上限で頭打ち'
            : '不明';
    const detail = `理由=${reasonLabel}・perRow=${perRow}・段=${venueMaxRows}・幅=${seatAreaWidth}px`;
    // 描画席が参加者の8割未満に絞られている(かつ全員可視でない)ときだけ warn で目立たせる。
    const starved = seatsShown < participants * 0.8 && capReason !== 'participant';
    // 幅=0px はレイアウト未確定=事故の強い兆候なので bad 寄りの warn。
    const widthBroken = seatAreaWidth <= 0;
    out.push(
      stateCell(
        'venue-seats-visible',
        '会場席の網羅',
        starved || widthBroken ? 'warn' : 'ok',
        `${seatsShown}/${participants}描画（${detail}）`
      )
    );
  }

  return out;
}

/**
 * 応援アイコン列(popup レーン)の人数整合セル。popup が書く laneDiag(純観測値)を色セルに再表示。
 *   「素性が取れた人 N / レーンに出した人 M」を出し、N>M(表示上限で切れている)を可視化する。
 *   2026-06-22 ユーザー要望「合わないとおかしいけど(計器で確認したい)」=self-verifying。
 *   未観測(liveId 空)はセルを足さない(死にセルで埋めない)。
 * @param {any} laneDiag
 * @returns {HealthCell[]}
 */
function buildLaneHealthCells(laneDiag) {
  const snap = laneDiag && typeof laneDiag === 'object' ? laneDiag : null;
  if (!snap) return [];
  const liveId = String(snap.liveId || '').trim();
  if (!liveId) return [];

  /** @type {HealthCell[]} */
  const out = [];
  const identified = num(snap.identified) || 0;
  const laneShown = num(snap.laneShown) || 0;
  const others = identified > laneShown ? identified - laneShown : 0;

  // 素性が取れた人 N と レーン表示 M。N>M=表示上限で切れている(正常な仕様だが「他に何人いるか」を明示)。
  //   黙って切る不誠実を避ける=切れていることを na(情報・総合判定を汚さない)で正直に出す。
  if (others > 0) {
    out.push(stateCell('lane-count', '応援レーン', 'na', `表示${laneShown}/素性${identified}(他${others}は会場)`));
  } else {
    out.push(stateCell('lane-count', '応援レーン', 'ok', `${laneShown}人 全員表示`));
  }

  // ★v0.1.1048 Phase0(全員表示の重さ判定・観測のみ): レーン描画1回の所要ms。
  //   全員表示(limit撤廃)で重くなるかを実機1枚で確定するベースライン。33ms(30fps相当)超で warn。
  //   0=未計測はセルを足さない(死にセルで埋めない)。
  const paintMs = num(snap.paintMs) || 0;
  if (paintMs > 0) {
    out.push(
      stateCell(
        'lane-paint',
        'レーン描画速度',
        paintMs > 33 ? 'warn' : 'ok',
        `${paintMs}ms/回(表示${laneShown})`
      )
    );
  }

  return out;
}

/**
 * 健全度セル配列を作る。
 * @param {{ livesData?: any[], fastDiag?: any, voiceDiag?: any, venueSeatsDiag?: any, laneDiag?: any, giftEffectDiag?: any, milestoneEffectDiag?: any, previewRenderAck?: any, laneMirror?: any, nowMs?: number }} data
 * @returns {HealthCell[]}
 */
export function buildHealthCells(data) {
  const livesData = Array.isArray(data?.livesData) ? data.livesData : [];
  const fast = data?.fastDiag?.content && typeof data.fastDiag.content === 'object' ? data.fastDiag.content : null;
  const gift = fast?.giftDiagnostics && typeof fast.giftDiagnostics === 'object' ? fast.giftDiagnostics : null;
  const obs = gift?.commentObservability || {};
  /** @type {HealthCell[]} */
  const cells = [];

  // v0.1.845: backfill(過去ログ取り込み)が進行中か。進行中なら率(取得率・記録↔公式一致)は
  //   「まだ取り込み中=正常な途中」なので processing(青)にして、初動の黄/赤を消す(嘘はつかない=
  //   数字はそのまま)。失速(stalled)/完了(done)後は通常評価。会議 health-panel-allgreen。
  const bf = gift?.romiDebug?.backfill || data?.fastDiag?.content?.romiDebug?.backfill || null;
  const bfDone = bf
    ? Number(bf.done) === 1 || bf.stopReason === 'reached_start' || bf.stopReason === 'backward_exhausted'
    : false;
  const bfStalled = bf ? bf.stopReason === 'stalled' : false;
  const bfRunning = bf ? !!bf.running && !bfDone && !bfStalled : false;

  // v0.1.848: 取得率/記録↔公式一致の「進行中」判定を、romiDebug.backfill(フォアグラウンド1配信の
  //   フラグ)だけでなく、statusFormat の正本ロジック「放送中(endedAt無し)×記録あり×率<100=
  //   追いつき中(正常)」に揃える。裏タブで backfill 中の配信は romiDebug.backfill に出ない(その配信の
  //   snapshot は含まれない)ため、bfRunning だけだと『裏タブで追いつき中の低率』を異常(赤)と誤判定して
  //   いた(実機 lv350792764=裏タブ18%が赤)。配信ごとの表示は既に「⏳追いつき中」と出ているのに
  //   健全度パネルだけ非対称だった=これを解消。
  //   判定材料は statusFormat の正本(放送中×記録あり×【既知の率が100未満】=追いつき中)に揃える。
  //   率が未知(null)は追いつき中とみなさない=累計率での通常評価にフォールバック(過剰に青へ倒さない)。
  //   v0.1.850 重要修正: anyCatchingUp は livesData(全配信)由来=per-live の正本。これを
  //   romiDebug.backfill(フォアグラウンド【1配信】のフラグ)の done/stalled で打ち消してはいけない。
  //   実機 lv350788367: foreground 1配信が stopReason:'backward_exhausted'(=その配信は入口まで到達)
  //   でも running:true で取得率2%=実態は追いつき中。なのに旧 bfDone ゲートが【他の追いつき中配信まで】
  //   無効化し「完了したのに2%=取りこぼし(赤)」と誤判定していた。放送中×低率は statusFormat 同様
  //   常に追いつき中(青)とし、失速(stalled)は専用の『過去ログ取得』セルが赤で示す(二重に赤にしない)。
  //   終了済み(endedAt)×低率は anyCatchingUp が除外済み=本当の取りこぼしとして通常評価(赤)。
  const anyCatchingUp = livesData.some(
    (lv) => {
      if (!lv || lv.endedAt || !(num(lv.recordedCount) > 0)) return false;
      const r = num(lv.officialRatePct);
      return r != null && r < 100;
    }
  );
  const ratesInProgress = bfRunning || anyCatchingUp;

  // 1. 取得率(記録/公式・累計)。公式0件は na。追いつき中(放送中×未達 or backfill中)は processing(青)。
  const recordedSum = livesData.reduce((a, lv) => a + (num(lv?.recordedCount) || 0), 0);
  const officialSum = livesData.reduce((a, lv) => a + (num(lv?.officialCommentCount) || 0), 0);
  cells.push(pctCell('capture-rate', '取得率', officialSum > 0 ? (recordedSum / officialSum) * 100 : null, { processing: ratesInProgress }));

  // 2. userId 付き保存率。保存0は na。
  //   v0.1.860: 匿名(184)主体の配信は userId 付き率が低くて当然=仕様であってバグではない
  //   (匿名コメントは DOM に識別子が無く userId は NDGR にしか存在しない・memory
  //   reference_comment_capture_anon_vs_named)。低率を🔴異常にすると『取れてないのに正常はおかしい』の
  //   逆=『仕様なのに異常と嘘の赤』を出し、status の対処カード(uid-low=⚪情報・仕様と明記)と食い違う
  //   (健全度パネルだけ赤=自己矛盾=self-verifying違反)。NDGR が connected で受信できているなら
  //   低率は匿名主体=構造的に正常 → na(該当外・色を付けない)。NDGR 切断(本当の異常)は専用の
  //   『NDGR接続』セルが赤で示す(ここで二重に赤にしない)。statusActionAdvisor の uid-low(<50%を
  //   info=仕様)と判定をそろえる。
  const uid = obs.savedCommentsUidStats || {};
  const totalSaved = num(uid.totalSaved);
  const ndgrConnected = String(fast?.networkErrorProbe?.ndgrConnectStatus || '') === 'connected';
  const uidPct = totalSaved && totalSaved > 0 ? num(uid.withUidPercent) : null;
  //   保存0=na。
  //   v0.1.885: NDGR connected(=コメントは受信できている=取りこぼしではない)なら、userId 付き率が
  //   90%未満は『匿名がそこそこ居るだけ=仕様』であり異常でない → na(対象外・色を付けない)。
  //   従来は『<50 だけ na・50〜90 は🟡warn』だったため、匿名が半分くらいの配信(実機 54.3%)で
  //   健全度パネルだけ🟡を出し、対処カード(advisor uid-low は <50 を『仕様で正常』と明言・50〜90 は
  //   何も出さない=正常扱い)と食い違っていた=同じ事実に複数表示で片方だけ嘘(self-verifying 違反)。
  //   高率(>=90)は記名主体で健全=ok(緑)は残す。NDGR connected で 90 未満は warn にせず na。
  //   NDGR 切断の本当の異常は『NDGR接続』セルが赤で示す。NDGR 未接続時のみ通常評価(取りこぼし疑い)。
  const uidRateForCell =
    uidPct != null && ndgrConnected && uidPct < 90 ? null : uidPct;
  cells.push(pctCell('uid-rate', 'userId付き保存', uidRateForCell, { okAt: 90, warnAt: 50 }));

  // 3. NDGR接続。unknown(未受信)は na(障害でない)。
  const ndgr = String(fast?.networkErrorProbe?.ndgrConnectStatus || '');
  cells.push(stateCell('ndgr', 'NDGR接続',
    ndgr === 'connected' ? 'ok' : ndgr === 'disconnected' ? 'bad' : 'na',
    ndgr === 'connected' ? '接続中' : ndgr === 'disconnected' ? '切断' : '—'));

  // 4. リアルタイム取り込み(最終取り込み)。取り込み無し配信は na。
  const agos = livesData.map((lv) => num(lv?.lastIngestAgoMs)).filter((x) => x != null);
  const minAgo = agos.length ? Math.min(...agos) : null;
  cells.push(stateCell('ingest', 'リアルタイム取込',
    minAgo == null ? 'na' : minAgo < 120000 ? 'ok' : minAgo < 300000 ? 'warn' : 'bad',
    minAgo == null ? '—' : `${Math.round(minAgo / 1000)}秒前`));

  // 5. 過去ログ(backfill)。v0.1.845: 取得中は processing(青・正常な途中)・失速だけ bad。
  if (bf) {
    cells.push(stateCell('backfill', '過去ログ取得',
      bfDone ? 'ok' : bfStalled ? 'bad' : bfRunning ? 'processing' : 'na',
      bfDone ? '完了' : bfStalled ? '失速' : bfRunning ? '取得中' : '—'));
  } else {
    cells.push(stateCell('backfill', '過去ログ取得', 'na', '—'));
  }

  // 6. アバター解決率。観測0(intercept0)は na。
  //   v0.1.845: アバターは観測ユーザーの後を追って非同期取得=構造的に遅れて埋まる「追いつき」で、
  //   ハード失敗しない(時間で埋まる・status の対処候補も ⚪ 扱い)。よって ok 未満は warn でなく
  //   processing(青・取得中)。「見た瞬間に黄」で不安にさせないため(会議 health-panel-allgreen)。
  const avMap = num(gift?.interceptAvatarSize ?? gift?.avatarUidDiag?.avatarMapSize);
  const interceptN = num(gift?.romiDebug?.interceptMapSize ?? gift?.avatarUidDiag?.interceptedUsersTotal);
  const avatarPct = interceptN && interceptN > 0 && avMap != null ? Math.min(100, (avMap / interceptN) * 100) : null;
  cells.push(pctCell('avatar', 'アバター解決', avatarPct, { processing: avatarPct != null && avatarPct < 80 }));

  // 7. 描画(paint)。%でなく色+短文(恣意的%を作らない)。裏タブ等で値無しは na。
  const paint = num(livesData.map((lv) => num(lv?.paintMs)).filter((x) => x != null)[0]);
  cells.push(stateCell('paint', '描画',
    paint == null ? 'na' : paint < 60 ? 'ok' : paint < 150 ? 'warn' : 'bad',
    paint == null ? '—' : `${paint}ms`));

  // 8. 多タブ名残(stale)。警告だが赤にしない=warn まで(実害なし・v0.1.834)。
  const stale = !!gift?.multiTabDiag?.staleDomBundleSuspected;
  cells.push(stateCell('stale', '多タブ名残', stale ? 'warn' : 'ok', stale ? '履歴あり' : 'なし'));

  // 8b. スクロール白化(重い・一瞬白くなって遅れて描画)。content-entry が scrollWhiteoutProbe で観測した
  //   fastDiag.content.scrollWhiteoutDiag を色セルに再表示(新規集計ゼロ)。count=0=観測されていない=ok、
  //   count>0=白化が起きている=warn(実害は「重い・遅延」で記録は壊れない=赤にしない)。未観測(diag無し)は na。
  const wo = fast?.scrollWhiteoutDiag;
  if (wo && typeof wo === 'object') {
    const woCount = num(wo.whiteoutCount) || 0;
    cells.push(stateCell('scroll-whiteout', 'スクロール白化', woCount > 0 ? 'warn' : 'ok', woCount > 0 ? `${woCount}回` : 'なし'));
  } else {
    cells.push(stateCell('scroll-whiteout', 'スクロール白化', 'na', '—'));
  }

  // 9-14. 北極星6レーン。
  //   v0.1.889: 「貢献度ランキング」→「ギフト貢献度」にラベル変更(正体は koken の /gift/ ランキング=
  //   広告貢献度とは別系統)。laneKind を渡して no_ranking_data の文言を「まだギフト無し/まだ広告無し」と
  //   文脈化=「広告ptはあるのに貢献度無し?」の誤解を断つ。
  const ns = gift?.['北極星レーン'] || {};
  /** @type {Array<[string,string,string,('gift-contrib'|'ad'|'other')]>} */
  const NS = [
    ['ns-contrib', 'ギフト貢献度', '1_貢献度ランキング', 'gift-contrib'],
    ['ns-ad', '広告ランキング', '+α_広告ランキング', 'ad'],
    ['ns-gift-hist', 'ギフト履歴', '2_ギフト履歴', 'other'],
    ['ns-escore', 'イベントスコア', '3_イベント累計スコア', 'other'],
    ['ns-prog-pt', '番組累計pt', '4_番組累計ポイント', 'other'],
    ['ns-erank', 'イベント順位', '5_イベント現在順位', 'other']
  ];
  for (const [id, label, key, laneKind] of NS) {
    const lane = ns[key];
    if (!lane) { cells.push(stateCell(id, label, 'na', '—')); continue; }
    const { level, text } = northStarLevel(lane.state, laneKind);
    cells.push(stateCell(id, label, level, text));
  }

  // 15. コンソールエラー。
  const errTotal = num(fast?.consoleErrorProbe?.totalCount);
  cells.push(stateCell('console', 'エラー',
    errTotal == null ? 'na' : errTotal === 0 ? 'ok' : 'bad',
    errTotal == null ? '—' : errTotal === 0 ? '0件' : `${errTotal}件`));

  // 16. storage安定(SW/stall)。
  const swInactive = fast?.networkErrorProbe?.serviceWorkerInactive;
  cells.push(stateCell('storage', 'storage安定',
    swInactive == null ? 'na' : swInactive ? 'bad' : 'ok',
    swInactive == null ? '—' : swInactive ? 'SW停止' : '正常'));

  // 17. NDGR取りこぼし(decoded>0 なのに chats=0=匿名主体 or 取得前)。v0.1.845: warn→processing
  //   (匿名184主体は仕様で取れない=異常でない・取得前は途中=どちらも黄にせず青の「途中/対象外」扱い)。
  const wc = gift?.ndgrWireCounters || {};
  const decoded = num(wc.decoded);
  const chats = num(wc.chats);
  cells.push(stateCell('ndgr-chats', 'NDGRコメント',
    decoded == null ? 'na' : (chats && chats > 0) ? 'ok' : (decoded > 0 ? 'processing' : 'na'),
    decoded == null ? '—' : (chats && chats > 0) ? `${chats}件` : (decoded > 0 ? '0(匿名/取得前)' : '—')));

  // 18. 記録↔公式一致(B後・per-live の率の最小=一番ズレてる配信)。公式0は na。
  //   v0.1.845/848: 追いつき中(放送中×未達 or backfill中)は processing(青・取り込み中で率が低いのは当然)。
  const rates = livesData.map((lv) => num(lv?.officialRatePct)).filter((x) => x != null);
  cells.push(pctCell('match', '記録↔公式一致', rates.length ? Math.min(...rates) : null, { okAt: 90, warnAt: 60, processing: ratesInProgress }));

  // 19-20. 会場モード読み上げ(タイミング・抜け漏れ)。voiceDiag 未使用なら空=セルを足さない。
  //   nowMs は ago 算出用(テスト固定可能なように引数で受ける・未指定は実行時刻)。
  const nowMs = Number.isFinite(Number(data?.nowMs)) ? Number(data.nowMs) : safeNow();
  for (const c of buildVoiceHealthCells(data?.voiceDiag, nowMs)) cells.push(c);

  // 21-22. 会場モード座席(配信者混入・固着)。venueSeatsDiag 未使用なら空=セルを足さない。
  for (const c of buildVenueSeatsHealthCells(data?.venueSeatsDiag, nowMs)) cells.push(c);

  // 23. 応援レーン人数整合(素性 N / 表示 M)。laneDiag 未観測なら空=セルを足さない。
  for (const c of buildLaneHealthCells(data?.laneDiag)) cells.push(c);

  // 24. v0.1.1054: ギフト/広告の「検知→演出→効果音」整合(giftEffectDiag 未観測なら空)。
  for (const c of buildGiftEffectHealthCells(data?.giftEffectDiag)) cells.push(c);

  // 25-26. v0.1.1056: パリティ根本修正(①②の世代同期)自体が動いているかの自己診断。
  for (const c of buildPreviewGenSyncHealthCells(data?.previewRenderAck, data?.laneMirror, nowMs)) cells.push(c);

  // 27. v0.1.1058: コメント数マイルストーンの「検知→演出→効果音」整合(milestoneEffectDiag 未観測なら空)。
  for (const c of buildMilestoneEffectHealthCells(data?.milestoneEffectDiag)) cells.push(c);

  return cells;
}

/**
 * v0.1.1056(パリティ根本修正 Phase4): ①(鏡バンドル)に世代(bundleGen)がスタンプされているか、
 *   ②(応援プレビュー)がその世代を追従できているかを健全度セルに反映する。
 *   この修正自体(gen スタンプの仕組み)が正しく機能しているかを診断シートで検証できるようにする
 *   (ユーザー明示要件: 修正を入れるだけでなく、その修正が動いているかを状態速報で確認できること)。
 * @param {{ ready?: boolean, liveId?: string, ts?: number, gen?: number }|null|undefined} previewRenderAck
 * @param {{ liveId?: string, bundleGen?: number, capturedAt?: number }|null|undefined} laneMirror
 * @param {number} nowMs
 * @returns {HealthCell[]}
 */
function buildPreviewGenSyncHealthCells(previewRenderAck, laneMirror, nowMs) {
  const mirror = laneMirror && typeof laneMirror === 'object' ? laneMirror : null;
  if (!mirror) return []; // 鏡が一度も無い=popup未起動=セルを足さない(死にセルにしない)

  /** @type {HealthCell[]} */
  const out = [];
  const hasGenStamp = Number.isFinite(Number(mirror.bundleGen));
  // ① 鏡世代スタンプ自体が乗っているか(=この修正が反映されたビルドで動いているか)。
  out.push(
    hasGenStamp
      ? stateCell('mirror-gen-stamp', '鏡世代スタンプ', 'ok', `gen=${Number(mirror.bundleGen)}`)
      : stateCell('mirror-gen-stamp', '鏡世代スタンプ', 'warn', '旧形式(gen未スタンプ・反映3手順を確認)')
  );

  // ② ②(応援プレビュー)がその世代に追従できているか(旧形式時は判定できないので na)。
  if (!hasGenStamp) {
    out.push(stateCell('preview-gen-sync', '②世代同期', 'na', '鏡が旧形式のため判定不可'));
    return out;
  }
  const ack = previewRenderAck && typeof previewRenderAck === 'object' ? previewRenderAck : null;
  const curLid = String(mirror.liveId || '').trim().toLowerCase();
  const genParity = judgePreviewGenerationParity(ack, mirror, curLid, nowMs);
  if (genParity.state === 'pending') {
    out.push(stateCell('preview-gen-sync', '②世代同期', 'na', genParity.reason));
  } else if (genParity.state === 'lag') {
    out.push(stateCell('preview-gen-sync', '②世代同期', 'processing', genParity.reason));
  } else if (genParity.state === 'mismatch') {
    out.push(stateCell('preview-gen-sync', '②世代同期', 'warn', genParity.reason));
  } else {
    out.push(stateCell('preview-gen-sync', '②世代同期', 'ok', genParity.reason));
  }
  return out;
}

/**
 * ギフト/広告の検知はしたが投擲演出/効果音が出ていない取りこぼしを健全度セルに反映する。
 *   これまで aiShareFullText(文章の対処カード)にだけ統合されており、completenessScore(数値の
 *   達成率)には反映されない「片翼統合」だった(v0.1.1054 全機能診断監査で発見)。
 * @param {import('./giftEffectDiag.js').GiftEffectDiagState|null|undefined} giftEffectDiag
 * @returns {HealthCell[]}
 */
function buildGiftEffectHealthCells(giftEffectDiag) {
  const snap = giftEffectDiag && typeof giftEffectDiag === 'object' ? giftEffectDiag : null;
  if (!snap) return [];
  const giftDetected = num(snap.giftDetected) || 0;
  const adDetected = num(snap.adDetected) || 0;
  if (giftDetected === 0 && adDetected === 0) return []; // 未観測=このセッションでギフト/広告が無かった

  const soundEnabled = snap.soundEnabled !== false;
  const giftThrown = num(snap.giftThrown) || 0;
  const giftSoundPlayed = num(snap.giftSoundPlayed) || 0;
  const adThrown = num(snap.adThrown) || 0;
  const adSoundPlayed = num(snap.adSoundPlayed) || 0;

  const throwMissing = Math.max(0, giftDetected - giftThrown) + Math.max(0, adDetected - adThrown);
  const soundMissing = soundEnabled
    ? Math.max(0, giftThrown - giftSoundPlayed) + Math.max(0, adThrown - adSoundPlayed)
    : 0; // 効果音OFFは鳴らないのが正常=不合格にしない(誤診断防止)

  const missing = throwMissing + soundMissing;
  const detail =
    missing > 0
      ? `演出漏れ${throwMissing}件・音漏れ${soundMissing}件`
      : `検知${giftDetected + adDetected}件 全て演出/音まで到達`;
  return [stateCell('gift-effect', 'ギフト演出/効果音', missing > 0 ? 'warn' : 'ok', detail)];
}

/**
 * コメント数マイルストーンの検知はしたが演出/効果音が出ていない取りこぼしを健全度セルに反映する。
 *   giftEffectDiag と同じ「片翼統合」を繰り返さないよう、healthCells + diagnosisRegistry の
 *   両方へ同時に登録する(v0.1.1054/1055の教訓)。
 * @param {import('./milestoneEffectDiag.js').MilestoneEffectDiagState|null|undefined} milestoneEffectDiag
 * @returns {HealthCell[]}
 */
function buildMilestoneEffectHealthCells(milestoneEffectDiag) {
  const snap = milestoneEffectDiag && typeof milestoneEffectDiag === 'object' ? milestoneEffectDiag : null;
  if (!snap) return [];
  const detected = num(snap.milestoneDetected) || 0;
  if (detected === 0) return []; // 未観測=このセッションでマイルストーン到達が無かった

  const soundEnabled = snap.soundEnabled !== false;
  // v0.1.1060: director段(effectDirector)の計器。数値でなければ旧スナップショット=未計測(⚠を出さない)。
  const directedRaw = /** @type {any} */ (snap).milestoneDirected;
  // raw==null を先に弾く(Number(null)=0 で「未計測」が「0件計測」に化ける罠)。
  const directed = directedRaw == null || !Number.isFinite(Number(directedRaw)) ? null : Number(directedRaw);
  const thrown = num(snap.milestoneThrown) || 0;
  const soundPlayed = num(snap.milestoneSoundPlayed) || 0;

  const directorMissing = directed == null ? 0 : Math.max(0, detected - directed);
  const throwMissing = Math.max(0, (directed == null ? detected : directed) - thrown);
  const soundMissing = soundEnabled ? Math.max(0, thrown - soundPlayed) : 0;

  const missing = directorMissing + throwMissing + soundMissing;
  const detail =
    missing > 0
      ? `${directorMissing > 0 ? `director判定漏れ${directorMissing}件・` : ''}演出漏れ${throwMissing}件・音漏れ${soundMissing}件`
      : `検知${detected}件 全て演出/音まで到達`;
  return [stateCell('milestone-effect', 'マイルストーン演出/効果音', missing > 0 ? 'warn' : 'ok', detail)];
}

/** テスト/SSR でも壊れない現在時刻(Date.now が無い環境のフォールバック)。 */
function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

/**
 * v0.1.846: 健全度パネル先頭の「総合判定」バッジ。ユーザー要望「全部100%になるまで自動修復=
 *   修復する必要ないぐらい完全に」への回答=【満点の定義を『全セル緑』でなく『異常ゼロ』に置き換える】。
 *   進行中(processing=待てば埋まる)・対象外/構造的限界(na=匿名や該当無しで100%不可能)は
 *   「正常」とみなし、本当の異常(warn/bad)だけを数える。異常ゼロなら「異常なし ✓」=満点。
 *   これにより自動修復ループは不要(直せるものは既に青で進行中・直せないものは正常扱い)で、
 *   嘘もつかない(取れてないのに緑にしない)。star-romi: 失敗体験の除去 × self-verifying。
 *
 * @param {HealthCell[]} cells
 * @returns {{ level:'ok'|'warn'|'bad', text:string, badLabels:string[], warnLabels:string[], processingCount:number }}
 */
export function summarizeHealthVerdict(cells) {
  const list = Array.isArray(cells) ? cells : [];
  const badLabels = list.filter((c) => c && c.level === 'bad').map((c) => c.label);
  const warnLabels = list.filter((c) => c && c.level === 'warn').map((c) => c.label);
  const processingCount = list.filter((c) => c && c.level === 'processing').length;
  if (badLabels.length > 0) {
    return { level: 'bad', text: `異常あり: ${badLabels.join('・')}`, badLabels, warnLabels, processingCount };
  }
  if (warnLabels.length > 0) {
    return { level: 'warn', text: `注意: ${warnLabels.join('・')}`, badLabels, warnLabels, processingCount };
  }
  // 異常ゼロ=満点。進行中があれば「取り込み中」と中立に出す(待てば埋まる=正常だが「順調」と
  //   言い切ると低率の配信を緑で隠したように見える=v0.1.886 ユーザー要望で『取り込み中』へ)。
  const text = processingCount > 0 ? '取り込み中 ✓（取得を進めています）' : '異常なし ✓';
  return { level: 'ok', text, badLabels, warnLabels, processingCount };
}
