// @ts-nocheck
/**
 * 共有クローラー向けの HTML。保存済みの順位から見出しを作る。公式ページへは行かない。
 *
 *   GET /api/kouhaku-og
 *   GET /api/kouhaku-og?user=数字
 */
import { upstash } from './live-ranking.js';
import { getEvent, selectEvent } from '../src/lib/eventRanking/registry.js';
import { boardOgCard, buildKouhakuOgHtml, profileOgCard } from '../src/lib/kouhaku/ogHtml.js';
import { createRedisStore, readBoard, readProfile } from '../src/server/kouhakuRead.js';

function storeOrNull(event) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  return createRedisStore(upstash, event);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  const query = req.query || {};
  const userId = String(query.user || '');
  const event = (query.event && getEvent(String(query.event))) || selectEvent(new Date());
  let card = boardOgCard(event ? { eventId: event.id, eventName: event.name } : {});
  try {
    const store = storeOrNull(event);
    if (userId) {
      const profile = await readProfile(store, userId, event);
      card = profile && profile.found && profile.entry ? profileOgCard(profile) : boardOgCard(event ? { eventId: event.id, eventName: event.name } : {});
    } else {
      const board = await readBoard(store, event);
      card = boardOgCard(board);
    }
  } catch {
    card = boardOgCard(event ? { eventId: event.id, eventName: event.name } : {});
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).end(buildKouhakuOgHtml(card));
}
