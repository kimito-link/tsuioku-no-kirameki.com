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
 * @param {unknown} state
 * @returns {{ level:'ok'|'warn'|'bad'|'na'|'processing', text:string }}
 */
function northStarLevel(state) {
  const s = String(state || '');
  if (s === 'ok') return { level: 'ok', text: 'OK' };
  if (s === 'iframe_unrendered' || s === 'loading') return { level: 'processing', text: '取得中' };
  if (s === 'fetch_error') return { level: 'bad', text: '取得エラー' };
  if (s === 'event_present_unscrapable') return { level: 'na', text: '参加中(数値は取得不可)' };
  // v0.1.851: no_ranking_data=通信成功だがランキング0件(この配信に無いだけ)=赤にしない(na)。
  //   fetch_error は本物の取得失敗(ok===false)専用に分離(council/adlane-fetcherror-SYNTHESIS)。
  if (s === 'no_ranking_data') return { level: 'na', text: 'ランキング無し' };
  if (s === 'not_yet') return { level: 'processing', text: '取得中' }; // 起動直後=途中=青(赤/黄にしない)。
  if (s === 'no_event' || s === 'no_program_gift' || s === '' || s === 'missing') {
    return { level: 'na', text: '—' }; // その配信に該当が無いだけ=赤にしない。
  }
  return { level: 'warn', text: s };
}

/**
 * 健全度セル配列を作る。
 * @param {{ livesData?: any[], fastDiag?: any }} data
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
  //   保存0=na / NDGR connected で低率(<50)=匿名主体で na / それ以外は通常評価(okAt90/warnAt50)。
  const uidRateForCell =
    uidPct != null && ndgrConnected && uidPct < 50 ? null : uidPct;
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

  // 9-14. 北極星6レーン。
  const ns = gift?.['北極星レーン'] || {};
  const NS = [
    ['ns-contrib', '貢献度ランキング', '1_貢献度ランキング'],
    ['ns-ad', '広告ランキング', '+α_広告ランキング'],
    ['ns-gift-hist', 'ギフト履歴', '2_ギフト履歴'],
    ['ns-escore', 'イベントスコア', '3_イベント累計スコア'],
    ['ns-prog-pt', '番組累計pt', '4_番組累計ポイント'],
    ['ns-erank', 'イベント順位', '5_イベント現在順位']
  ];
  for (const [id, label, key] of NS) {
    const lane = ns[key];
    if (!lane) { cells.push(stateCell(id, label, 'na', '—')); continue; }
    const { level, text } = northStarLevel(lane.state);
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

  return cells;
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
  // 異常ゼロ=満点。進行中があれば「順調に取得中」を添える(待てば埋まる=正常)。
  const text = processingCount > 0 ? '異常なし ✓(順調に取得中)' : '異常なし ✓';
  return { level: 'ok', text, badLabels, warnLabels, processingCount };
}
