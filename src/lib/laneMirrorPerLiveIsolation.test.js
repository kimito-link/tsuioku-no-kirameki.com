import { describe, expect, it } from 'vitest';
import { buildLaneMirrorSnapshot, buildLaneReceipt } from './laneMirror.js';
import { laneMirrorKeyFor, laneReceiptKeyFor, KEY_LANE_MIRROR } from './laneMirrorKey.js';
import { sanitizeLaneMirrorForRead } from './laneMirrorContract.js';

/**
 * ★v0.1.1300: 「2つの配信を同時に開いても混線しない」を storage 相当で実測する。
 *
 * ■ 単一グローバルキーで何が起きていたか(実コードで確認)
 *   KEY_LANE_MIRROR は1本しかないので、配信Bの①が publish すると配信Aの鏡が消える。
 *   読み手は liveId 照合で弾くしかない(laneMirrorContract.js:158「別配信の①が最後に
 *   書いた鏡を掴みうる」)= 配信A側では「鏡なし」になり fallback へ降格し、
 *   fallback は gift/ad 段を作れない(原理)=段が消える。
 *
 * ■ ここで測ること
 *   配信ごとキーなら、Bを書いてもAが生き残る。旧キーでは生き残らない(=対比で示す)。
 */

/** storage.local の最小モック(set/get のみ)。 */
function makeStorage() {
  /** @type {Record<string, any>} */
  const bag = {};
  return {
    bag,
    set: (obj) => Object.assign(bag, obj),
    get: (keys) => {
      const out = {};
      for (const k of [].concat(keys)) if (k in bag) out[k] = bag[k];
      return out;
    }
  };
}

/** ★セルの形は toMirrorCell(laneMirror.js:107)が読む実形に合わせる。
 *  `{ displaySrc, title, meta:{idLine,nameLine}, entry:{userId} }`。
 *  ここを適当な形にすると全セルが落ちて空配列になり、テストが嘘の緑/赤を出す
 *  (実際に最初 `{userId}` だけで書いて link=[] になった)。 */
function cell(uid) {
  return {
    displaySrc: `https://example.invalid/${uid}.png`,
    title: uid,
    meta: { idLine: uid, nameLine: uid },
    entry: { userId: uid }
  };
}

function snapFor(lid, names) {
  return buildLaneMirrorSnapshot(
    {
      liveId: lid,
      buckets: {
        link: names.map((n) => cell(n)),
        gift: [cell(`${lid}-gift`)],
        ad: [cell(`${lid}-ad`)],
        konta: [],
        tanu: []
      },
      domSelf: { measured: true, fingerprint: `fp-${lid}`, fingerprintFor: '' },
      pickedLength: names.length,
      totalCandidates: names.length
    },
    { nowMs: 1000, cap: 48 }
  );
}

describe('配信ごとキー: 2配信を同時に開いても混線しない', () => {
  it('★配信Bを書いても配信Aの鏡が生き残る(per-live キー)', () => {
    const st = makeStorage();
    // ★link 段は匿名不可(laneMirrorContract.js の段別不変条件)。
    //   isAnonymousStyleNicoUserId は 'a1' だけでなく【短い数字ID('1001')も匿名扱い】する。
    //   実在ユーザーと同じ【長い数字ID】でないと関所に落とされて空配列になる
    //   (ここを 'a1'→'1001' と2回間違えて、どちらも link=[] になった)。
    const a = snapFor('lv111', ['134093242','126658466','135248034']);
    const b = snapFor('lv222', ['61735205']);

    st.set({ [laneMirrorKeyFor('lv111')]: a });
    st.set({ [laneMirrorKeyFor('lv222')]: b }); // 後から別配信が publish

    const readA = sanitizeLaneMirrorForRead(st.get(laneMirrorKeyFor('lv111'))[laneMirrorKeyFor('lv111')]);
    expect(readA.snap).toBeTruthy();
    expect(readA.snap.liveId).toBe('lv111');
    expect(readA.snap.link).toHaveLength(3);
    // gift/ad 段も残っている(fallback へ降格しない=段が消えない)。
    expect(readA.snap.gift).toHaveLength(1);
    expect(readA.snap.ad).toHaveLength(1);
  });

  it('★対比: 旧グローバルキーだと後着の配信Bが配信Aを消す', () => {
    const st = makeStorage();
    st.set({ [KEY_LANE_MIRROR]: snapFor('lv111', ['134093242','126658466','135248034']) });
    st.set({ [KEY_LANE_MIRROR]: snapFor('lv222', ['61735205']) });

    const read = sanitizeLaneMirrorForRead(st.get(KEY_LANE_MIRROR)[KEY_LANE_MIRROR]);
    // 関所は通るが、中身は【配信B】= 配信Aの読み手は liveId 照合で弾くしかない。
    expect(read.snap.liveId).toBe('lv222');
    expect(read.snap.liveId).not.toBe('lv111');
  });

  it('★受領証も配信ごとに分かれる(片方の描画がもう片方を汚さない)', () => {
    const st = makeStorage();
    const a = snapFor('lv111', ['134093242']);
    const b = snapFor('lv222', ['61735205']);
    st.set({
      [laneReceiptKeyFor('lv111')]: buildLaneReceipt(
        { liveId: 'lv111', domSelf: a.domSelf, contentHash: a.contentHash },
        { nowMs: 1, surface: 'popup' }
      ),
      [laneReceiptKeyFor('lv222')]: buildLaneReceipt(
        { liveId: 'lv222', domSelf: b.domSelf, contentHash: b.contentHash },
        { nowMs: 2, surface: 'popup' }
      )
    });
    const ra = st.get(laneReceiptKeyFor('lv111'))[laneReceiptKeyFor('lv111')];
    const rb = st.get(laneReceiptKeyFor('lv222'))[laneReceiptKeyFor('lv222')];
    expect(ra.liveId).toBe('lv111');
    expect(rb.liveId).toBe('lv222');
    // 受領証は「その配信の内容」を指している。
    expect(ra.fingerprintFor).toBe(a.contentHash);
    expect(rb.fingerprintFor).toBe(b.contentHash);
    expect(ra.fingerprintFor).not.toBe(rb.fingerprintFor);
  });

  it('★鏡キーと受領証キーは衝突しない(同じ配信でも別スロット)', () => {
    expect(laneMirrorKeyFor('lv1')).not.toBe(laneReceiptKeyFor('lv1'));
  });
});
