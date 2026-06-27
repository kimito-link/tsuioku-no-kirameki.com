// @ts-nocheck — 任意の jsonBlob / fastDiag を歩く動的判定
/**
 * 純Web公開コピーの自己診断（council/status-self-diagnoses-SYNTHESIS.md）。
 *
 * 狙い = 状態速報（AI共有テキスト）を1回コピーして渡すだけで、「純Web応援ライブビュー（app/live-view・
 *   拡張なしで見る ?v=token）が拡張内プレビューと一致しているか／どこで・なぜ落ちているか」が
 *   抜け漏れなく分かるようにする。今まで状態速報は fastDiag/popupDiag は JSON で全部出すのに、
 *   純Webに送る当のデータ（鏡: 応援レーン/数字カード/北極星/応援者ランキング）の中身を一切出さなかった
 *   ＝盲点。結局ユーザーにスクショ往復を求めることになっていた。
 *
 * ★制約（MEMORY 鉄則・実装の絶対条件）:
 *   - storage を一切 read しない。すべて「呼び出し側が既に手元に持っている jsonBlob と引数」だけから組む。
 *   - 純関数（chrome 非依存・副作用なし）。status-entry を太らせないため lib に隔離してテストする。
 *   - 「存在するか」だけでなく「中身が空でないか」を非null件数で数える（批判役の指摘を吸収）。
 *   - 拡張側の生データ（fastDiag 北極星レーン apiRows）と鏡の件数を突合し「コピー漏れ／積み忘れ」を検知。
 *     取れないときはフェイルソフト（沈黙）＝鏡側件数は常に出す。
 *
 * @module liveviewPublishSelfDiag
 */

const FRESH_MS = 3 * 60 * 1000; // 3分超＝古い＝popup未起動疑い（status の MIRROR_FRESH_MS と同値）

