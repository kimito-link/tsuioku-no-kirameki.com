// @ts-nocheck
/**
 * /api/live-og-image — 焼いた OGP カード画像(配信サムネ＋数字帯)を返す薄い I/O 係(v0.1.1519)。
 *
 *   GET /api/live-og-image?lv=lvNNN
 *     Redis の OG_IMAGE_KEY(hash)から該当 lv の JPEG バイト(base64)を引いて image/jpeg で返す。
 *     無ければ 302 でフォールバック PNG(第1段の生成物)へ。og:image を焼き画像に切り替える
 *     判定(HEXISTS)は api/live-og.js が持つ。ここは「引いて返す」だけ。
 *
 * ■ 何をするか / しないか(設計 §7)
 *   - する: Redis から焼いた画像を引いて返す。壊れ/不在/障害はフォールバック PNG へ 302。
 *   - しない: ニコ生へ fetch しない。画像を生成しない(焼くのは GitHub Actions 側の Python)。
 *     ★POST(投入)はこの Function では受けない。投入は /api/live-ranking?ingest=og-image が受ける
 *       (bake が既存の x-share-key 経路を 1 つに束ねるため・設計 §8 の POST 先)。
 *
 * ■ npm 依存ゼロ(Node 標準のみ)。upstash・OG_IMAGE_KEY は ./live-ranking.js から import。
 *
 * @module api/live-og-image
 */

import { upstash, OG_IMAGE_KEY } from './live-ranking.js';
import { LIVE_ID_RE } from '../src/lib/liveRankingView.js';

/** サムネが引けないとき・不正 lv のときに倒す先(第1段の生成物・実在)。 */
const FALLBACK_IMAGE_PATH = '/images/og-live-ranking.png';

export default async function handler(req, res) {
  // クローラー向けなので検索に載せない。焼く周期(5分)と同じキャッシュ。
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const lv = String((req.query && req.query.lv) || '').trim().toLowerCase();
  if (!LIVE_ID_RE.test(lv)) {
    // 不正 lv: Redis を読まずにフォールバック PNG へ(画像への 302 はループしない・設計 §7)。
    res.redirect(302, FALLBACK_IMAGE_PATH);
    return;
  }

  let entry = null;
  try {
    const raw = await upstash(['HGET', OG_IMAGE_KEY, lv]);
    entry = raw ? JSON.parse(raw) : null;
  } catch {
    // Redis 障害・壊れた JSON はすべてフォールバック PNG へ。
    entry = null;
  }

  if (!entry || entry.type !== 'image/jpeg' || typeof entry.b64 !== 'string' || !entry.b64) {
    res.redirect(302, FALLBACK_IMAGE_PATH);
    return;
  }

  let buf;
  try {
    buf = Buffer.from(entry.b64, 'base64');
  } catch {
    buf = null;
  }
  // 中身が空/短すぎ(JPEG になっていない)ならフォールバックへ。
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
    res.redirect(302, FALLBACK_IMAGE_PATH);
    return;
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).end(buf);
}
