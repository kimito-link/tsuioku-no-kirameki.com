/**
 * マーケ分析 HTML 用: 「誰が・どのアイテムを・いくら投げたか」の投げ履歴台帳を組み立てる純関数。
 *
 * 入力は公式ギフト履歴（DOM / sub-app）、NDGR 個別イベントを想定。
 * 重複キー（時刻・送り主・アイテム・pt）でマージし、優先度は sub-app > 公式 DOM > NDGR。
 */

/** 台帳テーブルに載せる最大行数（HTML 肥大化防止） */
export const MARKETING_GIFT_LEDGER_MAX_ROWS = 200;

/**
 * @typedef {{
 *   timeLabel: string,
 *   sortKey: number,
 *   senderLabel: string,
 *   userId: string,
 *   itemName: string,
 *   points: number,
 *   thumbnailUrl: string,
 *   senderAvatarUrl: string,
 *   source: string,
 *   dedupeKey: string
 * }} MarketingGiftThrowLedgerRow
 */

/**
 * @typedef {{
 *   itemName: string,
 *   count: number,
 *   points: number,
 *   thumbnailUrl: string
 * }} MarketingGiftItemAggregateRow
 */

/**
 * @typedef {{
 *   senderKey: string,
 *   senderLabel: string,
 *   userId: string,
 *   senderAvatarUrl: string,
 *   throwCount: number,
 *   totalPoints: number,
 *   items: MarketingGiftSenderItemRow[]
 * }} MarketingGiftSenderAggregateRow
 */

/**
 * @typedef {{
 *   itemName: string,
 *   throwCount: number,
 *   totalPoints: number,
 *   thumbnailUrl: string
 * }} MarketingGiftSenderItemRow
 */

/**
 * @typedef {{
 *   label: string,
 *   value: number,
 *   sublabel?: string,
 *   thumbnailUrl?: string
 * }} MarketingGiftLedgerChartRow
 */

/** マーケ HTML: 取得済みのサムネ・ID・アカウント・アイテム名は省略しない（表示ルールの正本） */
export const MARKETING_GIFT_LEDGER_DISPLAY_RULE_NOTE =
  '取得できたサムネ・送り主（アカウント/ID）・アイテム名・pt は必ず表示します。未取得のみ「—」またはプレースホルダです。';

/**
 * @typedef {{
 *   rows: MarketingGiftThrowLedgerRow[],
 *   itemAggregates: MarketingGiftItemAggregateRow[],
 *   senderAggregates: MarketingGiftSenderAggregateRow[],
 *   senderChart: MarketingGiftLedgerChartRow[],
 *   itemChart: MarketingGiftLedgerChartRow[],
 *   totalThrows: number,
 *   totalPoints: number,
 *   uniqueSenders: number,
 *   truncated: boolean,
 *   sourceNotes: string[]
 * }} MarketingGiftThrowLedger
 */

/** 送り主別テーブル・グラフの最大行数 */
export const MARKETING_GIFT_LEDGER_MAX_SENDERS = 20;

/**
 * @param {MarketingGiftThrowLedgerRow} row
 * @returns {string}
 */
export function giftLedgerSenderKey(row) {
  const uid = String(row.userId || '').trim();
  if (/^\d{1,18}$/.test(uid)) return `uid:${uid}`;
  const name = String(row.senderLabel || '').trim() || '（不明）';
  return `name:${name}`;
}

/**
 * @param {readonly MarketingGiftThrowLedgerRow[]} rows
 * @param {{ maxSenders?: number, maxItemsPerSender?: number }} [opts]
 * @returns {MarketingGiftSenderAggregateRow[]}
 */
