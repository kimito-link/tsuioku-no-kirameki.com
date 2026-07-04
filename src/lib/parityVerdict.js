// 3画面パリティ「①POP=②応援プレビュー=③WEBプレビュー が同一で完全か」の総合判定(純関数)。
//   council/parity-diagnose-SYNTHESIS.md の決定木を1か所に集約。観測のみ=描画/記録/数字は変えない。
//
//   設計の核(誤検知根絶):
//     - 取得不能(watch無し/popup未取得/別配信/古い/未ロード/未publish/apiRows無し)は必ず 'pending'(🟡保留)。
//       ×(mismatch)にしない。✅(ok)は「必須が全部取れて全部OK」のときだけ(厳しめ)。
//     - 必須が取れているのに false のときだけ 'mismatch'(🔴)。
//   ②応援プレビューの描画は status から直接読めないので previewAck(passive 専用 ack キー・別キー)で受ける。
//   ③WEBの実描画は別ドメインで読めない=観測の天井は「publish済+新鮮+送った鏡が整合」。

const DEFAULT_FRESH_MS = 180_000; // 3分。これより古い観測は鮮度不足として保留寄りに扱う。

/**
 * ★v0.1.1050: ④会場座席と①応援レーンの人数を突合する純関数(観測のみ・新規readなし=既存値のroll-up)。
 *
 * 基準(真値宣言): 外部真値は無いので「①identified(応援レーンが素性を取れた総数・cap前)」と
 *   「④participantCount(会場の論理席=実コメントした人)」を突き合わせる。どちらも cap 前の論理人数。
 *   laneShown(48等) vs seatsShown を直接比べない=それは cap の比較で内容の比較でないため。
 *
 * 判定(嘘の🔴/嘘の緑を出さない):
 *   - 会場未起動/未観測/liveId不一致/旧スナップショット → 'pending'(unobserved)。mismatch にしない。
 *     ④はオプション面なので pending は overall を劣化させない(呼び出し側で扱う)。
 *   - identified と participantCount の差が許容幅(絶対5人 or 相対5%の大)以内 → 'explained'(母集合差:
 *     popup は配信者ID未確定時に数値ID候補を落とす+汚染ガード/会場は落とさない、の既知の意図差)。
 *   - それ超 → 'mismatch'(本物のズレ)。
 *
 * @param {{ enabled?: boolean, liveId?: string, participantCount?: number, seatsShown?: number }|null} venue
 * @param {{ identified?: number, laneShown?: number, limit?: number }|null} laneCounts
 * @param {string} curLid 現配信ID(小文字)
 * @returns {{ state:'match'|'explained'|'mismatch'|'pending', reason:string, code:string, pop:number, venue:number }}
 */
export function judgeVenuePopulationParity(venue, laneCounts, curLid) {
  const v = venue && typeof venue === 'object' ? venue : null;
  const lc = laneCounts && typeof laneCounts === 'object' ? laneCounts : null;
  const pop = lc ? Math.max(0, Math.floor(Number(lc.identified) || 0)) : -1;
  const ven = v ? Math.max(0, Math.floor(Number(v.participantCount) || 0)) : -1;

  // 会場未起動/未観測 → pending(mismatch にしない・④はオプション)。
  if (!v || v.enabled !== true) {
    return { state: 'pending', reason: '④会場は未起動(突合対象外)', code: 'venue_off', pop, venue: ven };
  }
  const venLid = String(v.liveId || '').trim().toLowerCase();
  // 旧スナップショット(liveId 空)や別配信の残骸 → pending(嘘の🔴を出さないガード)。
  if (!venLid || (curLid && venLid !== curLid)) {
    return { state: 'pending', reason: '④会場の観測が別配信/古い(突合対象外)', code: 'venue_other_live', pop, venue: ven };
  }
  if (pop < 0) {
    return { state: 'pending', reason: '①応援レーンの人数が未観測', code: 'lane_unobserved', pop, venue: ven };
  }
  // 許容幅: 絶対5人 or 相対5% の大きい方(母集合差=数人オーダー+鮮度差を吸収)。
  const tolerance = Math.max(5, Math.ceil(Math.max(pop, ven) * 0.05));
  const diff = Math.abs(pop - ven);
  if (diff === 0) {
    return { state: 'match', reason: '①応援レーンと④会場の人数が一致', code: 'venue_match', pop, venue: ven };
  }
  if (diff <= tolerance) {
    return {
      state: 'explained',
      reason: `①${pop}人/④${ven}人(差${diff}=数値ID落とし等の既知の母集合差)`,
      code: 'venue_population_explained', pop, venue: ven
    };
  }
  return {
    state: 'mismatch',
    reason: `①応援レーン${pop}人 ≠ ④会場${ven}人(差${diff})`,
    code: 'venue_population_mismatch', pop, venue: ven
  };
}

