/**
 * ニコ生「企画イベント参加番組一覧」公式 JSON API の URL 組立 & 正規化（純関数）。
 *
 * 背景・経緯（第2弾「同じイベントに参加している他の配信者」）:
 *   ギフトイベント参加中の watch 画面（プレイヤー左下「RANK」💎→「参加中のイベント」
 *   パネル）には、自分の順位サマリのほかに「このイベントに参加している他の配信者」が
 *   並ぶ。長らくその取得経路が未確定だったが、2026-05-25、実機 lv350605771（出前館×
 *   ニコニコ 5月の宅飯配信祭り・planningEventId=472）を Claude-in-Chrome で観測し、
 *   watch ページ本体が読込時に1回だけ叩く公式 JSON API を特定した:
 *
 *     GET https://api.live2.nicovideo.jp/api/v1/planning-event/participation-programs?planningEventId=<id>
 *
 *   - `planningEventId` は watch ページ `#embedded-data` の `data-props.planningEvent.id`
 *     から取得できる（スクレイプ不要）。`programAudition.isEnabled:true` がイベント
 *     参加中の判定。
 *   - **無認証で本文が取れる公式 API**（独立 WebFetch で 200 + JSON を確証。ただし
 *     ブラウザの content/MAIN world からの fetch は CORS で全て `Failed to fetch`＝
 *     本文を読めるのは拡張の service-worker[host_permissions 特権 fetch]のみ＝koken/
 *     nicoad と同じ制約。よって本モジュールは URL 組立 + 生 JSON 正規化だけを純粋に
 *     担い、fetch 自体は SW が行う）。
 *   - レスポンス（実機確認した正本スキーマ）:
 *       { meta:{ status:200, errorCode, totalCount },
 *         data:[ { programId,                         // "lv..."（その配信者の現番組）
 *                  program:{ title, provider, schedule:{ openTime,beginTime,endTime,status } },
 *                  statistics:{ viewers, comments },  // ★並べ替えに使える唯一の実数値
 *                  thumbnail:{ screenshot:{large,small}, listing:{xlarge,large,middle,flip} },
 *                  programProvider:{ name, programProviderId, icons:{uri150x150,uri50x50} } } ] }
 *
 *   ⚠️ **重要な設計判断**: この API は「イベント参加番組の名簿」であって
 *   **イベントスコア順位（rank/score/points 等）を一切持たない**（実機で確認・配列順も
 *   スコア順ではない）。よって「順位ランキング」として出すと誤値になる。本経路は
 *   "同じイベントに参加中の配信者" を、取得できる実数値（既定=視聴者数）の降順で
 *   並べて表示する用途に限る。スコア順位（プレイヤーパネルのゴリアテ1位…）は別ソース
 *   （richview iframe 内）にあり本経路ではカバーしない＝[[feedback_ndgr_field6_silence]]
 *   の精神どおり、持っていない順位を捏造しない。
 *
 *   正規化先は既存の `officialDomRankingRowsToStripRooms` が読む行形と互換にする
 *   （rank/name/contribution/isAnonymous/thumbnailUrl/userPageUrl）。これにより popup
 *   側は既存の strip 描画経路をそのまま流用でき、新規描画コードは不要。`contribution`
 *   フィールドには「並べ替え＆表示に使う実数値（既定=視聴者数）」を載せ、レーンの
 *   `unitSuffix` で「視聴」と明示する（貢献度ptとは別物であることを UI で区別）。
 *
 * 副作用なし、純関数（fetch も storage も触らない）。
 *
 * @see src/lib/officialDomRankingRowsToStripRooms.js - 行形の取り込み先（uid リンク経路）
 * @see src/lib/kokenContributionRankingApi.js / nicoadContributionRankingApi.js - 同型の手本
 * @see reference_event_participant_broadcaster_ranking_research - メモリ: API 特定の一次資料
 */

/**
 * content → service-worker の fetch 依頼メッセージ type。
 * service-worker（extension/background.js）は本定数を import できない（手書きの
 * build 成果物）ため、background 側は同じ文字列リテラルを直接使う（要・同期＝契約 test）。
 */
export const EVENT_PARTICIPATION_FETCH_MESSAGE_TYPE = 'NLS_EVENT_PARTICIPATION_FETCH';

/**
 * planningEventId（正の整数）の厳格パターン。任意 URL 注入 / SSRF 面を塞ぐ。
 * 数値文字列のみ（先頭ゼロや符号・小数は弾く）。
 */
const PLANNING_EVENT_ID_RE = /^[1-9]\d{0,17}$/;

/** 既定の取得件数。レーンは上位のみ表示するので 10。SW の URL 自作とは無関係
 *  （この API は limit パラメータを持たず全参加番組[totalCount]を返す＝正規化側で
 *  ソート後に slice する。本定数は normalize の既定 max として使う）。 */
export const EVENT_PARTICIPATION_DEFAULT_MAX = 10;

