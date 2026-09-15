// @ts-nocheck
/**
 * /api/live-og — 配信ごとの OGP カード用 HTML を返す薄い I/O 係(v0.1.1517)。
 *
 *   GET /api/live-og?lv=lvNNN
 *     vercel.json の rewrite が「?lv= あり ∧ カード用クローラー UA」のときだけここへ回す。
 *     人間は従来どおり静的 /live/ を受け取る(このファイルには来ない)。
 *
 * ■ 何をするか / しないか(設計 §5)
 *   - する: 保存済みランキング(live:ranking:latest)から該当配信を引き、その配信の
 *     サムネ・配信者名・番組名で OGP カードの HTML を組み立てて返す。
 *   - しない: ニコ生へ fetch しない(クローラーの要求回数がそのままニコ生への負荷になる経路を
 *     作らない)。viewUri / token / コメント本文は一切扱わない。動的画像生成もしない。
 *
 * ■ ★常に 200 text/html を返す(設計 §5.1・§8)。
 *   Redis 障害・不在 lv・不正 lv・壊れた JSON でも 200 で汎用カード(§6 最終行)。
 *   5xx/404 を返すとクローラーはカードを出さない=「汎用」の方が「無い」より良い(AGENTS §3.6 fail-soft)。
 *
 * ■ npm 依存ゼロ(Node 標準のみ)。認証・upstash は ./live-ranking.js、純関数は ../src/lib から import。
 *
 * @module api/live-og
 */

import { upstash, STORE_KEY } from './live-ranking.js';
import { buildLiveOgHtml } from '../src/lib/liveOgHtml.js';
import { LIVE_ID_RE } from '../src/lib/liveRankingView.js';

/**
 * 保存済み一覧から lv 一致の 1 配信を返す(見つからない・壊れている・障害はすべて null)。
 * @param {string} lv 正規化済み(小文字・LIVE_ID_RE 合格)。
 * @returns {Promise<any|null>}
 */
async function findLive(lv) {
  try {
    const raw = await upstash(['GET', STORE_KEY]);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const lives = data && Array.isArray(data.lives) ? data.lives : [];
    const hit = lives.find((l) => l && String(l.liveId).toLowerCase() === lv);
    return hit || null;
  } catch {
    // Redis 障害・壊れた JSON はすべて汎用カードへ(200 のまま)。
    return null;
  }
}

export default async function handler(req, res) {
  // クローラー向け HTML が CDN 経由で人間に配られない・検索に載らないように。
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  let live = null;
  try {
    const lv = String((req.query && req.query.lv) || '').trim().toLowerCase();
    if (LIVE_ID_RE.test(lv)) {
      const found = await findLive(lv);
      const html = buildLiveOgHtml({ lv, live: found });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).end(html);
      return;
    }
    // lv が不正: Redis を読まずに汎用カード(live=null)。
    live = null;
  } catch {
    // どんな例外も汎用カードに倒す(5xx を出さない)。
    live = null;
  }
  const html = buildLiveOgHtml({ lv: '', live });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).end(html);
}
