// @ts-nocheck
/**
 * スマホ版の「利用者ごとの鍵」の受け口(v0.1.1730・スマホ化 利用者ごとの鍵 第a段)。
 *
 *   POST   /api/device                 鍵を発行する(拡張が「スマホで見る」を ON にした瞬間に1回)。
 *                                       返す: { deviceId, writeKey, viewToken }。writeKey はこの1回しか返さない。
 *   POST   /api/device?action=rotate   閲覧URLを作り直す(漏れたときに古いURLを無効にする)。要 x-device-id + x-write-key。
 *   DELETE /api/device                 サーバーのデータを消す(同意 OFF のとき)。要 x-device-id + x-write-key。
 *                                       本体・ETag・鍵の記録をすべて消す。
 *
 *   ★この段(第a段)ではまだ拡張から呼ばない=今の利用者への影響なし。拡張側は第b段。
 *   計画書: /mnt/project-files/smartphone/plan-4-per-user-keys.md
 */

import {
  DEFAULT_REGISTER_HOURLY_LIMIT,
  deviceKeys
} from '../src/lib/deviceAuth.js';
import {
  authenticateDevice,
  incrWithExpiry,
  newDeviceCredentials,
  randomToken,
  requesterHash,
  revokePhonePost,
  saveDeviceRecord,
  upstash
} from '../src/server/deviceStore.js';
import { moveFanLink, revokeFanLink } from '../src/server/fanLinkApi.js';

/** 鍵・閲覧トークンは書かない。結果だけ。 */
export function logDevice(outcome) {
  try {
    console.log(JSON.stringify({ m: 'status-device', outcome }));
  } catch {
    /* 記録の失敗で受け口を止めない */
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const nowMs = Date.now();

    if (req.method === 'POST' && String(req.query?.action || '') === 'rotate') {
      const auth = await authenticateDevice(req.headers);
      if (!auth) {
        logDevice('rotate_unauthorized');
        res.status(401).json({ ok: false, error: 'unauthorized' });
        return;
      }
      const viewToken = randomToken(24);
      // v0.1.1734: スマホからコメントする鍵も古いURLに紐づく=一緒に無効にする(PC で ON にし直すと新しいURLが出る)。
      await revokePhonePost(auth.record.v);
      // v0.1.1820: ファン用リンクは新しい閲覧トークンへ付け替える(ファンに配ったリンクは切らない)。
      await moveFanLink(auth.record.v, viewToken);
      // 古い閲覧URLの中身を先に消す(作り直した瞬間から古いURLは 404)。
      await upstash(['DEL', deviceKeys.latest(auth.record.v), deviceKeys.etag(auth.record.v)]);
      // writeKey は変えない(ハッシュはそのまま)=記録を直接書き換える。
      await upstash([
        'SET',
        deviceKeys.device(auth.deviceId),
        JSON.stringify({ h: auth.record.h, v: viewToken, c: auth.record.c }),
        'KEEPTTL'
      ]);
      logDevice('rotated');
      res.status(200).json({ ok: true, viewToken });
      return;
    }

    if (req.method === 'POST') {
      const limit = Number(process.env.DEVICE_REGISTER_HOURLY_LIMIT) || DEFAULT_REGISTER_HOURLY_LIMIT;
      const n = await incrWithExpiry(deviceKeys.registerRate(requesterHash(req), nowMs), 2 * 60 * 60);
      if (n > limit) {
        logDevice('register_rate_limited');
        res.setHeader('Retry-After', '3600');
        res.status(429).json({ ok: false, error: 'too many registrations' });
        return;
      }
      const cred = newDeviceCredentials();
      await saveDeviceRecord(cred.deviceId, cred.writeKey, cred.viewToken, nowMs);
      logDevice('registered');
      res.status(200).json({ ok: true, ...cred });
      return;
    }

    if (req.method === 'DELETE') {
      const auth = await authenticateDevice(req.headers);
      if (!auth) {
        logDevice('delete_unauthorized');
        res.status(401).json({ ok: false, error: 'unauthorized' });
        return;
      }
      await revokePhonePost(auth.record.v);
      await revokeFanLink(auth.record.v); // v0.1.1820: スマホで見るを止めたら、ファン用リンクも消す
      await upstash([
        'DEL',
        deviceKeys.latest(auth.record.v),
        deviceKeys.etag(auth.record.v),
        deviceKeys.device(auth.deviceId)
      ]);
      logDevice('deleted');
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ ok: false, error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
