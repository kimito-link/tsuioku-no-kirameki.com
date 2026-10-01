/**
 * /api/live-platforms — /live/ の「ほかの配信サービス」セクション(Kick・後で YouTube)のデータ。
 *
 * ■ 2026-10-01 新設(設計 docs/handoff/live-multiplatform-kick-youtube-SPEC.md §4.5)
 *   ★ニコ生(api/live-ranking.js)とは【別関数・別キー】。片方が落ちてももう片方は出る。
 *     api/live-ranking.js の handler・collect() には触らない(既存の分岐を増やさない)。
 *
 * ■ 経路
 *   GET                       閲覧者。保存済みを読むだけ。★常に 200(状態は platforms.<name>.ok/error で表す)
 *   GET ?refresh=1&platform=kick   収集。★x-share-key 必須(GitHub Actions の kick ジョブだけが叩く)。
 *                             レート制限が未確認なので、閲覧者の操作で Kick へは問い合わせない。
 *   POST ?ingest=off          キルスイッチ(x-share-key 必須)。body { platform, off }。再デプロイなしで止まる。
 *
 * ■ Actions の赤の意味(ニコ生と違うので混同しない)
 *   0 件 = 緑(保存する) / 形不正・通信失敗・token 失敗 = 赤(保存しない) / 停止中 = 緑 / 鍵なし = 赤(503)
 *
 * ■ ★token・client_secret はレスポンス・ログ・例外文に出さない。
 */
import { upstash, TTL_SECONDS, readBody } from './live-ranking.js';
import { fetchKickAppToken, fetchKickLivestreams } from '../src/server/kickApi.js';
import {
  normalizeKickLivestreams, sortByViewers, decideKickStore, isTruncated,
  KICK_MAX_LIVES, KICK_PAGE_LIMIT, KICK_LANGUAGE_CODE
} from '../src/lib/kickLivestreams.js';

export const KICK_STORE_KEY = 'live:kick:latest';
export const KICK_TOKEN_KEY = 'live:kick:token';
export const KICK_REFRESH_LOCK_KEY = 'live:kick:refresh-lock';
export const PLATFORMS_OFF_KEY = 'live:platforms:off';
/** 予約(YouTube は後続。search 候補と表示用を別キーにする 2 段構え)。 */
export const YOUTUBE_STORE_KEY = 'live:youtube:latest';
export const YOUTUBE_SEARCH_KEY = 'live:youtube:search';

/** 既存 REFRESH_LOCK_TTL_SECONDS(30)と同値。 */
const REFRESH_LOCK_TTL_SECONDS = 30;
const PLATFORMS = /** @type {const} */ (['kick', 'youtube']);

/** @param {any} req */
function trustedKey(req) {
  const want = process.env.STATUS_INGEST_KEY;
  const sent = String((req.headers && req.headers['x-share-key']) || '');
  return !!want && sent === want;
}

