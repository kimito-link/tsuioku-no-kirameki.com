// @ts-nocheck
/**
 * status 整形の純関数群。
 *
 * 拡張の status ページ(src/extension/status-entry.js)と、
 * スマホ閲覧用 Web 版(app/app.js)で同じ描画を保つため、
 * 整形ロジックをここに一本化する(単一ソース)。
 *
 * 入力の `livesData` は summarizeOneLive が返す正規化済みの配列:
 *   { lv, broadcasterName, title, recordedCount, officialCommentCount,
 *     officialRatePct, watchCount, adPoints, giftPoints, elapsedSec,
 *     capturedAt, lastIngestAgoMs }
 *
 * いずれも DOM/Chrome API に依存しない。
 *
 * @module statusFormat
 */

import { buildPerfDiagLine } from './perfDiag.js';

/**
 * 概要テキスト(配信数・累計記録・公式累計・取得率)を組み立てる。
 *
 * v0.1.804: 累計記録は各 live の(per-live で単調化済み)記録件数を合算するが、enumerate の
 *   一瞬の揺れ(タブの query タイミング・storage クランプで panel summary が一時的に欠ける等)で
 *   合算対象から live が落ちると累計だけが後退して見えることがある。これを表示層で吸収するため、
 *   呼び出し側が「直近に出した累計の最大」を opts.recordedSumFloor として渡せる。床は表示だけで、
 *   storage には書かない(リロードすれば素直に再計算=「タブを閉じたら本当に減る」を恒久には隠さない)。
 *
 * @param {object[]} livesData
 * @param {{ recordedSumFloor?: number }} [opts]
 * @returns {string} 空配列なら ''
 */
export function buildOverviewText(livesData, opts = {}) {
  if (!Array.isArray(livesData) || !livesData.length) return '';
  const lines = [];
  const total = livesData.length;
  let recordedSum = sumRecordedFromLives(livesData);
  let officialSum = 0;
  for (const r of livesData) {
    officialSum += r.officialCommentCount || 0;
  }
  // 累計の後退だけを床で止める(per-live は既に単調化済みなので、ここは enumerate 揺れ対策)。
  const floor = Number(opts && opts.recordedSumFloor);
  if (Number.isFinite(floor) && floor > recordedSum) {
    recordedSum = floor;
  }
  const ratePct = officialSum > 0 ? Math.round((recordedSum / officialSum) * 100) : null;
  lines.push(`記録中 ${total} 配信 / 累計 記録 ${recordedSum.toLocaleString('ja-JP')} 件`);
  if (officialSum > 0) {
    lines.push(`公式累計 ${officialSum.toLocaleString('ja-JP')} 件 (取得率 ${ratePct}%)`);
  }
  return lines.join('\n');
}

/**
 * livesData の記録件数を合算する純関数(累計の床を呼び出し側が保持するために使う)。
 * @param {object[]} livesData
 * @returns {number} 記録件数の合算(空/非配列は 0)
 */
export function sumRecordedFromLives(livesData) {
  if (!Array.isArray(livesData)) return 0;
  let sum = 0;
  for (const r of livesData) sum += (r && r.recordedCount) || 0;
  return sum;
}

/**
 * 1 配信ぶんのブロックテキストを組み立てる。
 * @param {object} live summarizeOneLive の 1 要素
 * @returns {string}
 */