/**
 * v0.1.1056(パリティ根本修正 Phase3): ①(鏡バンドル)が書いた世代(bundleGen)と②(応援プレビュー)が
 *   ack した世代(gen)を突合する純関数。値の食い違いでなく「同じ瞬間のデータを見ているか」を
 *   世代番号で判定する(mirrors-written-per-key-per-tick 問題の根治=①は3秒ごとに新しい世代を
 *   flush するため、②がその最新世代を読めているかを見る)。
 *
 * 判定:
 *   - 鏡が旧形式(bundleGen 未スタンプ=このマイルストーン未反映のビルド) → pending(gen_unstamped)。
 *   - ack が無い/gen フィールドを持たない旧形式 → pending(gen_no_ack)。
 *   - 別配信の ack → pending(gen_other_live)。
 *   - ack が鮮度切れ(freshMs 超) → pending(gen_ack_stale)。
 *   - 差が「①のflush間隔(3秒)ぶんの遅れ」以内 → lag(flight中=正常。ack取得からの経過時間で許容幅を広げる)。
 *   - 差が0または1 → match。
 *   - それ超 → mismatch(本物のズレ=②が鏡の更新に追従できていない)。
 *
 * @param {{ ready?: boolean, liveId?: string, ts?: number, gen?: number }|null} previewAck
 * @param {{ liveId?: string, bundleGen?: number }|null} laneMirror
 * @param {string} curLid 現配信ID(小文字)
 * @param {number} nowMs
 * @param {{ freshMs?: number, flushIntervalMs?: number }} [opts]
 * @returns {{ state:'match'|'lag'|'mismatch'|'pending', code:string, reason:string, writtenGen:number, ackGen:number, delta:number }}
 */