function lc(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

/** 鏡 row/cell が「中身あり（空埋めでない）」か。 */
function laneCellFilled(c) {
  return Boolean(c && typeof c === 'object' && String(c.displaySrc || '').trim());
}
function northRowFilled(r) {
  if (!r || typeof r !== 'object') return false;
  // 表示名 or 貢献度のどちらかがあれば「中身あり」とみなす（officialDomRankingRowsToStripRooms が描ける）。
  const name = String(r.name || '').trim();
  const contrib = Number(r.contribution);
  return Boolean(name) || (Number.isFinite(contrib) && contrib > 0);
}

/** 経過秒（capturedAt/savedAt epoch ms → 秒。取れなければ null）。 */
function ageSecOf(epochMs, nowMs) {
  const at = Number(epochMs);
  const now = Number(nowMs);
  if (!Number.isFinite(at) || at <= 0 || !Number.isFinite(now) || now <= 0) return null;
  return Math.max(0, Math.round((now - at) / 1000));
}

/**
 * fastDiag の北極星レーンから { apiRows, state }（取れなければ apiRows=null）。
 * ★state を返す理由（誤検知の根治）= 拡張側が 'not_yet'/'iframe_unrendered' のように【まだ取得中／確定して
 *   いない】とき apiRows は 0 になるが、これは「データが無い」ではなく「まだ取れていない」だけ。鏡には過去に
 *   取れた件数が残っているので、ここで突合すると「拡張0 ≠ 鏡6」を誤って『コピー漏れ』と断じてしまう。
 *   突合は拡張側が確定状態（'ok' / 'no_ranking_data' / 'no_program_gift'）のときだけに限定する。
 */
function laneStateOf(northLane, key) {
  const lane = northLane && typeof northLane === 'object' ? northLane[key] : null;
  if (!lane || typeof lane !== 'object') return { apiRows: null, state: '' };
  const n = Number(lane.apiRows);
  return { apiRows: Number.isFinite(n) ? n : null, state: String(lane.state || '') };
}

/** 拡張側のレーン state が「確定」しているか（確定時だけ件数突合してよい）。 */
const SETTLED_LANE_STATES = new Set(['ok', 'no_ranking_data', 'no_program_gift', 'no_event']);
function isSettledLaneState(state) {
  return SETTLED_LANE_STATES.has(String(state || ''));
}

/**
 * ★v0.1.966(council/single-source-of-truth-SYNTHESIS.md 第2段): 鮮度差の許容幅。
 *   整合チェックは「content の生 apiRows(koken 直読み・今この瞬間)」と「popup の鏡(2分前に焼いた)」という
 *   二系統を突合している(=二人の作る人を比べている)。koken API は約30秒間隔で自動更新されるため、
 *   content の今の件数と鏡を焼いた時点の件数が数件ズレるのは構造上正常(コピー漏れではない)。
 *   → 拡張>鏡 の差が この許容幅以内 かつ 鏡が空でない なら『鮮度差で説明可能(normal)』として警告しない。
 *   本物のコピー漏れ(鏡=0 なのに拡張>0=完全欠落、or 許容幅を超える大差)だけを🔴不一致(check)にする。
 *   v0.1.959 commentCountProvenance の ok/normal/check 3段階判定と同じ思想(誤検知ゼロ最優先)。 */
const NORTH_STAR_STALENESS_TOLERANCE_ROWS = 2;

/**
 * 確定状態・新鮮な鏡のときの件数突合の3段階判定(純粋な数値判定)。
 * @param {number} apiRows  拡張側の生件数(content koken 直読み)
 * @param {number} mirrorRows 鏡の件数(popup が焼いた)
 * @returns {{ verdict: 'match'|'normal'|'mismatch', reason: string }}
 */
function judgeNorthStarConsistency(apiRows, mirrorRows) {
  const ext = Math.max(0, Math.floor(Number(apiRows) || 0));
  const mir = Math.max(0, Math.floor(Number(mirrorRows) || 0));
  if (ext === mir) return { verdict: 'match', reason: '' };
  // 鏡が空なのに拡張に実データがある=完全欠落=本物のコピー漏れ。
  if (mir === 0 && ext > 0) {
    return { verdict: 'mismatch', reason: `鏡が空(${mir})なのに拡張に${ext}件=鏡publishの取りこぼし` };
  }
  // 拡張>鏡 が許容幅以内=koken 30秒自動更新の鮮度差で説明可能=正常。
  if (ext > mir && ext - mir <= NORTH_STAR_STALENESS_TOLERANCE_ROWS) {
    return { verdict: 'normal', reason: `差${ext - mir}件は koken の自動更新による鮮度差で説明可能(拡張=今/鏡=数十秒前)` };
  }
  // 鏡>拡張(鏡に余分)や、許容幅を超える大差=要確認。
  return { verdict: 'mismatch', reason: `拡張${ext} / 鏡${mir} の差が大きく鮮度差で説明しにくい` };
}

/**
 * 純Web公開コピーの自己診断オブジェクトを組む。read なし・副作用なし。
 *
 * @param {object} args
 * @param {object|null} args.jsonBlob          純Webへ送る当のデータ（_lastRenderedBundle.jsonBlob）
 * @param {object|null} args.fastDiag          拡張側の生診断（apiRows 突合に使う）
 * @param {string} args.currentLiveId          いま視聴中の lv（鏡 liveId 一致判定）
 * @param {{ ingestKey?: string, viewToken?: string }} args.publishKeys 公開キーの有無判定（値そのものは持ち込まない）
 * @param {object|null} args.lastPost          summarizeLiveviewPublishOutcome() の戻り
 * @param {number} args.nowMs                  鮮度基準（epoch ms）
 * @returns {object} 構造化された自己診断
 */
export function buildLiveviewPublishSelfDiag(args) {
  const a = args && typeof args === 'object' ? args : {};
  const blob = a.jsonBlob && typeof a.jsonBlob === 'object' ? a.jsonBlob : {};
  const keys = a.publishKeys && typeof a.publishKeys === 'object' ? a.publishKeys : {};
  const nowMs = Number(a.nowMs) || 0;
  const currentLid = lc(a.currentLiveId);

  // 公開設定（キー値は出さず有無だけ＝セキュリティ）
  const hasIngestKey = Boolean(String(keys.ingestKey || '').trim());
  const hasViewToken = Boolean(String(keys.viewToken || '').trim());

  // 各鏡
  const lane = blob.laneMirror && typeof blob.laneMirror === 'object' ? blob.laneMirror : null;
  const stat = blob.statCardsMirror && typeof blob.statCardsMirror === 'object' ? blob.statCardsMirror : null;
  const north = blob.northStarMirror && typeof blob.northStarMirror === 'object' ? blob.northStarMirror : null;
  const sup = blob.topSupporters && typeof blob.topSupporters === 'object' ? blob.topSupporters : null;

  // 応援レーン（非null件数）
  const laneBuckets = ['link', 'gift', 'ad', 'konta', 'tanu'];
  const laneCounts = {};
  let laneTotal = 0;
  for (const k of laneBuckets) {
    const arr = lane && Array.isArray(lane[k]) ? lane[k] : [];
    const n = arr.filter(laneCellFilled).length;
    laneCounts[k] = n;
    laneTotal += n;
  }

  // 北極星（contribution / ad の非null件数）
  const lanes = north && north.lanes && typeof north.lanes === 'object' ? north.lanes : {};
  const contribRows = Array.isArray(lanes.contributionRanking) ? lanes.contributionRanking : [];
  const adRows = Array.isArray(lanes.adRanking) ? lanes.adRanking : [];
  const contribCount = contribRows.filter(northRowFilled).length;
  const adCount = adRows.filter(northRowFilled).length;

  // 数字カード（値ありか＝text 非空かつ placeholder でない）
  const statCard = (obj, textKey, phKey) => {
    if (!stat || typeof stat !== 'object') return false;
    const t = String(stat[textKey] == null ? '' : stat[textKey]).trim();
    return Boolean(t) && stat[phKey] !== true;
  };
  const recordsFilled = statCard('recordsText', 'recordsText', 'recordsIsPlaceholder');
  const conc = stat && typeof stat.concurrent === 'object' ? stat.concurrent : {};
  const concFilled = Boolean(String(conc.estText || '').trim()) && conc.estIsPlaceholder !== true;
  const vis = stat && typeof stat.visitor === 'object' ? stat.visitor : {};
  const visFilled = Boolean(String(vis.text || '').trim()) && vis.isPlaceholder !== true;

  // 応援者ランキング
  const supRows = sup && Array.isArray(sup.rows) ? sup.rows : [];
  const supCount = supRows.length;

  // liveId 一致（各鏡。currentLid が空なら判定不能＝null）
  const lidOf = (m) => (m ? lc(m.liveId) : '');
  const lidMatch = (m) => {
    const mid = lidOf(m);
    if (!currentLid || !mid) return null; // どちらか不明なら判定しない
    return mid === currentLid;
  };

  // 鮮度
  const freshOf = (m) => ageSecOf(m && m.capturedAt, nowMs);

  // jsonBlob サイズ
  let sizeBytes = 0;
  try { sizeBytes = JSON.stringify(blob).length; } catch { sizeBytes = 0; }
  const sizeCap = 512 * 1024;

  // 整合チェック（拡張の生データ vs 鏡）。
  // ★誤検知の根治: 突合してよいのは「拡張側が確定状態(ok/no_ranking_data 等)」かつ「鏡が新鮮」のときだけ。
  //   拡張が not_yet(まだ取得中)だと apiRows=0 だが鏡には過去値が残り「拡張0 ≠ 鏡6」を誤って『コピー漏れ』
  //   と断じてしまう。鏡が古い(>3分)場合も別の瞬間の比較になるので突合しない（保留として理由を出す）。
  const northLane = a.fastDiag?.content?.giftDiagnostics?.['北極星レーン'] || null;
  const northMirrorAgeSec = freshOf(north);
  const northMirrorStale = northMirrorAgeSec != null && northMirrorAgeSec * 1000 > FRESH_MS;
  const consistency = [];
  const pushConsistency = (lane, key, mirrorRows) => {
    const { apiRows, state } = laneStateOf(northLane, key);
    if (apiRows == null) return; // fastDiag にレーンが無い＝突合不能（沈黙）
    if (!isSettledLaneState(state)) {
      consistency.push({ lane, extRows: apiRows, mirrorRows, match: null, skipped: true, reason: `拡張側が取得中(${state || '不明'})` });
      return;
    }
    if (northMirrorStale) {
      consistency.push({ lane, extRows: apiRows, mirrorRows, match: null, skipped: true, reason: `鏡が古い(${northMirrorAgeSec}秒前)` });
      return;
    }
    // ★第2段: 二系統(content apiRows vs popup 鏡)の鮮度差を3段階判定=1件差を誤って『コピー漏れ』にしない。
    const { verdict, reason } = judgeNorthStarConsistency(apiRows, mirrorRows);
    if (verdict === 'match') {
      consistency.push({ lane, extRows: apiRows, mirrorRows, match: true });
    } else if (verdict === 'normal') {
      // 鮮度差で説明可能=保留(警告しない)。理由を出して透明性は保つ。
      consistency.push({ lane, extRows: apiRows, mirrorRows, match: null, skipped: true, normal: true, reason });
    } else {
      consistency.push({ lane, extRows: apiRows, mirrorRows, match: false, reason });
    }
  };
  pushConsistency('北極星 貢献度', '1_貢献度ランキング', contribCount);
  pushConsistency('北極星 広告', '+α_広告ランキング', adCount);

  const post = a.lastPost && typeof a.lastPost === 'object' ? a.lastPost : null;

  return {
    publish: {
      hasIngestKey,
      hasViewToken,
      ready: hasIngestKey && hasViewToken
    },
    lastPost: post
      ? {
        everSent: post.everSent === true,
        ok: post.lastOk,
        httpStatus: post.lastHttpStatus ?? null,
        error: String(post.lastError || ''),
        ageSec: post.ageSec ?? null
      }
      : null,
    currentLiveId: currentLid,
    mirrors: {
      lane: lane
        ? { present: true, liveId: lidOf(lane), lidMatch: lidMatch(lane), ageSec: freshOf(lane), counts: laneCounts, total: laneTotal }
        : { present: false },
      stat: stat
        ? { present: true, liveId: lidOf(stat), lidMatch: lidMatch(stat), ageSec: freshOf(stat), records: recordsFilled, concurrent: concFilled, visitor: visFilled }
        : { present: false },
      northStar: north
        ? { present: true, liveId: lidOf(north), lidMatch: lidMatch(north), ageSec: freshOf(north), contribution: contribCount, ad: adCount }
        : { present: false },
      supporters: sup
        ? { present: true, liveId: lc(sup.liveId), lidMatch: lidMatch(sup), count: supCount }
        : { present: false }
    },
    consistency,
    size: { bytes: sizeBytes, cap: sizeCap, percent: sizeCap > 0 ? Math.round((sizeBytes / sizeCap) * 100) : 0 }
  };
}

/** 鮮度の見え方（古ければ警告マークを付ける）。 */
function freshMark(ageSec) {
  if (ageSec == null) return '';
  if (ageSec * 1000 > FRESH_MS) return ` 🟡${ageSec}秒前(古い)`;
  return ` ${ageSec}秒前`;
}

/** lidMatch を ✅/🔴/（不明）に。 */
function lidMark(lidMatch) {
  if (lidMatch === true) return ' ✅';
  if (lidMatch === false) return ' 🔴別配信';
  return '';
}

/**
 * 自己診断を状態速報に載せるテキスト行配列にする（buildAiShareFullText が push）。
 * @param {object} diag buildLiveviewPublishSelfDiag の戻り
 * @returns {string[]}
 */
export function formatLiveviewPublishSelfDiagLines(diag) {
  const d = diag && typeof diag === 'object' ? diag : {};
  const lines = [];
  lines.push('### 純Web公開コピーの自己診断');
  lines.push('（これを見れば「純Webに何が送られ・何件で・古くないか・拡張と一致するか」が分かります）');

  // 公開設定
  const p = d.publish || {};
  lines.push(`公開設定: ingestKey ${p.hasIngestKey ? '✅' : '🔴未設定'} / viewToken ${p.hasViewToken ? '✅' : '🔴未設定'}`);
  if (!p.ready) {
    lines.push('  → キー未設定＝純Webに何も届きません（ビルド時の NL_STATUS_INGEST_KEY / NL_STATUS_VIEW_TOKEN 要設定）');
  }

  // 直近の公開送信
  const lp = d.lastPost;
  if (!lp || !lp.everSent) {
    lines.push('直近の公開送信: 🔴 まだ送信していません（純Webは古い snapshot のままです。「🌐このURLをWEBでも公開する」を押してください）');
  } else {
    const okMark = lp.ok ? '✅' : '🔴';
    const http = lp.httpStatus ? ` HTTP ${lp.httpStatus}` : '';
    const age = lp.ageSec != null ? ` ${lp.ageSec}秒前` : '';
    const err = !lp.ok && lp.error ? ` (${lp.error})` : '';
    lines.push(`直近の公開送信: ${okMark}${age}${http}${err}`);
  }

  // 対象配信
  if (d.currentLiveId) {
    lines.push(`対象配信: ${d.currentLiveId}`);
  }

  // 鏡の中身
  const m = d.mirrors || {};
  lines.push('鏡の中身（純Webに送られる当のデータ）:');
  const lane = m.lane || {};
  if (lane.present) {
    const c = lane.counts || {};
    lines.push(`- 応援レーン: りんく${c.link || 0} / こん太${c.konta || 0} / たぬ姉${c.tanu || 0} / ギフト${c.gift || 0} / 広告${c.ad || 0}  計${lane.total || 0}${freshMark(lane.ageSec)}${lidMark(lane.lidMatch)} → ${lane.total ? '純Webで描画' : '空(描かれない)'}`);
  } else {
    lines.push('- 応援レーン: 🔴 鏡なし（popup を一度も開いていない疑い）');
  }
  const stat = m.stat || {};
  if (stat.present) {
    const r = stat.records ? '記録✅' : '記録—';
    const cc = stat.concurrent ? '同接✅' : '同接—';
    const v = stat.visitor ? '来場✅' : '来場—';
    lines.push(`- 数字カード: ${r} / ${cc} / ${v}${freshMark(stat.ageSec)}${lidMark(stat.lidMatch)}`);
  } else {
    lines.push('- 数字カード: 🔴 鏡なし');
  }
  const ns = m.northStar || {};
  if (ns.present) {
    lines.push(`- 北極星: 貢献度${ns.contribution || 0} / 広告${ns.ad || 0}${freshMark(ns.ageSec)}${lidMark(ns.lidMatch)} → ${(ns.contribution || ns.ad) ? '描画' : '空'}`);
  } else {
    lines.push('- 北極星: 🔴 鏡なし');
  }
  const sup = m.supporters || {};
  if (sup.present) {
    lines.push(`- 応援者ランキング: ${sup.count || 0}件${lidMark(sup.lidMatch)} → ${sup.count ? '純Webで描画' : '空'}`);
  } else {
    lines.push('- 応援者ランキング: 🔴 鏡なし');
  }

  // 整合チェック
  const cons = Array.isArray(d.consistency) ? d.consistency : [];
  if (cons.length) {
    lines.push('整合チェック（拡張の生データ vs 鏡）:');
    for (const c of cons) {
      if (c.skipped) {
        // 鮮度差で説明可能(normal)は🟢、取得中/古い等の保留は⏳で区別する。
        const tag = c.normal ? '🟢鮮度差で正常' : '⏳保留';
        lines.push(`- ${c.lane}: 拡張 apiRows=${c.extRows} / 鏡 ${c.mirrorRows}  ${tag}(${c.reason})`);
        continue;
      }
      const mark = c.match ? '✅一致' : '🔴不一致(コピー漏れ疑い)';
      const note = c.match && c.extRows === 0 ? '（元データ無し＝純Webに出なくて正常）' : '';
      lines.push(`- ${c.lane}: 拡張 apiRows=${c.extRows} / 鏡 ${c.mirrorRows}  ${mark}${note}`);
    }
  }

  // サイズ
  const sz = d.size || {};
  if (sz.bytes) {
    lines.push(`jsonBlob サイズ: ${Math.round(sz.bytes / 1024)}KB / ${Math.round((sz.cap || 0) / 1024)}KB (${sz.percent || 0}%)`);
  }

  return lines;
}

/**
 * 致命的な自己診断（症状→原因→次の一手 カード）。buildStatusActions の結果に結合する。
 * 致命のみ昇格: キー未設定・未送信/送信失敗・件数不一致・liveId 不一致。事実列挙は formatLines 側に留める。
 * @param {object} diag buildLiveviewPublishSelfDiag の戻り
 * @returns {Array<{id:string,severity:'bad'|'warn'|'info',symptom:string,cause:string,action:string,fixableHere:'yes'|'partly'|'no'}>}
 */
export function liveviewPublishSelfDiagToActionCards(diag) {
  const d = diag && typeof diag === 'object' ? diag : {};
  const cards = [];

  // キー未設定（致命: 純Webに何も届かない）
  const p = d.publish || {};
  if (!p.hasIngestKey || !p.hasViewToken) {
    const miss = [!p.hasIngestKey ? 'ingestKey' : '', !p.hasViewToken ? 'viewToken' : ''].filter(Boolean).join(' / ');
    cards.push({
      id: 'liveview-publish-key-missing',
      severity: 'bad',
      symptom: `純Web公開キーが未設定です（${miss}）`,
      cause: 'ビルド時に公開キーが注入されていません。純Webへスナップショットを送れず、/live-view は何も表示できません。',
      action: '.env に STATUS_INGEST_KEY / STATUS_VIEW_TOKEN を設定して拡張を再ビルド（npm run build:copy）してください。',
      fixableHere: 'no'
    });
  }

  // 未送信 or 送信失敗（致命: 純Webが古い snapshot を見続ける）
  const lp = d.lastPost;
  if (p.ready) {
    if (!lp || !lp.everSent) {
      cards.push({
        id: 'liveview-publish-never-sent',
        severity: 'warn',
        symptom: '純Webへまだ一度も公開送信していません',
        cause: '「🌐このURLをWEBでも公開する」を押すまで純Webにスナップショットが届きません。純Web側は古い／空のままです。',
        action: '状態速報の「🌐このURLをWEBでも公開する」ボタンを押してください。',
        fixableHere: 'yes'
      });
    } else if (lp.ok === false) {
      cards.push({
        id: 'liveview-publish-failed',
        severity: 'bad',
        symptom: `純Webへの公開送信が失敗しました${lp.httpStatus ? `（HTTP ${lp.httpStatus}）` : ''}`,
        cause: `送信エラー: ${lp.error || '不明'}。純Webは古い snapshot のまま更新されません。`,
        action: 'HTTP 401=キー不一致 / 500=Upstash未接続orRedeploy忘れ。Vercel 設定を確認して再送信してください。',
        fixableHere: 'partly'
      });
    }
  }

  // 件数不一致（コピー漏れ／積み忘れ）。★skipped(保留)や match:null は出さない＝確定した不一致(match===false)のみ。
  const cons = Array.isArray(d.consistency) ? d.consistency : [];
  for (const c of cons) {
    if (c.match === false && !c.skipped) {
      cards.push({
        id: `liveview-mirror-count-mismatch-${c.lane}`,
        severity: 'warn',
        symptom: `純Web鏡の件数が拡張側とズレています（${c.lane}: 拡張${c.extRows} ≠ 鏡${c.mirrorRows}）`,
        cause: '鏡に積む処理が拡張側の生データを取りこぼしています（コピー漏れ／積み忘れ）。純Webと拡張内プレビューで表示件数が食い違います。',
        action: 'このズレを開発者(Claude)に状態速報ごと共有してください。鏡 publish のどこで落ちているか実コードで特定して直します。',
        fixableHere: 'no'
      });
    }
  }

  // liveId 不一致（別配信の古い鏡が混入）
  const m = d.mirrors || {};
  const mismatched = [];
  for (const [name, label] of [['lane', '応援レーン'], ['stat', '数字カード'], ['northStar', '北極星'], ['supporters', '応援者ランキング']]) {
    const mm = m[name];
    if (mm && mm.present && mm.lidMatch === false) mismatched.push(label);
  }
  if (mismatched.length) {
    cards.push({
      id: 'liveview-mirror-liveid-mismatch',
      severity: 'warn',
      symptom: `別配信の古い鏡が混ざっています（${mismatched.join(' / ')}）`,
      cause: '視聴中の配信と鏡の liveId が一致していません。純Webに前の配信の内容が出ます。',
      action: 'watch タブを F5 して popup を開き直すと、現在の配信の鏡に更新されます。',
      fixableHere: 'partly'
    });
  }

  return cards;
}
