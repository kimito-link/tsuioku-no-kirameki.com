/**
 * L3: コメ波形フィンガープリント。
 *
 * 設計（0.1.24 Y / ラテラル思考 L3）:
 *   配信のコメ密度カーブを N 次元（既定 16）の正規化ベクトルにする。
 *   別配信の指紋とコサイン類似度で比較すれば「形が似てる過去配信」が探せる。
 *
 *   "あの神回みたいな盛り上がり方をしている / してた" を発見できる UX 用。
 */

/**
 * @typedef {{ capturedAt?: any }} WaveformComment
 */

/**
 * @typedef {{ liveId: string, vector: number[], totalCount: number }} BroadcastFingerprint
 */

/**
 * @param {WaveformComment[]} comments
 * @param {{ dimensions?: number } | undefined} [opts]
 * @returns {{ vector: number[], totalCount: number } | null}
 */
export function buildBroadcastWaveformFingerprint(comments, opts = {}) {
  const dim =
    typeof opts?.dimensions === 'number' && opts.dimensions > 0
      ? Math.floor(opts.dimensions)
      : 16;
  const list = Array.isArray(comments) ? comments : [];
  /** @type {number[]} */
  const ats = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const at = c.capturedAt;
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
    ats.push(at);
  }
  if (!ats.length) return null;
  ats.sort((a, b) => a - b);
  const first = ats[0];
  const last = ats[ats.length - 1];
  const span = Math.max(1, last - first);
  /** @type {number[]} */
  const counts = new Array(dim).fill(0);
  for (const at of ats) {
    let idx = Math.floor(((at - first) / span) * dim);
    if (idx >= dim) idx = dim - 1;
    if (idx < 0) idx = 0;
    counts[idx] += 1;
  }
  const peak = counts.reduce((a, b) => Math.max(a, b), 0);
  const vector = counts.map((v) => (peak > 0 ? Math.round((v / peak) * 1000) / 1000 : 0));
  return { vector, totalCount: ats.length };
}

/**
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number|null}
 */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  if (a.length !== b.length || a.length === 0) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return null;
  return Math.round((dot / Math.sqrt(na * nb)) * 1000) / 1000;
}

/**
 * @param {BroadcastFingerprint | null | undefined} current
 * @param {BroadcastFingerprint[] | null | undefined} pastFingerprints
 * @param {{ topN?: number } | undefined} [opts]
 * @returns {{ liveId: string, similarity: number, totalCount: number }[]}
 */
export function findSimilarBroadcasts(current, pastFingerprints, opts = {}) {
  if (!current || !current.vector) return [];
  const past = Array.isArray(pastFingerprints) ? pastFingerprints : [];
  const topN =
    typeof opts?.topN === 'number' && opts.topN > 0 ? Math.floor(opts.topN) : 5;
  /** @type {{ liveId: string, similarity: number, totalCount: number }[]} */
  const out = [];
  for (const p of past) {
    if (!p || typeof p !== 'object') continue;
    if (p.liveId === current.liveId) continue;
    const sim = cosineSimilarity(current.vector, p.vector);
    if (sim == null) continue;
    out.push({
      liveId: String(p.liveId || ''),
      similarity: sim,
      totalCount: typeof p.totalCount === 'number' ? p.totalCount : 0
    });
  }
  out.sort((a, b) => b.similarity - a.similarity);
  return out.slice(0, topN);
}