export function judgePreviewGenerationParity(previewAck, laneMirror, curLid, nowMs, opts = {}) {
  const ack = previewAck && typeof previewAck === 'object' ? previewAck : null;
  const mirror = laneMirror && typeof laneMirror === 'object' ? laneMirror : null;
  const freshMs = Number(opts?.freshMs) > 0 ? Number(opts.freshMs) : DEFAULT_FRESH_MS;
  const flushIntervalMs = Number(opts?.flushIntervalMs) > 0 ? Number(opts.flushIntervalMs) : 3000;

  const writtenGen = mirror && Number.isFinite(Number(mirror.bundleGen)) ? Math.max(0, Math.floor(Number(mirror.bundleGen))) : -1;
  if (writtenGen < 0) {
    return { state: 'pending', code: 'gen_unstamped', reason: '鏡が旧形式(世代未スタンプ)', writtenGen: -1, ackGen: -1, delta: 0 };
  }
  if (!ack || ack.ready !== true || !Number.isFinite(Number(ack.gen))) {
    return { state: 'pending', code: 'gen_no_ack', reason: '②の世代ackが未確認', writtenGen, ackGen: -1, delta: 0 };
  }
  const ackLid = String(ack.liveId || '').trim().toLowerCase();
  if (curLid && ackLid !== curLid) {
    return { state: 'pending', code: 'gen_other_live', reason: '②の世代ackが別配信', writtenGen, ackGen: -1, delta: 0 };
  }
  const ackTs = Number(ack.ts) || 0;
  const ackAgeMs = ackTs > 0 && nowMs > 0 ? Math.max(0, nowMs - ackTs) : 0;
  if (ackTs > 0 && nowMs > 0 && ackAgeMs > freshMs) {
    return { state: 'pending', code: 'gen_ack_stale', reason: '②の世代ackが古い', writtenGen, ackGen: -1, delta: 0 };
  }
  const ackGen = Math.max(0, Math.floor(Number(ack.gen)));
  const delta = writtenGen - ackGen;
  if (delta <= 1) {
    return { state: 'match', code: 'gen_match', reason: `①世代${writtenGen}=②世代${ackGen}`, writtenGen, ackGen, delta };
  }
  // flight中の許容: ack 取得からの経過時間分、①がさらに flush を重ねている可能性を吸収する。
  const toleratedDelta = 1 + Math.ceil(ackAgeMs / flushIntervalMs);
  if (delta <= toleratedDelta) {
    return {
      state: 'lag',
      code: 'gen_lag',
      reason: `②が①世代${writtenGen}に追従中(②世代${ackGen}・遅れ${delta}世代=flight中)`,
      writtenGen, ackGen, delta
    };
  }
  return {
    state: 'mismatch',
    code: 'gen_mismatch',
    reason: `①世代${writtenGen} ≠ ②世代${ackGen}(差${delta}・②が更新に追従できていない)`,
    writtenGen, ackGen, delta
  };
}

/**
 * @param {{
 *   trust?: any,                  // buildDiagnosticsTrust の戻り(hasWatchTab/popup/verdict/popupTrustable)
 *   publishSelfDiag?: any,        // buildLiveviewPublishSelfDiag の戻り(consistency/publish/lastPost/mirrors)
 *   laneRenderDiag?: any,         // buildStoryUserLaneRenderDiag の戻り(verdict/started/...)=①応援レーン描画
 *   northStarProbe?: any,         // popupDiag.popup.northStarRenderProbe(refreshAllStarted)=①北極星描画
 *   previewAck?: any,             // ②応援プレビューの描画 ack(別キー: { ready, ts, liveId })
 *   venueSeatsDiag?: any,         // ★v0.1.1050: ④会場座席の観測値({ enabled, liveId, seatsShown, participantCount, ... })
 *   laneDiagCounts?: any,         // ★v0.1.1050: ①応援レーンの人数観測({ identified, laneShown, limit })=会場突合の基準側
 *   laneMirror?: any,             // ★v0.1.1056: ①が書いた鏡バンドル({ liveId, bundleGen, ... })=②との世代突合の基準側
 *   currentLiveId?: string,
 *   nowMs?: number,
 *   freshMs?: number
 * }} input
 * @returns {{ verdict: 'ok'|'pending'|'mismatch', reason: string, nextAction: string, code: string }}
 */
