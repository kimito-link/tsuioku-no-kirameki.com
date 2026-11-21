// @ts-nocheck
/**
 * 紅白歌枠合戦2026の公式イベントpt順位。
 *
 *   GET /api/kouhaku-ranking              保存済み(無ければ同梱シード)を返す。ニコニコへは行かない。
 *   GET /api/kouhaku-ranking?user=数字     推し1人
 *   GET /api/kouhaku-ranking?refresh=1     公式15106を読む。x-share-key 必須。1日最大2回はサーバが決める。
 *
 * ブラウザはこの JSON だけを読む。アイコンは公開 usericon の URL だけを返し、画像バイトは中継しない。
 */
import { upstash } from './live-ranking.js';
import { EVENTS, getEvent, selectEvent } from '../src/lib/eventRanking/registry.js';
import { buildUserAgent, PUBLIC_SITE_URL } from '../src/lib/kouhaku/constants.js';
import { runScheduledFetch } from '../src/lib/kouhaku/job.js';
import { fetchRankingPage } from '../src/server/kouhakuOfficialPage.js';
import { createRedisStore, readBoard, readProfile } from '../src/server/kouhakuRead.js';

function authorized(req) {
  const want = process.env.STATUS_INGEST_KEY;
  const sent = String((req.headers && req.headers['x-share-key']) || '');
  return Boolean(want) && sent === want;
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function storeOrNull(event) {
  if (!kvConfigured()) return null;
  return createRedisStore(upstash, event);
}

function resolveEvent(query) {
  if (query.event) return getEvent(String(query.event));
  return selectEvent(new Date());
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
    const targets = query.event ? [getEvent(String(query.event))].filter(Boolean) : EVENTS.slice();
    if (!targets.length) {
      res.status(404).json({ ok: false, error: 'unknown-event' });
      return;
    }
    const results = [];
    for (const event of targets) {
      const lockKey = `${event.storagePrefix}:lock`;
      let locked = false;
      try {
        const got = await upstash(['SET', lockKey, String(Date.now()), 'NX', 'EX', '90']);
        if (got !== 'OK') {
          results.push({ eventId: event.id, ok: true, action: 'skipped', reason: 'locked', slot });
          continue;
        }
        locked = true;
        const result = await runScheduledFetch({
          now: new Date(),
          store: createRedisStore(upstash, event),
          fetchPage: fetchRankingPage,
          userAgent: buildUserAgent(PUBLIC_SITE_URL),
          event
        });
        results.push({ eventId: event.id, ...result.body, slot });
      } catch {
        results.push({ eventId: event.id, ok: false, action: 'failed', message: 'state-unavailable', slot });
      } finally {
        if (locked) {
          try { await upstash(['DEL', lockKey]); } catch { /* ロック期限で消える */ }
        }
      }
    }
    const failed = results.some((item) => item.ok === false);
    const saved = results.some((item) => item.action === 'saved');
    res.status(200).json({
      ok: !failed,
      action: saved ? 'saved' : ((results[0] && results[0].action) || 'skipped'),
      slot,
      events: results
    });
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=120');
  const event = resolveEvent(query);
  if (!event) {
    res.status(404).json({ ok: false, error: 'unknown-event' });
    return;
  }
  const userId = String(query.user || '');
  try {
    const store = storeOrNull(event);
    const payload = userId ? await readProfile(store, userId, event) : await readBoard(store, event);
    res.status(200).json(payload);
  } catch {
    res.status(200).json({ ok: false, error: 'unavailable' });
  }
}