export function buildLiveBlockText(live) {
  const lines = [];
  // 配信終了が検知済みなら見出しに ⚠ 終了 を付けて、更新が止まった枠と区別する。
  const endedMark = live.endedAt ? '⚠ 終了 ' : '';
  const head =
    `${endedMark}[${live.lv}] ${live.broadcasterName || '(配信者名 不明)'}` +
    (live.elapsedSec != null ? ` ・ 経過 ${formatElapsed(live.elapsedSec)}` : '');
  lines.push(head);
  // 配信タイトル(snapshot から取れた場合のみ)。
  if (live.title) {
    lines.push(`  「${live.title}」`);
  }
  // v0.1.642: 取得率(%)を主役にする。記録/速報/パネルで件数が数件ズレても、
  //   ユーザーが知りたいのは「全部取れたか=何%か」。状態ラベル付きで%を先頭に出し、
  //   件数は括弧内の補助に回す(ユーザー指摘「監視htmlは%で見せるべき」)。
  lines.push('  ' + buildCaptureRateLine(live));
  if (live.watchCount != null) {
    lines.push(`  来場 ${live.watchCount.toLocaleString('ja-JP')} 人`);
  }
  const ptParts = [];
  if (live.adPoints != null) ptParts.push(`広告 ${live.adPoints.toLocaleString('ja-JP')}pt`);
  if (live.giftPoints != null) ptParts.push(`ギフト ${live.giftPoints.toLocaleString('ja-JP')}pt`);
  if (ptParts.length) lines.push('  ' + ptParts.join(' / '));
  if (live.lastIngestAgoMs != null) {
    lines.push(`  最終取り込み ${formatAgo(live.lastIngestAgoMs)}前`);
  }
  // 複数タブ paint 負荷の診断行(perfDiag があるときだけ)。白フラッシュ原因の見える化。
  const perfLine = buildPerfDiagLine(live.perfDiag);
  if (perfLine) lines.push(perfLine);
  return lines.join('\n');
}

/**
 * v0.1.642: 取得率(%)を主役にした1行を組み立てる。状態ラベル + %(大) + 件数(括弧の補助)。
 *   記録/速報/パネルで件数が数件ズレても「何%取れたか」で「全部取れた」が一目で分かる。
 *
 * v0.1.791(ユーザー要望「追いつく途中で壊れてると不安になる・告知があれば親切」):
 *   配信【放送中】に取得率が低いのは、過去ログを遡って取得中(バックフィル)の【正常な途中経過】で
 *   あって異常ではない。なのに従来は終了済みの「取りこぼし」と同じ 🔴 を出していて不安にさせた。
 *   そこで放送中(endedAt 無し)×低%は 🔴 でなく「⏳ 取り込み中」にし、後ろに「(過去のコメントを
 *   取得中)」の一言を添える。放送終了済み(endedAt あり)×低%は本当の取りこぼしなので従来どおり
 *   🔴 のまま(=ここは不安になって正しい)。endedAt 未指定なら従来挙動(後方互換)。
 *
 * v0.1.886(ユーザー要望「一気に取れる前提=100%未満は進捗を見せろ。緑で隠すな・赤で不安にするな」):
 *   放送中×低%の「⏳ 取り込み中」に【あと約M件(M=公式-記録)】を添えて進捗を明示する。
 *   これで低率を『緑(隠す)でも赤(不安)でもなく、青の進捗』として正直に見せる。公式件数が未取得
 *   (off==null)のときは差が出せないので「あと約」は付けない(過大/憶測の数字を出さない)。
 *
 * @param {{ recordedCount?: number, officialCommentCount?: number|null,
 *   officialRatePct?: number|null, endedAt?: number|null }} live
 * @returns {string}
 */
export function buildCaptureRateLine(live) {
  const rec = Number(live?.recordedCount) || 0;
  const off = live?.officialCommentCount;
  const pct = live?.officialRatePct;
  const counts =
    `記録 ${rec.toLocaleString('ja-JP')}` +
    (off != null ? ` / 公式 ${Number(off).toLocaleString('ja-JP')}` : '');
  // 取得率が取れないとき(公式件数未取得)は従来どおり件数のみ。
  if (pct == null || !Number.isFinite(Number(pct))) {
    return counts;
  }
  const p = Number(pct);
  // 放送中かどうか: endedAt が無い(=まだ配信中)なら、低%は追いつき途中の正常状態。
  const isLive = !(live && live.endedAt);
  // 状態ラベル: 100%到達=✅完了 / 80%+=もう少し / 40%+=取得中。
  //   40%未満は、放送中なら「⏳ 取り込み中」(正常)・終了済みなら「🔴 取得中」(取りこぼし)。
  if (p >= 100) return `✅ 取得完了 ${p}% (${counts})`;
  if (p >= 80) return `🟢 ほぼ取得 ${p}% (${counts})`;
  if (p >= 40) return `🟡 取得中 ${p}% (${counts})`;
  if (isLive) {
    // v0.1.886: あと約M件(M=公式-記録)を添えて進捗を明示。公式未取得 or 既に追い越し(差<=0)なら省く。
    const remain = off != null ? Math.max(0, Number(off) - rec) : null;
    const remainText = remain && remain > 0 ? `・あと約 ${remain.toLocaleString('ja-JP')} 件` : '';
    return `⏳ 取り込み中 ${p}% (${counts})${remainText}・過去のコメントを取得中`;
  }
  return `🔴 取得中 ${p}% (${counts})`;
}