export function buildParityVerdict(input) {
  const a = input && typeof input === 'object' ? input : {};
  const trust = a.trust && typeof a.trust === 'object' ? a.trust : null;
  const selfDiag = a.publishSelfDiag && typeof a.publishSelfDiag === 'object' ? a.publishSelfDiag : null;
  const laneDiag = a.laneRenderDiag && typeof a.laneRenderDiag === 'object' ? a.laneRenderDiag : null;
  const nsProbe = a.northStarProbe && typeof a.northStarProbe === 'object' ? a.northStarProbe : null;
  const ack = a.previewAck && typeof a.previewAck === 'object' ? a.previewAck : null;
  const venue = a.venueSeatsDiag && typeof a.venueSeatsDiag === 'object' ? a.venueSeatsDiag : null;
  const laneCounts = a.laneDiagCounts && typeof a.laneDiagCounts === 'object' ? a.laneDiagCounts : null;
  const laneMirror = a.laneMirror && typeof a.laneMirror === 'object' ? a.laneMirror : null;
  const nowMs = Number(a.nowMs) || 0;
  const freshMs = Number(a.freshMs) > 0 ? Number(a.freshMs) : DEFAULT_FRESH_MS;
  const curLid = String(a.currentLiveId || '').trim().toLowerCase();

  const pend = (/** @type {string} */ reason, /** @type {string} */ nextAction, /** @type {string} */ code) =>
    /** @type {{verdict:'pending',reason:string,nextAction:string,code:string}} */ ({ verdict: 'pending', reason, nextAction, code });
  const fail = (/** @type {string} */ reason, /** @type {string} */ nextAction, /** @type {string} */ code) =>
    /** @type {{verdict:'mismatch',reason:string,nextAction:string,code:string}} */ ({ verdict: 'mismatch', reason, nextAction, code });

  // --- 決定木(優先順・SYNTHESIS の順) ---
  // 1. watch 無し → 保留
  if (!trust || trust.hasWatchTab !== true) {
    return pend('視聴中の配信が無い(①②③は空/古くて当然)', 'ニコ生 watch を開いて popup を数秒開く', 'no_watch');
  }
  // 2. popup 診断が未取得/古い/別配信 → 保留(信頼の核が立たない)
  const popup = trust.popup && typeof trust.popup === 'object' ? trust.popup : null;
  if (!popup || popup.present !== true) {
    return pend('popup 固有診断が未取得', 'watch タブで popup を開く', 'popup_absent');
  }
  if (popup.lidMatch === false) {
    return pend('popup 診断が別配信のもの', 'watch を F5 して popup を開き直す', 'popup_other_live');
  }
  if (popup.fresh === false) {
    return pend('popup 診断が古い', 'popup を開き直して数秒待つ', 'popup_stale');
  }

  // 3. ①POP 描画(応援レーン+北極星)が起動しているか。
  //   ★v0.1.988: 診断の出自(viewKind)が passive(応援プレビュー)のときは、heavy 経路の probe
  //     (started/refreshAllStarted)が 0 でも正常=passive は鏡から描く別経路。①POP の起動判定は
  //     heavy popup(embed_watch/toolbar/popup)由来の診断のときだけ行う。passive 由来なら
  //     ①の起動は「鏡が現配信で新鮮(下の mirrors/consistency)」で代替評価する(誤診回避)。
  const viewKind = String(popup.viewKind || '').trim();
  const diagFromHeavyPopup = viewKind === '' || viewKind === 'embed_watch' || viewKind === 'toolbar' || viewKind === 'popup';
  if (diagFromHeavyPopup) {
    const laneStarted = laneDiag ? (Number(laneDiag.started) > 0 || laneDiag.verdict === 'ok') : null;
    const nsStarted = nsProbe ? Number(nsProbe.refreshAllStarted) > 0 : null;
    // 応援レーンが空ソース(供給0=出なくて正常)は false 扱いにしない。
    const laneEmptyNormal = laneDiag && laneDiag.verdict === 'empty_source';
    if (laneStarted === false && !laneEmptyNormal) {
      return fail('①POPの応援レーン描画が起動していない(a)', '拡張を🔄リロード→watch F5→popupを数秒開く', 'pop_lane_not_started');
    }
    if (nsStarted === false) {
      return fail('①POPの北極星描画が起動していない(a)', '拡張を🔄リロード→watch F5→popupを数秒開く', 'pop_northstar_not_started');
    }
  }

  // 4. データ整合(拡張 apiRows ≒ 鏡件数・現配信)。consistency に mismatch があれば 🔴。
  const consistency = selfDiag && Array.isArray(selfDiag.consistency) ? selfDiag.consistency : null;
  if (consistency) {
    const realMismatch = consistency.find((/** @type {any} */ c) => c && c.match === false && c.skipped !== true);
    if (realMismatch) {
      const lane = String(realMismatch.lane || 'レーン');
      return fail(
        `①は描けたが鏡に出ていない/食い違い(b): ${lane} 拡張${realMismatch.extRows}≠鏡${realMismatch.mirrorRows}`,
        'この状態速報を開発者に共有(鏡publishの取りこぼし)', 'data_mismatch'
      );
    }
  }

  // 5. ③WEB 送達(publish 済 + 新鮮)。未publish は保留(×にしない)。
  const publishReady = selfDiag?.publish?.ready === true;
  const lastPost = selfDiag?.lastPost && typeof selfDiag.lastPost === 'object' ? selfDiag.lastPost : null;
  if (!publishReady) {
    return pend('③WEB公開キーが未設定', '公開設定(ingestKey/viewToken)を用意', 'web_no_keys');
  }
  if (!lastPost || lastPost.everSent !== true) {
    return pend('③WEBへまだ送信していない', '「🌐このURLをWEBでも公開する」を押す', 'web_not_published');
  }
  if (lastPost.ok === false) {
    return fail('③WEBへの送信が失敗している', 'この状態速報を開発者に共有(送信エラー)', 'web_publish_failed');
  }
  if (lastPost.ageSec != null && lastPost.ageSec * 1000 > freshMs) {
    return pend('③WEBの送信が古い(再公開で新鮮化)', '「🌐このURLをWEBでも公開する」を再度押す', 'web_stale');
  }

  // 6. ②応援プレビュー描画 ack(別キー)。無ければ保留(まだ開いていない可能性)。
  if (!ack || ack.ready !== true) {
    return pend('②応援プレビューの描画が未確認', '応援プレビュー(診断内)を一度開く', 'preview_no_ack');
  }
  if (curLid && String(ack.liveId || '').trim().toLowerCase() !== curLid) {
    return pend('②応援プレビューの ack が別配信', '応援プレビューを開き直す', 'preview_other_live');
  }
  if (ack.ts && nowMs && nowMs - Number(ack.ts) > freshMs) {
    return pend('②応援プレビューの描画が古い', '応援プレビューを開き直す', 'preview_stale');
  }

  // 7. v0.1.1025/1027: ②が【実際に描いた件数】を①(鏡)と突合。ただし ack.supporterRows は②の【レーン描画時点】の
  //   スナップショットで、応援者ランキング(別 passive・後から描画)がまだ反映されていない/②を今開いていない古い ack の
  //   ことがある。断定して🔴にすると誤検知(嘘の🔴)になる(v0.1.1026 実機: ①POP に応援者ランキングは出ているのに🔴)。
  //   → 🔴(fail)でなく保留(pend)に格下げ。「まだ描く前 or ②未開」を欠落と断定しない。嘘の✅も嘘の🔴も出さない。
  const supMirror = selfDiag?.mirrors?.supporters;
  const supMirrorCount = supMirror && supMirror.present ? Math.max(0, Math.floor(Number(supMirror.count) || 0)) : 0;
  const ackSupporterRows = Math.max(0, Math.floor(Number(ack.supporterRows) || 0));
  if (supMirrorCount > 0 && ackSupporterRows === 0) {
    return pend(
      `②応援プレビューの応援者ランキングが未確認(①鏡${supMirrorCount}件・②はまだ描画前か未起動の可能性)`,
      '応援プレビューを開いて数秒待つ(既に開いていれば正常なことが多い)', 'preview_supporters_pending'
    );
  }

  // 7.5. ★v0.1.1056: ①(鏡)と②(応援プレビュー)が同じ世代のデータを見ているかを突合(新規readなし=
  //   既に読んでいる laneMirror/ack から gen を見るだけ)。mismatch(②が更新に追従できていない)だけ
  //   fail にする。lag(flight中)/pending(旧形式・未ack等)は既存判定を劣化させない(嘘の🔴を出さない)。
  const genParity = judgePreviewGenerationParity(ack, laneMirror, curLid, nowMs);
  if (genParity.state === 'mismatch') {
    return fail(
      `②応援プレビューが①の更新に追従できていない: ${genParity.reason}`,
      '応援プレビューを開き直す(それでも直らなければ開発者に共有)', 'preview_gen_mismatch'
    );
  }

  // 8. ★v0.1.1050: ④会場との人数突合(新規readなし=既存値のroll-up)。①②③が揃った後に会場を照合する。
  //   会場は「片方未観測」を mismatch にしない(pending は overall を劣化させない=オプション面)。
  //   本物のズレ(許容超)だけ 🔴。意図差(母集合差)は ✅ だが件数差を必ず reason に明記=嘘をつかない。
  const venueParity = judgeVenuePopulationParity(venue, laneCounts, curLid);
  if (venueParity.state === 'mismatch') {
    return fail(
      `①応援レーンと④会場の人数が食い違い: ${venueParity.reason}`,
      'この状態速報を開発者に共有(①と④の母集合突合)', 'venue_population_mismatch'
    );
  }

  // すべて必須クリア。④が意図差(explained)なら ✅ だが件数差を1行に明記する(嘘の緑を出さない)。
  if (venueParity.state === 'explained') {
    return {
      verdict: 'ok',
      reason: `①POP=②応援プレビュー=③WEB が同一で完全(④会場は意図差あり: ${venueParity.reason})`,
      nextAction: '', code: 'ok_venue_explained'
    };
  }
  return { verdict: 'ok', reason: '①POP=②応援プレビュー=③WEB が同一で完全', nextAction: '', code: 'ok' };
}