export function buildGiftLedgerSenderAggregates(rows, opts = {}) {
  const maxSenders =
    typeof opts.maxSenders === 'number' && opts.maxSenders > 0
      ? Math.trunc(opts.maxSenders)
      : MARKETING_GIFT_LEDGER_MAX_SENDERS;
  const maxItems =
    typeof opts.maxItemsPerSender === 'number' && opts.maxItemsPerSender > 0
      ? Math.trunc(opts.maxItemsPerSender)
      : 6;

  /** @type {Map<string, MarketingGiftSenderAggregateRow & { _items: Map<string, MarketingGiftSenderItemRow> }>} */
  const map = new Map();

  for (const row of rows) {
    if (!row || !row.points) continue;
    const key = giftLedgerSenderKey(row);
    let agg = map.get(key);
    if (!agg) {
      agg = {
        senderKey: key,
        senderLabel: String(row.senderLabel || '').trim() || '（不明）',
        userId: String(row.userId || '').trim(),
        senderAvatarUrl: String(row.senderAvatarUrl || '').trim(),
        throwCount: 0,
        totalPoints: 0,
        items: [],
        _items: new Map()
      };
      map.set(key, agg);
    }
    const rowUid = String(row.userId || '').trim();
    if (rowUid && /^\d{1,18}$/.test(rowUid)) {
      agg.userId = rowUid;
    }
    const rowAv = String(row.senderAvatarUrl || '').trim();
    if (rowAv && !agg.senderAvatarUrl) agg.senderAvatarUrl = rowAv;
    agg.throwCount += 1;
    agg.totalPoints += row.points;
    const itemKey = String(row.itemName || '（名称未取得）').trim();
    const cur = agg._items.get(itemKey) || {
      itemName: itemKey,
      throwCount: 0,
      totalPoints: 0,
      thumbnailUrl: ''
    };
    cur.throwCount += 1;
    cur.totalPoints += row.points;
    const itemThumb = String(row.thumbnailUrl || '').trim();
    if (itemThumb && !cur.thumbnailUrl) cur.thumbnailUrl = itemThumb;
    agg._items.set(itemKey, cur);
  }

  const out = [...map.values()].map((agg) => {
    const items = [...agg._items.values()]
      .sort(
        (a, b) =>
          b.totalPoints - a.totalPoints ||
          b.throwCount - a.throwCount ||
          a.itemName.localeCompare(b.itemName, 'ja')
      )
      .slice(0, maxItems);
    const rest = { ...agg };
    delete rest._items;
    return { ...rest, items };
  });

  return out
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.throwCount - a.throwCount ||
        a.senderLabel.localeCompare(b.senderLabel, 'ja')
    )
    .slice(0, maxSenders);
}

/**
 * @param {readonly { label: string, value: number, sublabel?: string, thumbnailUrl?: string }[]} rows
 * @param {{ max?: number }} [opts]
 * @returns {MarketingGiftLedgerChartRow[]}
 */
export function buildGiftLedgerChartSeries(rows, opts = {}) {
  const max = typeof opts.max === 'number' && opts.max > 0 ? Math.trunc(opts.max) : 12;
  return rows
    .filter((r) => r && Number.isFinite(r.value) && r.value > 0)
    .slice(0, max)
    .map((r) => ({
      label: String(r.label || '').trim(),
      value: Math.trunc(r.value),
      sublabel: r.sublabel ? String(r.sublabel) : undefined,
      thumbnailUrl: r.thumbnailUrl ? String(r.thumbnailUrl) : undefined
    }));
}

/**
 * @param {unknown} v
 * @returns {number}
 */