/** @returns {Promise<Record<string, boolean>>} */
async function readOff() {
  try {
    const raw = await upstash(['GET', PLATFORMS_OFF_KEY]);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** token の保存時間。expires_in の 60 秒前に切らす。読めなければ保存しない(0)。上限は既存の 1 時間。 */
function tokenTtlSeconds(expiresIn) {
  const e = Number(expiresIn) || 0;
  if (e <= 0) return 0;
  return Math.min(TTL_SECONDS, Math.max(60, Math.floor(e - 60)));
}

/** @param {{ fetchImpl?: typeof fetch }} deps */
async function getKickToken(deps, { fresh = false } = {}) {
  if (!fresh) {
    try {
      const cached = await upstash(['GET', KICK_TOKEN_KEY]);
      if (cached) return { ok: true, token: String(cached) };
    } catch { /* キャッシュが読めなくても取り直せばよい */ }
  }
  const t = await fetchKickAppToken({
    clientId: process.env.KICK_CLIENT_ID || '',
    clientSecret: process.env.KICK_CLIENT_SECRET || '',
    fetchImpl: deps.fetchImpl
  });
  if (!t.ok) return { ok: false, status: t.status };
  const ttl = tokenTtlSeconds(t.expiresIn);
  if (ttl > 0) {
    try { await upstash(['SET', KICK_TOKEN_KEY, t.token, 'EX', String(ttl)]); } catch { /* 次回また取る */ }
  }
  return { ok: true, token: t.token, expiresIn: t.expiresIn };
}

/**
 * Kick の一覧を集めて保存用の形にする。★保存はしない(handler が decideKickStore で決める)。
 * export はローカル検証用(api/live-ranking.js の collect() と同じ流儀)。
 * @param {{ fetchImpl?: typeof fetch, now?: number }} [deps]
 */
export async function collectKick(deps = {}) {
  const tok = await getKickToken(deps);
  if (!tok.ok) return { ok: false, error: 'kick token failed', status: tok.status, lives: null };
  let r = await fetchKickLivestreams({ token: tok.token, fetchImpl: deps.fetchImpl });
  let tokenExpiresIn = tok.expiresIn;
  if (r.status === 401) {
    // token が失効/無効化された。キャッシュを捨てて 1 回だけ取り直す。
    try { await upstash(['DEL', KICK_TOKEN_KEY]); } catch { /* noop */ }
    const again = await getKickToken(deps, { fresh: true });
    if (!again.ok) return { ok: false, error: 'kick token failed', status: again.status, lives: null };
    tokenExpiresIn = again.expiresIn;
    r = await fetchKickLivestreams({ token: again.token, fetchImpl: deps.fetchImpl });
  }
  if (!r.ok) return { ok: false, error: 'kick api failed', status: r.status, headersSample: r.headersSample, lives: null };
  const all = normalizeKickLivestreams(r.json);
  if (!all) return { ok: true, error: 'kick shape invalid', status: r.status, headersSample: r.headersSample, lives: null };
  const sorted = sortByViewers(all);
  const kept = sorted.slice(0, KICK_MAX_LIVES);
  return {
    ok: true,
    status: r.status,
    headersSample: r.headersSample,
    tokenExpiresIn,
    stored: {
      ok: true,
      platform: 'kick',
      capturedAt: deps.now || Date.now(),
      count: all.length,
      shown: kept.length,
      truncated: isTruncated(r.json, KICK_PAGE_LIMIT),
      matureCount: all.filter((l) => l.mature).length,
      language: KICK_LANGUAGE_CODE,
      source: 'kick-public-api-v2',
      lives: kept
    },
    lives: kept
  };
}

/** 閲覧者向けの 1 プラットフォーム分。★lives は常に配列。 */
async function readKickSection(off) {
  if (off.kick) return { ok: false, platform: 'kick', error: 'disabled', disabled: true, lives: [] };
  if (!process.env.KICK_CLIENT_ID || !process.env.KICK_CLIENT_SECRET) {
    return { ok: false, platform: 'kick', error: 'no credentials', lives: [] };
  }
  let raw = null;
  try { raw = await upstash(['GET', KICK_STORE_KEY]); } catch { raw = null; }
  if (!raw) return { ok: false, platform: 'kick', error: 'not collected yet', lives: [] };
  try {
    const v = JSON.parse(raw);
    if (!v || !Array.isArray(v.lives)) throw new Error('bad');
    return v;
  } catch {
    return { ok: false, platform: 'kick', error: 'broken payload', lives: [] };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // ── キルスイッチ ──
    if (req.method === 'POST' && String(req.query?.ingest || '') === 'off') {
      if (!trustedKey(req)) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }
      const body = readBody(req);
      const platform = body && typeof body === 'object' ? String(body.platform || '') : '';
      if (!PLATFORMS.includes(/** @type {any} */ (platform)) || typeof body.off !== 'boolean') {
        res.status(400).json({ ok: false, error: 'bad body' });
        return;
      }
      const off = await readOff();
      off[platform] = body.off;
      await upstash(['SET', PLATFORMS_OFF_KEY, JSON.stringify(off)]);
      res.status(200).json({ ok: true, off });
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'method not allowed' });
      return;
    }

    // ── 収集(Actions の kick ジョブだけ) ──
    if (String(req.query?.refresh || '') === '1') {
      if (!trustedKey(req)) { res.status(403).json({ ok: false, error: 'refresh requires key' }); return; }
      const platform = String(req.query?.platform || '');
      if (platform !== 'kick') { res.status(400).json({ ok: false, error: 'unsupported platform' }); return; }
      const off = await readOff();
      if (off.kick) { res.status(200).json({ ok: true, stored: false, disabled: true }); return; }
      if (!process.env.KICK_CLIENT_ID || !process.env.KICK_CLIENT_SECRET) {
        res.status(503).json({ ok: false, error: 'no credentials' });
        return;
      }
      const locked = await upstash(['SET', KICK_REFRESH_LOCK_KEY, String(Date.now()), 'NX', 'EX', String(REFRESH_LOCK_TTL_SECONDS)]);
      if (locked !== 'OK') { res.status(200).json({ ok: true, stored: false, inFlight: true }); return; }
      try {
        const c = await collectKick({});
        const decision = decideKickStore({ ok: c.ok, lives: c.lives });
        if (!decision.store || !c.stored) {
          res.status(502).json({
            ok: false,
            error: c.error || decision.reason,
            status: c.status,
            headersSample: c.headersSample || null,
            hint: c.status === 0 ? 'Kick に届いていない(通信/遮断の疑い)' : '応答は来ているが使える形ではない(仕様変更の疑い)'
          });
          return;
        }
        await upstash(['SET', KICK_STORE_KEY, JSON.stringify(c.stored), 'EX', String(TTL_SECONDS)]);
        // ★初回の実測に使う数字(SPEC §7-1)を Actions のログへ。token の値は出さない。
        res.status(200).json({
          ok: true,
          stored: true,
          count: c.stored.count,
          shown: c.stored.shown,
          truncated: c.stored.truncated,
          matureCount: c.stored.matureCount,
          headersSample: c.headersSample || null,
          tokenExpiresIn: c.tokenExpiresIn || null
        });
      } finally {
        try { await upstash(['DEL', KICK_REFRESH_LOCK_KEY]); } catch { /* TTL で消える */ }
      }
      return;
    }

    // ── 閲覧者 ──
    const off = await readOff();
    const kick = await readKickSection(off);
    const youtube = { ok: false, platform: 'youtube', error: 'not implemented', lives: [] };
    const capturedAt = Math.max(Number(kick.capturedAt) || 0, 0);
    res.status(200).json({ ok: true, capturedAt, platforms: { kick, youtube } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
}