/**
 * 参加配信者一覧を置く chrome.storage.local キー。**視聴中の自分の liveId 単位**
 * （eventId ではなく liveId でキーする）。
 *
 * 理由: popup は watch ページの embedded-data を読めず planningEventId を知り得ない
 * （popup は別ページ）。一方 liveId は popup/content/prune すべてが持つ。よって koken/
 * nicoad と同じく liveId キーにすると、popup は手持ちの liveId だけで読めて discovery
 * 不要・prune も現 liveId 保護が効く。データは event-scoped（同じ値が参加者全員で同一）
 * だが、保存するのは「視聴者自身の lv」1 件分なので重複は実質ゼロ。
 *
 * content（書込）/ popup（読込）/ content の stale prune の 3 箇所が合意する必要が
 * あるため、ドリフト防止に単一の純関数へ集約する。
 *
 * @param {string} liveId 視聴中の自分の番組 lv
 * @returns {string}
 */
export function eventParticipationStorageKey(liveId) {
  return (
    'nls_event_participation_' +
    String(liveId == null ? '' : liveId).trim().toLowerCase()
  );
}

/** {@link eventParticipationStorageKey} の固定 prefix（prune 側の startsWith 判定用）。 */
export const EVENT_PARTICIPATION_STORAGE_PREFIX = 'nls_event_participation_';

/**
 * 参加番組一覧 API の URL を組み立てる。
 *
 * planningEventId は厳格に検証する（SW が任意文字列を fetch してしまわないよう、
 * 不正なら null を返して呼び出し側で握りつぶす）。
 *
 * @param {string|number} planningEventId 例 472
 * @returns {string|null} 不正 id なら null
 */
export function buildEventParticipationUrl(planningEventId) {
  const id = String(planningEventId == null ? '' : planningEventId).trim();
  if (!PLANNING_EVENT_ID_RE.test(id)) return null;
  return (
    'https://api.live2.nicovideo.jp/api/v1/planning-event/participation-programs?planningEventId=' +
    encodeURIComponent(id)
  );
}

/**
 * 生 JSON が参加番組一覧レスポンスの概形か（meta.status と data 配列）。
 *
 * @param {unknown} json
 * @returns {boolean}
 */
export function isLikelyEventParticipationShape(json) {
  if (!json || typeof json !== 'object') return false;
  const j = /** @type {Record<string, any>} */ (json);
  // meta.status は省略され得るが、在るなら 200 のみ受理
  if (j.meta && typeof j.meta === 'object' && j.meta.status != null) {
    if (Number(j.meta.status) !== 200) return false;
  }
  // koken/nicoad と違い、配列は data 直下（data:[...]）。
  return Array.isArray(j.data);
}

/**
 * http(s) URL だけ通す（サムネ/アバター）。それ以外は空に倒す。
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeHttpUrl(value) {
  const s = String(value == null ? '' : value).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/**
 * 参加番組行 1件から「配信者のサムネ（=配信者アイコン）」URL を選ぶ。
 * 配信者アイコン（programProvider.icons）を最優先。無ければ番組サムネにフォールバック。
 * @param {Record<string, any>} item
 * @returns {string}
 */
function pickProviderAvatarUrl(item) {
  const icons =
    item.programProvider && typeof item.programProvider === 'object'
      ? item.programProvider.icons
      : null;
  if (icons && typeof icons === 'object') {
    const a = sanitizeHttpUrl(icons.uri150x150) || sanitizeHttpUrl(icons.uri50x50);
    if (a) return a;
  }
  // フォールバック: 番組サムネ（listing→screenshot の順で大きめを拾う）
  const t = item.thumbnail && typeof item.thumbnail === 'object' ? item.thumbnail : null;
  if (t) {
    const listing = t.listing && typeof t.listing === 'object' ? t.listing : {};
    const shot = t.screenshot && typeof t.screenshot === 'object' ? t.screenshot : {};
    const cand =
      sanitizeHttpUrl(listing.large) ||
      sanitizeHttpUrl(listing.middle) ||
      sanitizeHttpUrl(shot.large) ||
      sanitizeHttpUrl(shot.small);
    if (cand) return cand;
  }
  return '';
}

/**
 * 参加番組行 1件から「並べ替え＆表示に使う実数値」を取り出す。
 * metric='viewers'（既定）→ statistics.viewers / 'comments' → statistics.comments。
 * @param {Record<string, any>} item
 * @param {'viewers'|'comments'} metric
 * @returns {number} 0 以上の整数
 */
function pickMetric(item, metric) {
  const stats = item.statistics && typeof item.statistics === 'object' ? item.statistics : {};
  const raw = metric === 'comments' ? stats.comments : stats.viewers;
  let n = Number(raw);
  if (!Number.isFinite(n) || n < 0) n = 0;
  return Math.trunc(n);
}

/**
 * 参加番組行が「現在放送中（ON_AIR）」か。schedule.status を見る。
 * @param {Record<string, any>} item
 * @returns {boolean}
 */