/**
 * v0.1.692: 過去ログ取得(backfill)の診断行を組み立てる(status 概要併記用)。
 *   従来 status-entry.js にインライン実装だったものを純関数化。aborted の真因
 *   (crawl 例外メッセージ errMsg)があれば併記し、status を見るだけで真因調査できるようにする。
 *
 * v0.1.794: backfill 進捗キー(nls_backfill_progress_v1)は content が【完走(done=1)時だけ】書く
 *   (v0.1.657「短時間は静かに一気に取る」設計)。だが長時間/複数配信では完走まで時間がかかり、
 *   その間 bp=null=この行が空になり「過去ログを取り込んでいる気配が status に出ない」=ユーザーの
 *   「一気に取れる前提が出ていない」(=完成がドンと出る気配が無い)不安の正体。
 *   → popup は v0.1.764 で「null でも記録中なら『取り込み中…』」のフォールバックを持つが status は
 *   非対称で未対応だった。ここで status にも同等のフォールバックを入れる(会議4役一致・案B)。
 *   bp が無くても opts.catchingUp=true(記録中×放送中×未達の配信がある)なら取り込み中を出す。
 *   v0.1.657 の短時間体験は壊さない=短時間配信は数秒で完走し catchingUp が立つ前に done=1 になる。
 *
 * @param {{lid?:string, rows?:number, done?:number, stopReason?:string, errMsg?:string}|null|undefined} bp
 * @param {{catchingUp?: boolean}} [opts]
 *   catchingUp: bp が null/未完了でも「記録中で放送中・まだ取り切っていない配信がある」=取り込み中
 *   とみなしてフォールバック行を出す。呼び出し側(status-entry.js)が livesData から判定して渡す。
 * @returns {string} 出すものが無ければ ''
 */
export function buildBackfillProgressLine(bp, opts) {
  if (bp && bp.lid) {
    return (
      `過去ログ取得: [${bp.lid}] ${Number(bp.done) === 1 ? '完了' : '取得中'}・取得${Number(bp.rows) || 0}件` +
      (bp.stopReason ? `・停止理由=${bp.stopReason}` : '') +
      (bp.errMsg ? `・エラー: ${bp.errMsg}` : '')
    );
  }
  // 進捗キーがまだ書かれていない(走行中/完走前)が、記録中×放送中×未達の配信があるなら、
  //   「黙って空」でなく「取り込み中」と伝える(数字は出さない=不安にさせない・v0.1.791 と同思想)。
  if (opts && opts.catchingUp) {
    return '過去ログ取得: 取り込み中…（過去のコメントをさかのぼって取得しています）';
  }
  return '';
}

/**
 * v0.1.766(ユーザー要望「概要にレーン状況も入れたい」): 公式値レーン(北極星レーン)の状況を
 *   状態速報の概要に1行で出す純関数。「レーンが出ていない時」を一目で分かるようにする。
 *
 * 入力は fastDiag.content.giftDiagnostics の「北極星レーン」相当(視聴中の配信のみ取得可能)。
 *   各レーンの state を「出てる/取得中/この配信に無し/空」に分類して短く並べる。
 *   value/count が正なら「出てる(N)」、ok だが 0 なら「空」、iframe_unrendered は「取得中」、
 *   no_event/no_program_gift は「無し」(この配信にイベント/ギフトが無い=正常)。
 *
 * @param {Record<string, {state?: string, value?: number|null, count?: number,
 *   apiRows?: number, ndgrValue?: number|null, foundCountLifetime?: number}>|null|undefined} lanes
 *   北極星レーン オブジェクト(キー例: "1_貢献度ランキング" / "2_ギフト履歴" /
 *   "3_イベント累計スコア" / "4_番組累計ポイント" / "5_イベント現在順位" / "+α_広告ランキング")。
 * @returns {string} レーン状況の1行(データ無しなら '')。
 */