/**
 * 状態速報の先頭に出す1行。
 * @param {ReturnType<typeof buildParityVerdict>} v
 * @returns {string}
 */
export function formatParityVerdictLine(v) {
  const d = v && typeof v === 'object' ? v : { verdict: 'pending', reason: '', nextAction: '' };
  if (d.verdict === 'ok') {
    return '## 3画面パリティ: ✅ 同一で完全(①POP=②応援プレビュー=③WEB)';
  }
  const mark = d.verdict === 'mismatch' ? '🔴 不一致' : '🟡 保留';
  const tail = d.nextAction ? ` → ${d.nextAction}` : '';
  return `## 3画面パリティ: ${mark} — ${d.reason}${tail}`;
}

/**
 * v0.1.1015: ②応援プレビュー画面の最上部に出す「パリティ・バッジ」用の整形済みデータ(純関数)。
 *   狙い(ユーザー要望 2026-07-01「説明不要・コピーせず一発で分かる」): 今は①POP=②=③WEB の判定が
 *   フル状態速報テキストの中に1行埋もれていて、②プレビューを開いてもパッと見では食い違いが分からない。
 *   この純関数で verdict→{色/見出し/理由/次の一手} の構造化バッジ材料を1か所で組み、②が色付きで大きく出す。
 *   観測のみ=判定そのもの(buildParityVerdict)は一切変えない。整形と色割り当てだけ。
 *
 * @param {{ verdict?: string, reason?: string, nextAction?: string, code?: string }|null|undefined} v
 * @returns {{ tone: 'ok'|'pending'|'mismatch', icon: string, title: string, reason: string, nextAction: string }}
 */
export function buildParityBadge(v) {
  const d = v && typeof v === 'object' ? v : { verdict: 'pending', reason: '', nextAction: '', code: '' };
  const verdict = d.verdict === 'ok' || d.verdict === 'mismatch' ? d.verdict : 'pending';
  const reason = typeof d.reason === 'string' ? d.reason : '';
  const nextAction = typeof d.nextAction === 'string' ? d.nextAction : '';
  if (verdict === 'ok') {
    return {
      tone: 'ok',
      icon: '✅',
      title: '①POP・②この画面・③WEB は同一です',
      reason: '3画面とも同じ内容で、新鮮に揃っています。',
      nextAction: ''
    };
  }
  if (verdict === 'mismatch') {
    return {
      tone: 'mismatch',
      icon: '🔴',
      title: '①POP・②この画面・③WEB が食い違っています',
      reason,
      nextAction
    };
  }
  return {
    tone: 'pending',
    icon: '🟡',
    title: '①POP・②この画面・③WEB が揃っていません（保留）',
    reason,
    nextAction
  };
}
