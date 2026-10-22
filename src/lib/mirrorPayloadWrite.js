/**
 * 【層】L1 書き込み層(storage を引数で受ける=テストで差し替えられる)
 * 【この箱に入るもの】popup の鏡バンドルを storage へ書くときの「古い中身で巻き戻さない」判断
 * 【この箱に入らないもの】鏡の組み立て・flush の間隔(mirrorBundleFlushScheduler.js)
 *
 * ★なぜ(v0.1.1753): コメント流れの鏡は content(視聴タブ)と popup(鏡バンドル)の2か所が同じキーに書く。
 *   popup が古い鏡を15秒ごとに書き直し、content の新しい鏡を巻き戻していた(スマホ会場の席が約2分半0)。
 *   保存済みのほうが新しければ、その鏡だけ書かない(判定は isStoredTimelineMirrorNewer)。
 * @module mirrorPayloadWrite
 */
import { KEY_COMMENT_TIMELINE_MIRROR } from './commentTimelineMirrorKey.js';
import { isStoredTimelineMirrorNewer } from './commentTimelineMirror.js';

/**
 * @param {{ get: (k: string) => Promise<any>, set: (o: Record<string, unknown>) => Promise<unknown> }} storage
 * @param {Record<string, unknown>} payload
 */
export async function writeMirrorPayloadKeepingNewerTimeline(storage, payload) {
  if (payload[KEY_COMMENT_TIMELINE_MIRROR]) {
    try {
      const bag = await storage.get(KEY_COMMENT_TIMELINE_MIRROR);
      if (isStoredTimelineMirrorNewer(bag?.[KEY_COMMENT_TIMELINE_MIRROR], payload[KEY_COMMENT_TIMELINE_MIRROR])) {
        delete payload[KEY_COMMENT_TIMELINE_MIRROR];
      }
    } catch { /* 読めなければ従来どおり書く */ }
  }
  if (Object.keys(payload).length) await storage.set(payload);
}
