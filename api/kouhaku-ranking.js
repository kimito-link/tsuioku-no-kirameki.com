// @ts-nocheck
/**
 * 紅白歌枠合戦2026の公式イベントpt順位。
 *
 *   GET /api/kouhaku-ranking              保存済み(無ければ同梱シード)を返す。ニコニコへは行かない。
 *   GET /api/kouhaku-ranking?user=数字     推し1人
 *   GET /api/kouhaku-ranking?refresh=1     公式15106を読む。x-share-key 必須。1日最大2回はサーバが決める。
 *
 * ブラウザはこの JSON だけを読む。画像URLは返さない。
 */
import { upstash } from './live-ranking.js';
import { buildUserAgent, PUBLIC_SITE_URL } from '../src/lib/kouhaku/constants.js';
import { runScheduledFetch } from '../src/lib/kouhaku/job.js';
import { fetchRankingPage } from '../src/server/kouhakuOfficialPage.js';
import { createRedisStore, readBoard, readProfile } from '../src/server/kouhakuRead.js';

const LOCK_KEY = 'kouhaku:v1:lock';

function authorized(req) {
  const want = process.env.STATUS_INGEST_KEY;
  const sent = String((req.headers && req.headers['x-share-key']) || '');
  return Boolean(want) && sent === want;
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function storeOrNull() {
  if (!kvConfigured()) return null;
  return createRedisStore(upstash);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const query = req.query || {};
  if (String(query.refresh || '') === '1') {
    res.setHeader('Cache-Control', 'no-store');
    if (!kvConfigured()) {
      res.status(503).json({
        ok: false,
        action: 'not-configured',
        message: '保存先が無いため、公式ページにはアクセスしません'
      });
      return;
    }
    if (!authorized(req)) {
      res.status(401).json({ ok: false, action: 'unauthorized' });
      return;
    }
    const slot = String(query.slot || '');
    let locked = false;
    try {
      const got = await upstash(['SET', LOCK_KEY, String(Date.now()), 'NX', 'EX', '90']);
      if (got !== 'OK') {
        res.status(200).json({ ok: true, action: 'skipped', reason: 'locked', slot });
        return;
      }
      locked = true;
      const result = await runScheduledFetch({
        now: new Date(),
        store: createRedisStore(upstash),
        fetchPage: fetchRankingPage,
        userAgent: buildUserAgent(PUBLIC_SITE_URL)
      });
      res.status(result.status).json({ ...result.body, slot });
    } catch {
      res.status(200).json({ ok: false, action: 'failed', message: 'state-unavailable', slot });
    } finally {
      if (locked) {
        try { await upstash(['DEL', LOCK_KEY]); } catch { /* ロック期限で消える */ }
      }
    }
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=120');
  const userId = String(query.user || '');
  try {
    const store = storeOrNull();
    const payload = userId ? await readProfile(store, userId) : await readBoard(store);
    res.status(200).json(payload);
  } catch {
    res.status(200).json({ ok: false, error: 'unavailable' });
  }
}
