/**
 * Popup DevTools 用: lane pipeline の観測スナップショット（PII を含めない）。
 * @module userLaneDiagSnapshot
 */

/**
 * lvId の表記ゆれ（lv 接頭辞・大文字小文字）を揃える（userLaneCandidatesFromStorage と同じ定義）。
 * @param {unknown} v
 * @returns {string}
 */
export function normalizeLv(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  return s.startsWith('lv') ? s : `lv${s}`;
}

/** @param {unknown} row */
function rowLiveIdRaw(row) {
  const o = /** @type {{ liveId?: unknown, lvId?: unknown }} */ (row);
  return String(o?.liveId ?? o?.lvId ?? '').trim();
}

/** @param {unknown} row */
function sanitizeStorageRowSample(row) {
  const o = /** @type {{ liveId?: unknown, lvId?: unknown, userId?: unknown, avatarUrl?: unknown, avatarObserved?: unknown, capturedAt?: unknown }} */ (
    row
  );
  return {
    liveIdNorm: normalizeLv(o?.liveId),
    lvIdNorm: normalizeLv(o?.lvId),
    hasUserId: Boolean(String(o?.userId ?? '').trim()),
    avatarUrl: Boolean(o?.avatarUrl),
    avatarObserved: o?.avatarObserved === true,
    capturedAt: Number.isFinite(Number(o?.capturedAt)) ? Number(o?.capturedAt) : 0
  };
}

/** @param {unknown} row */
function sanitizeAggregateSample(row) {
  const o = /** @type {{ userId?: unknown, nickname?: unknown, avatarUrl?: unknown, avatarObserved?: unknown, liveId?: unknown }} */ (
    row
  );
  return {
    hasUserId: Boolean(String(o?.userId ?? '').trim()),
    hasNickname: Boolean(String(o?.nickname ?? '').trim()),
    avatarUrl: Boolean(o?.avatarUrl),
    avatarObserved: o?.avatarObserved === true,
    liveIdNorm: normalizeLv(o?.liveId)
  };
}

/** @param {unknown} row */
function sanitizeEntrySample(row) {
  const o = /** @type {{ liveId?: unknown, lvId?: unknown, userId?: unknown, avatarUrl?: unknown, avatarObserved?: unknown }} */ (
    row
  );
  return {
    liveIdNorm: normalizeLv(o?.liveId),
    lvIdNorm: normalizeLv(o?.lvId),
    hasUserId: Boolean(String(o?.userId ?? '').trim()),
    avatarUrl: Boolean(o?.avatarUrl),
    avatarObserved: o?.avatarObserved === true
  };
}

/**
 * @param {{
 *   liveId?: unknown,
 *   storageRowsForCurrentLive?: unknown,
 *   laneAggregates?: unknown,
 *   entries?: unknown
 * }} state
 */
export function buildUserLaneDiagSnapshot(state) {
  const empty = () => ({
    meta: { liveId: '', timestamp: '' },
    counts: {
      storageRows: 0,
      entries: 0,
      laneAggregates: 0,
      observedUsers: 0
    },
    liveIdCheck: { sampleRowLiveIds: /** @type {string[]} */ ([]) },
    samples: {
      storageRows: /** @type {ReturnType<typeof sanitizeStorageRowSample>[]} */ ([]),
      laneAggregates: /** @type {ReturnType<typeof sanitizeAggregateSample>[]} */ ([]),
      entries: /** @type {ReturnType<typeof sanitizeEntrySample>[]} */ ([])
    },
    invariants: {
      hasStorageRows: false,
      hasLaneAggregates: false,
      observedExists: false
    }
  });

  try {
    const liveId = String(state?.liveId ?? '').trim();
    const storageRows = Array.isArray(state?.storageRowsForCurrentLive)
      ? state.storageRowsForCurrentLive
      : [];
    const laneAggregates = Array.isArray(state?.laneAggregates) ? state.laneAggregates : [];
    const entries = Array.isArray(state?.entries) ? state.entries : [];

    const sampleRowLiveIds = storageRows.slice(0, 5).map((row) => rowLiveIdRaw(row));

    let observedUsers = 0;
    if (laneAggregates.length) {
      observedUsers = laneAggregates.filter((a) => {
        const o = /** @type {{ avatarObserved?: unknown }} */ (a);
        return o?.avatarObserved === true;
      }).length;
    } else {
      observedUsers = entries.filter((e) => {
        const o = /** @type {{ avatarObserved?: unknown }} */ (e);
        return o?.avatarObserved === true;
      }).length;
    }

    const hasStorageRows = storageRows.length > 0;
    const hasLaneAggregates = laneAggregates.length > 0;
    const observedExists =
      laneAggregates.some((a) => {
        const o = /** @type {{ avatarObserved?: unknown }} */ (a);
        return o?.avatarObserved === true;
      }) ||
      entries.some((e) => {
        const o = /** @type {{ avatarObserved?: unknown }} */ (e);
        return o?.avatarObserved === true;
      });

    return {
      meta: {
        liveId,
        timestamp: new Date().toISOString()
      },
      counts: {
        storageRows: storageRows.length,
        entries: entries.length,
        laneAggregates: laneAggregates.length,
        observedUsers
      },
      liveIdCheck: {
        sampleRowLiveIds
      },
      samples: {
        storageRows: storageRows.slice(0, 5).map((r) => sanitizeStorageRowSample(r)),
        laneAggregates: laneAggregates.slice(0, 5).map((r) => sanitizeAggregateSample(r)),
        entries: entries.slice(0, 5).map((r) => sanitizeEntrySample(r))
      },
      invariants: {
        hasStorageRows,
        hasLaneAggregates,
        observedExists
      }
    };
  } catch {
    return empty();
  }
}
