import { describe, expect, it } from 'vitest';
import { publishLaneMirrorPerLive } from './laneMirrorPerLivePublish.js';
import { buildLaneMirrorSnapshot } from './laneMirror.js';
import { laneMirrorKeyFor, laneReceiptKeyFor } from './laneMirrorKey.js';

/** storage.local.set 相当のスパイ。 */
function spyStorage() {
  const writes = [];
  return { writes, set: (obj) => writes.push(obj) };
}

const cell = (uid) => ({
  displaySrc: `https://example.invalid/${uid}.png`,
  title: uid,
  meta: { idLine: uid, nameLine: uid },
  entry: { userId: uid }
});

const snapFor = (lid) =>
  buildLaneMirrorSnapshot(
    {
      liveId: lid,
      buckets: { link: [cell('134093242')], gift: [], ad: [], konta: [], tanu: [] },
      domSelf: { measured: true, fingerprint: `fp-${lid}` },
      pickedLength: 1,
      totalCandidates: 1
    },
    { nowMs: 1000, cap: 48 }
  );

describe('publishLaneMirrorPerLive(実行して測る)', () => {
  it('★鏡と受領証を1回の set にまとめて書く(片方だけ新しい状態を作らない)', () => {
    const st = spyStorage();
    const snap = snapFor('lv351133862');
    const r = publishLaneMirrorPerLive(snap, 7, st);

    expect(r.written).toBe(true);
    expect(st.writes).toHaveLength(1);
    const obj = st.writes[0];
    expect(Object.keys(obj).sort()).toEqual(
      [laneMirrorKeyFor('lv351133862'), laneReceiptKeyFor('lv351133862')].sort()
    );
  });

  it('★受領証は鏡の contentHash を指す(内容アドレスで結ばれる)', () => {
    const st = spyStorage();
    const snap = snapFor('lv1234');
    publishLaneMirrorPerLive(snap, 7, st);
    const receipt = st.writes[0][laneReceiptKeyFor('lv1234')];
    expect(receipt.fingerprintFor).toBe(snap.contentHash);
    expect(receipt.fingerprint).toBe('fp-lv1234');
    expect(receipt.surface).toBe('popup');
  });

  it('★鏡そのものは作り変えずに書く(中継で値を落とさない)', () => {
    const st = spyStorage();
    const snap = snapFor('lv1234');
    publishLaneMirrorPerLive(snap, 7, st);
    // 同一参照=フィールドを列挙して作り直していない
    // ([[venue-mirror-is-the-primary-path-2026-08-01]] の再発型を避ける)。
    expect(st.writes[0][laneMirrorKeyFor('lv1234')]).toBe(snap);
  });

  it('★liveId が無ければ何も書かない(どの配信か不明な値を残さない)', () => {
    const st = spyStorage();
    const r = publishLaneMirrorPerLive({ liveId: '' }, 7, st);
    expect(r.written).toBe(false);
    expect(r.reason).toContain('liveId');
    expect(st.writes).toHaveLength(0);
  });

  it('storage が無くても落ちない(best-effort)', () => {
    expect(() => publishLaneMirrorPerLive(snapFor('lv1'), 7, null)).not.toThrow();
    expect(publishLaneMirrorPerLive(snapFor('lv1'), 7, null).written).toBe(false);
  });

  it('★配信が変わると別スロットへ書く(前の配信を上書きしない)', () => {
    const st = spyStorage();
    publishLaneMirrorPerLive(snapFor('lv111'), 1, st);
    publishLaneMirrorPerLive(snapFor('lv222'), 2, st);
    const keys = st.writes.flatMap((w) => Object.keys(w));
    expect(keys).toContain(laneMirrorKeyFor('lv111'));
    expect(keys).toContain(laneMirrorKeyFor('lv222'));
    expect(laneMirrorKeyFor('lv111')).not.toBe(laneMirrorKeyFor('lv222'));
  });
});