function positivePoints(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

/**
 * 配信内オフセット時刻（2:45:10 等）をソート用秒数に変換。パース不能は 0。
 *
 * @param {string} timeLabel
 * @returns {number}
 */
export function parseGiftStreamTimeSortKey(timeLabel) {
  const s = String(timeLabel || '').trim();
  if (!s) return 0;
  const parts = s.split(':').map((p) => parseInt(String(p).replace(/[^\d]/g, ''), 10));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

/**
 * @param {string} sender
 * @param {string} item
 * @param {number} points
 * @param {string} timeLabel
 */
function ledgerDedupeKey(sender, item, points, timeLabel) {
  return `${String(timeLabel).trim()}\t${String(sender).trim()}\t${String(item).trim()}\t${points}`;
}

/**
 * アイテム別集計: 回数は totalCounts（公式種類別）を正とし、pt は history 行の合算。
 * totalCounts と history の両方で count を加算しない（水増し防止）。
 *
 * @param {readonly MarketingGiftThrowLedgerRow[]} allRows
 * @param {readonly unknown[]} totalCounts
 * @returns {MarketingGiftItemAggregateRow[]}
 */
export function buildGiftLedgerItemAggregates(allRows, totalCounts) {
  /** @type {Map<string, number>} */
  const officialCountByKey = new Map();
  /** @type {Map<string, MarketingGiftItemAggregateRow & { rowCount: number }>} */
  const itemMap = new Map();

  for (const raw of totalCounts) {
    const r = /** @type {Record<string, unknown>} */ (raw || {});
    const name = String(r.itemName || '').trim();
    const count = positivePoints(r.count);
    if (!name || !count) continue;
    const key = name.toLowerCase();
    officialCountByKey.set(key, count);
    itemMap.set(key, {
      itemName: name,
      count: 0,
      points: 0,
      thumbnailUrl: String(r.thumbnailUrl || '').trim(),
      rowCount: 0
    });
  }

  for (const row of allRows) {
    if (!row || !row.points) continue;
    const key = String(row.itemName || '').trim().toLowerCase();
    if (!key) continue;
    let cur = itemMap.get(key);
    if (!cur) {
      cur = {
        itemName: row.itemName,
        count: 0,
        points: 0,
        thumbnailUrl: '',
        rowCount: 0
      };
      itemMap.set(key, cur);
    }
    cur.rowCount += 1;
    cur.points += row.points;
    if (!cur.thumbnailUrl && row.thumbnailUrl) cur.thumbnailUrl = row.thumbnailUrl;
  }

  return [...itemMap.values()]
    .map(({ rowCount, ...rest }) => {
      const key = rest.itemName.toLowerCase();
      const official = officialCountByKey.get(key);
      return {
        itemName: rest.itemName,
        count: official != null && official > 0 ? official : rowCount,
        points: rest.points,
        thumbnailUrl: rest.thumbnailUrl
      };
    })
    .sort(
      (a, b) =>
        b.count - a.count || b.points - a.points || a.itemName.localeCompare(b.itemName, 'ja')
    )
    .slice(0, 24);
}

/**
 * 公式個別履歴（koken / sub-app）がある配信では NDGR 行は重複・欠損が多いため省略する。
 * @param {readonly MarketingGiftThrowLedgerRow[]} rows
 * @param {MarketingGiftThrowLedgerRow} candidate
 */
function isNdgrLedgerDuplicateOfOfficial(candidate, rows) {
  const uid = String(candidate.userId || '').trim();
  const pts = candidate.points;
  if (!uid || !pts) return false;
  const item = String(candidate.itemName || '').trim();
  const unnamed = !item || item === '（名称未取得）';
  for (const ex of rows) {
    if (!ex.source.includes('公式') && !ex.source.includes('koken')) continue;
    if (String(ex.userId || '').trim() !== uid || ex.points !== pts) continue;
    const exItem = String(ex.itemName || '').trim();
    if (unnamed || !exItem || exItem === item) return true;
  }
  return false;
}

/**
 * @param {Map<string, MarketingGiftThrowLedgerRow & { _priority?: number }>} map
 * @param {MarketingGiftThrowLedgerRow} row
 * @param {number} priority 大きいほど優先（上書き）
 */
function upsertLedgerRow(map, row, priority) {
  const key = row.dedupeKey;
  const prev = map.get(key);
  if (!prev || priority > (prev._priority || 0)) {
    map.set(key, { ...row, _priority: priority });
  }
}

/**
 * @param {{
 *   giftSubAppHistory?: { history?: readonly unknown[], totalCounts?: readonly unknown[], source?: string } | null,
 *   officialGiftHistory?: readonly unknown[],
 *   giftEvents?: readonly unknown[]
 * }} input
 * @param {{ maxRows?: number }} [opts]
 * @returns {MarketingGiftThrowLedger}
 */
export function buildMarketingGiftThrowLedger(input, opts = {}) {
  const maxRows =
    typeof opts.maxRows === 'number' && opts.maxRows > 0
      ? Math.trunc(opts.maxRows)
      : MARKETING_GIFT_LEDGER_MAX_ROWS;

  /** @type {Map<string, MarketingGiftThrowLedgerRow & { _priority?: number }>} */
  const map = new Map();
  /** @type {string[]} */
  const sourceNotes = [];

  const subHistory = Array.isArray(input?.giftSubAppHistory?.history)
    ? input.giftSubAppHistory.history
    : [];
  const subSource = String(input?.giftSubAppHistory?.source || '').trim();
  if (subHistory.length) {
    const label =
      subSource === 'koken-api'
        ? 'koken 公式 API'
        : subSource === 'merged'
          ? '公式履歴（DOM + koken API）'
          : 'ギフト sub-app / DOM';
    sourceNotes.push(`${label} ${subHistory.length} 件`);
    for (const raw of subHistory) {
      const r = /** @type {Record<string, unknown>} */ (raw || {});
      const senderLabel = String(r.senderName || '').trim();
      const itemName = String(r.itemName || '').trim();
      const points = positivePoints(r.points);
      const timeLabel = String(r.time || '').trim();
      if (!senderLabel || !points) continue;
      const userId = String(r.userId || '').trim();
      const rowSource =
        subSource === 'koken-api'
          ? '公式履歴（koken API・一括）'
          : subSource === 'merged'
            ? '公式履歴'
            : '公式履歴（sub-app）';
      const kokenId = String(r.kokenHistoryId || '').trim();
      const row = {
        timeLabel: timeLabel || '—',
        sortKey:
          Number.isFinite(Number(r.sortKey)) && Number(r.sortKey) > 0
            ? Number(r.sortKey)
            : parseGiftStreamTimeSortKey(timeLabel),
        senderLabel,
        userId,
        itemName: itemName || '（名称未取得）',
        points,
        thumbnailUrl: String(r.thumbnailUrl || '').trim(),
        senderAvatarUrl: String(r.senderAvatarUrl || '').trim(),
        source: rowSource,
        dedupeKey: kokenId
          ? `koken:${kokenId}`
          : ledgerDedupeKey(senderLabel, itemName, points, timeLabel)
      };
      upsertLedgerRow(map, row, subSource === 'koken-api' ? 28 : 30);
    }
  }

  const official = Array.isArray(input?.officialGiftHistory) ? input.officialGiftHistory : [];
  if (official.length) {
    sourceNotes.push(`公式 DOM ギフト履歴 ${official.length} 件`);
    for (const raw of official) {
      const r = /** @type {Record<string, unknown>} */ (raw || {});
      const senderLabel = String(r.advertiserName || r.nickname || '').trim();
      const itemName = String(r.giftName || r.itemName || '').trim();
      const points = positivePoints(r.point ?? r.points);
      const timeLabel = String(r.time || '').trim();
      if (!senderLabel || !points) continue;
      const row = {
        timeLabel: timeLabel || '—',
        sortKey: parseGiftStreamTimeSortKey(timeLabel),
        senderLabel,
        userId: '',
        itemName: itemName || '（名称未取得）',
        points,
        thumbnailUrl: String(r.thumbnailUrl || '').trim(),
        senderAvatarUrl: '',
        source: '公式履歴（DOM）',
        dedupeKey: ledgerDedupeKey(senderLabel, itemName, points, timeLabel)
      };
      upsertLedgerRow(map, row, 20);
    }
  }

  /** @type {MarketingGiftThrowLedgerRow[]} */
  const officialRowsSoFar = [...map.values()].map(({ _priority, ...rest }) => rest);
  const skipNdgrLedger = subHistory.length > 0;

  const events = Array.isArray(input?.giftEvents) ? input.giftEvents : [];
  if (events.length) {
    if (skipNdgrLedger) {
      sourceNotes.push(`NDGR 個別ギフト ${events.length} 件（公式履歴と重複のため台帳では省略）`);
    } else {
      sourceNotes.push(`NDGR 個別ギフト ${events.length} 件`);
    }
    for (const raw of events) {
      if (skipNdgrLedger) continue;
      const r = /** @type {Record<string, unknown>} */ (raw || {});
      const userId = String(r.userId || '').trim();
      const senderLabel = String(r.nickname || r.senderName || userId || '').trim();
      const itemName = String(r.itemName || r.giftName || '').trim();
      const points = positivePoints(r.point ?? r.points);
      const capturedAt = Number(r.capturedAt);
      const timeLabel =
        Number.isFinite(capturedAt) && capturedAt > 0
          ? new Date(capturedAt).toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })
          : '—';
      if (!senderLabel || !points) continue;
      const row = {
        timeLabel,
        sortKey: Number.isFinite(capturedAt) && capturedAt > 0 ? capturedAt : 0,
        senderLabel,
        userId,
        itemName: itemName || '（名称未取得）',
        points,
        thumbnailUrl: String(r.thumbnailUrl || '').trim(),
        senderAvatarUrl: '',
        source: 'NDGR 受信',
        dedupeKey: ledgerDedupeKey(senderLabel, itemName || '', points, `${timeLabel}\t${userId}`)
      };
      if (isNdgrLedgerDuplicateOfOfficial(row, officialRowsSoFar)) continue;
      upsertLedgerRow(map, row, 10);
    }
  }

  /** @type {MarketingGiftThrowLedgerRow[]} */
  const allRows = [...map.values()].map(({ _priority, ...rest }) => rest);
  allRows.sort((a, b) => {
    if (b.sortKey !== a.sortKey) return b.sortKey - a.sortKey;
    if (b.points !== a.points) return b.points - a.points;
    return a.senderLabel.localeCompare(b.senderLabel, 'ja');
  });
  const truncated = allRows.length > maxRows;
  const displayRows = truncated ? allRows.slice(0, maxRows) : allRows;

  const itemAggregates = buildGiftLedgerItemAggregates(
    allRows,
    Array.isArray(input?.giftSubAppHistory?.totalCounts)
      ? input.giftSubAppHistory.totalCounts
      : []
  );

  const senderAggregates = buildGiftLedgerSenderAggregates(allRows);
  const senderChart = buildGiftLedgerChartSeries(
    senderAggregates.map((s) => ({
      label: s.senderLabel,
      value: s.totalPoints,
      sublabel: `${s.throwCount}投`
    })),
    { max: 12 }
  );
  const itemChart = buildGiftLedgerChartSeries(
    itemAggregates.map((it) => ({
      label: it.itemName,
      value: it.points,
      sublabel: `×${it.count}`,
      thumbnailUrl: it.thumbnailUrl
    })),
    { max: 12 }
  );

  if (!sourceNotes.length) {
    sourceNotes.push(
      'ギフト履歴未取得（マーケ DL 時に koken API で一括取得を試みます。配信ページを開いた状態で再 DL してください）'
    );
  }

  return {
    rows: displayRows,
    itemAggregates,
    senderAggregates,
    senderChart,
    itemChart,
    totalThrows: allRows.length,
    totalPoints: allRows.reduce((sum, r) => sum + r.points, 0),
    uniqueSenders: senderAggregates.length,
    truncated,
    sourceNotes
  };
}