function isOnAir(item) {
  const prog = item.program && typeof item.program === 'object' ? item.program : {};
  const sch = prog.schedule && typeof prog.schedule === 'object' ? prog.schedule : {};
  return String(sch.status == null ? '' : sch.status).trim().toUpperCase() === 'ON_AIR';
}

/**
 * 参加番組一覧 API の生 JSON を、既存 popup 描画が読む行（officialDomRankingRowsToStripRooms
 * 互換）に正規化する。
 *
 * 設計上の安全条件（koken/nicoad と同じ規約 + 本経路固有）:
 *   - meta.status!==200 / data 非配列 → null（呼び出し側は「rows>0 のときだけ既存
 *     storage を上書き」するので、null/空は既存値を保全＝fail-soft）。
 *   - 1 件も組み立てられなければ null（空配列でなく null）。
 *   - **順位は API に無い**ので、取得できる実数値（既定=視聴者数）の降順に並べ、
 *     rank には並べ替え後の 1-index を入れる（=「視聴者数が多い順」であって
 *     イベントスコア順位ではない。UI 側で「参加中の配信者（視聴者数順）」と明示）。
 *   - 同値は元の配列順で安定（Array.prototype.sort は V8 で安定）。
 *   - 記名（programProviderId が正の整数 user）行のみ userPageUrl を付け、既存の
 *     uid リンク経路を発火させる。channel/community 等の非数値 provider はリンク
 *     を付けない＝誤リンク不能（誤リンクより false negative）。
 *   - 自分の番組（selfProgramId）は除外できる（自分を「他の配信者」一覧に出さない）。
 *   - onAirOnly=true なら放送終了済みを除外（既定 false＝終了番組も名簿に含める）。
 *
 * @param {unknown} json 参加番組一覧 API レスポンスの生 JSON（SW が res.json() したもの）
 * @param {{ metric?: 'viewers'|'comments', max?: number, selfProgramId?: string, onAirOnly?: boolean }} [options]
 * @returns {Array<{rank:number, name:string, contribution:number, isAnonymous:boolean, programId:string, userPageUrl?:string, thumbnailUrl:string}>|null}
 */
export function normalizeEventParticipationResponse(json, options = {}) {
  if (!isLikelyEventParticipationShape(json)) return null;
  const data = /** @type {any[]} */ (/** @type {Record<string, any>} */ (json).data);

  const metric = options.metric === 'comments' ? 'comments' : 'viewers';
  let max = Number.isFinite(Number(options.max)) ? Number(options.max) : EVENT_PARTICIPATION_DEFAULT_MAX;
  max = Math.trunc(max);
  if (max < 1) max = 1;
  if (max > 100) max = 100;
  const selfProgramId = String(options.selfProgramId == null ? '' : options.selfProgramId)
    .trim()
    .toLowerCase();
  const onAirOnly = Boolean(options.onAirOnly);

  /** @type {Array<{name:string, count:number, programId:string, uid:string, thumbnailUrl:string, order:number}>} */
  const collected = [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!item || typeof item !== 'object') continue;

    if (onAirOnly && !isOnAir(item)) continue;

    const programId = String(item.programId == null ? '' : item.programId).trim().toLowerCase();
    // 自分の番組は「他の配信者」一覧から除外
    if (selfProgramId && programId && programId === selfProgramId) continue;

    const provider =
      item.programProvider && typeof item.programProvider === 'object' ? item.programProvider : {};
    const name = String(provider.name == null ? '' : provider.name).trim();
    if (!name) continue; // 名無しの配信者枠は出さない（壊れ行）

    const uidRaw = String(provider.programProviderId == null ? '' : provider.programProviderId).trim();
    const uid = /^[1-9]\d{0,17}$/.test(uidRaw) ? uidRaw : ''; // 正の整数 user のみリンク化

    collected.push({
      name,
      count: pickMetric(item, metric),
      programId,
      uid,
      thumbnailUrl: pickProviderAvatarUrl(item),
      order: i
    });
  }

  if (collected.length === 0) return null;

  // 実数値の降順（同値は元順で安定）。
  collected.sort((a, b) => (b.count - a.count) || (a.order - b.order));

  const rows = collected.slice(0, max).map((c, idx) => {
    /** @type {{rank:number, name:string, contribution:number, isAnonymous:boolean, programId:string, userPageUrl?:string, thumbnailUrl:string}} */
    const row = {
      rank: idx + 1,
      name: c.name,
      contribution: c.count, // ★視聴者数（or コメント数）。UI で「視聴」等の単位を付ける
      isAnonymous: false, // 配信者は必ず提供者名を持つ＝匿名扱いしない
      programId: c.programId,
      thumbnailUrl: c.thumbnailUrl
    };
    if (c.uid) row.userPageUrl = `https://www.nicovideo.jp/user/${c.uid}`;
    return row;
  });

  return rows.length > 0 ? rows : null;
}
