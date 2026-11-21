// @ts-nocheck
/**
 * 共有クローラー向けの HTML。保存済みの順位から見出しを作る。公式ページへは行かない。
 *
 *   GET /api/kouhaku-og
 *   GET /api/kouhaku-og?user=数字
 */
import { upstash } from './live-ranking.js';
import { boardOgCard, buildKouhakuOgHtml, profileOgCard } from '../src/lib/kouhaku/ogHtml.js';
import { createRedisStore, readBoard, readProfile } from '../src/server/kouhakuRead.js';

function storeOrNull() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  return createRedisStore(upstash);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  const userId = String((req.query && req.query.user) || '');
  let card = boardOgCard({});
  try {
    const store = storeOrNull();
    if (userId) {
      const profile = await readProfile(store, userId);
      card = profile && profile.found && profile.entry ? profileOgCard(profile) : boardOgCard({});
    } else {
      const board = await readBoard(store);
      card = boardOgCard(board);
    }
  } catch {
    card = boardOgCard({});
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).end(buildKouhakuOgHtml(card));
}