export function buildLaneStatusLine(lanes) {
  if (!lanes || typeof lanes !== 'object') return '';
  // 表示順と短縮ラベル(キー先頭の番号で並ぶが、明示順で安定させる)。
  const order = [
    ['1_貢献度ランキング', 'ギフト貢献'], // v0.1.889: 正体は koken の /gift/ ランキング=広告貢献度と別系統。診断パネルと用語統一。
    ['+α_広告ランキング', '広告'],
    ['2_ギフト履歴', 'ギフト履歴'],
    ['4_番組累計ポイント', '番組pt'],
    ['3_イベント累計スコア', 'Eスコア'],
    ['5_イベント現在順位', 'E順位']
  ];
  const parts = [];
  for (const [key, label] of order) {
    const lane = lanes[key];
    if (!lane || typeof lane !== 'object') continue;
    const state = String(lane.state || '');
    // v0.1.844: apiRows(Koken/Nicoad 無認証 API で実際に取れた行数)を最優先。従来は count
    //   (DOM bundle 長)だけ見て、autoOpen 未発火配信で API 13行があっても n:0→「空」と誤報した。
    //   レーンが実描画に使う正本は API 行なので、これを n に含めて実数(✅13 等)で出す。
    const n =
      Number(lane.apiRows) ||
      Number(lane.count) ||
      Number(lane.value) ||
      Number(lane.ndgrValue) ||
      Number(lane.foundCountLifetime) ||
      0;
    // v0.1.860: 「既知の0」と「未取得(空)」を区別する。value/ndgrValue が 0(数値として確定)なら
    //   それは『取れていて0pt』=✅0 であって「空」ではない(実機 lv350796749=番組pt が NDGR で 0 と
    //   確定しているのに value:null・ndgrValue:0 で「空」と誤表示=既知0と未取得の State Conflation)。
    //   Number(x)||… は 0 を falsy で握り潰すため、厳密一致で 0 を別途拾う(null/undefined は除外)。
    const knownZero = lane.value === 0 || lane.ndgrValue === 0;
    /** @type {string} */
    let mark;
    if (state === 'no_event' || state === 'no_program_gift' || state === 'no_ranking_data') {
      continue; // この配信にイベント/ギフト/ランキングが無い=出なくて正常。ノイズにしない(v0.1.851)。
    } else if (state === 'iframe_unrendered' || state === 'loading') {
      mark = '⏳取得中';
    } else if (state === 'ok' && n > 0) {
      mark = `✅${n}`;
    } else if (state === 'ok' && knownZero) {
      mark = '✅0'; // 取得できていて中身が 0(例: まだギフト 0pt)。未取得ではないので「空」と書かない。
    } else if (state === 'ok') {
      mark = '空'; // 取得経路は生きているが中身が空(まだ来ていない=値が null)。
    } else if (state) {
      mark = `⚠${state}`; // 想定外 state はそのまま出して気づけるように。
    } else {
      continue;
    }
    parts.push(`${label}:${mark}`);
  }
  if (!parts.length) return '';
  return `公式値レーン: ${parts.join(' / ')}`;
}

/**
 * 経過秒を `h:mm:ss` / `m:ss` に整形する。
 * @param {number|null|undefined} sec
 * @returns {string} 不正値は '?'
 */
export function formatElapsed(sec) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '?';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 経過ミリ秒を「N秒/N分/N時間」に整形する。
 * @param {number|null|undefined} ms
 * @returns {string} 不正値は '?'
 */
export function formatAgo(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '?';
  if (ms < 60_000) return `${Math.round(ms / 1000)}秒`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}分`;
  return `${Math.round(ms / 3_600_000)}時間`;
}
