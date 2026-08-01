import { describe, expect, it } from 'vitest';
import { userLaneCandidatesFromStorage } from '../lib/userLaneCandidatesFromStorage.js';
import { laneCandidatesFromStoredComments } from './sources/laneFromStoredComments.js';

/**
 * Phase 0 (baseline凍結) — レーン候補の二重正本を「現状のまま」固定する。
 * 正本: docs/handoff/component-factoring-zero-error-IMPLEMENTATION-HANDOFF.md
 *
 * 【なぜ必要か】
 * `laneStoreInstance` は popup-entry.js から setCandidates されるが、production に
 * subscribe/getState の利用が無い(shadow 状態)。画面の正本は今も旧経路
 * `userLaneCandidatesFromStorage` である。この状態で新経路へ切り替えると、
 * 気づかないうちに表示が変わる。
 *
 * 【このテストの役割】
 * 挙動を変えずに「今どこが一致し、どこが違うか」を機械で固定する。
 * ここが緑である限り、リファクタで意図しない差分が入れば必ず赤になる。
 *
 * ★AUTHORITY_SWITCH の前提: 下の「欠けているキー」が解消され、
 *   かつ全項目で差分0になること。1件でも差があるうちは切り替えない。
 */

/** 実データに近い最小 fixture(liveId 必須=旧経路はこれでフィルタする)。 */
const ROWS = Object.freeze([
  { userId: '55141222', nickname: 'だるま', text: 'a', capturedAt: 1000, commentNo: 1, liveId: 'lv1' },
  { userId: 'a:H0oFiJ', nickname: '', text: 'b', capturedAt: 2000, commentNo: 2, liveId: 'lv1' },
  { userId: '55141222', nickname: 'だるま', text: 'c', capturedAt: 3000, commentNo: 3, liveId: 'lv1' }
]);

describe('Phase0: レーン候補の二重正本 characterization', () => {
  const oldOut = userLaneCandidatesFromStorage(ROWS, 'lv1', {});
  const newOut = laneCandidatesFromStoredComments(ROWS, 'lv1');

  it('【一致】人物の集合と順序が同じ(切替の必要条件)', () => {
    expect(oldOut.map((r) => r.userId)).toEqual(newOut.map((r) => r.userId));
    expect(oldOut.map((r) => r.userId)).toEqual(['55141222', 'a:H0oFiJ']);
  });

  it('【一致】同一人物の重複は1件に畳まれる(両経路とも)', () => {
    // 55141222 は3行中2回発言しているが、候補としては1件。
    expect(oldOut).toHaveLength(2);
    expect(newOut).toHaveLength(2);
  });

  it('【一致】nickname / avatarUrl が同じ', () => {
    for (let i = 0; i < oldOut.length; i += 1) {
      expect(String(newOut[i].nickname ?? '')).toBe(String(oldOut[i].nickname ?? ''));
      expect(String(newOut[i].avatarUrl ?? '')).toBe(String(oldOut[i].avatarUrl ?? ''));
    }
  });

  /**
   * ★これが AUTHORITY_SWITCH をブロックしている当の差分。
   *   新経路に切り替えると、以下が失われる:
   *     commentCount / giftCount — 会場のVIP判定・件数表示が使う
   *     _laneSortAt              — レーンの並び順の根拠
   *     avatarObserved           — アバターを実際に観測したかの旗
   *   これらを新経路が出せるようになるまで切替禁止。
   */
  it('【差分】新経路に無いキーを固定する(切替をブロックしている当の差分)', () => {
    const missing = Object.keys(oldOut[0]).filter((k) => !(k in newOut[0]));
    expect(missing.sort()).toEqual(
      ['_laneSortAt', 'avatarObserved', 'commentCount', 'giftCount'].sort()
    );
  });

  it('【差分】新経路だけが持つキーも固定する(役割が違う可能性)', () => {
    const extra = Object.keys(newOut[0]).filter((k) => !(k in oldOut[0]));
    expect(extra.sort()).toEqual(['avatarObservationKinds', 'hasNonCanonicalPersonalUrl', 'lastCapturedAt'].sort());
  });

  /**
   * 旧経路は liveId でフィルタする。行に liveId が無いと0件になる。
   * 新経路にはこのフィルタが無い=同じ入力で結果が食い違う。
   * Phase 1 の comparator はこの差を吸収する必要がある。
   */
  it('【差分】liveId 無しの行に対する扱いが違う', () => {
    const rowsNoLive = ROWS.map(({ liveId: _liveId, ...rest }) => rest);
    expect(userLaneCandidatesFromStorage(rowsNoLive, 'lv1', {})).toHaveLength(0);
    expect(laneCandidatesFromStoredComments(rowsNoLive, 'lv1').length).toBeGreaterThan(0);
  });
});

/**
 * shadow 状態そのものを固定する。
 * 「laneStore を正本と呼ぶが表示 consumer がいない」という現実を、
 * 消すか使うかが決まるまでテストで見張る(中間状態を無自覚に放置しない)。
 */
describe('Phase0: laneStore が shadow であることの固定', () => {
  it('production コードに subscribe/getState の利用が無い', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..');
    const src = fs.readFileSync(path.join(root, 'src/extension/popup-entry.js'), 'utf8');
    // setCandidates はしている(shadow へ流し込んでいる)
    expect(src).toContain('laneStoreInstance.setCandidates');
    // だが購読はしていない=表示の正本ではない
    expect(src).not.toContain('laneStoreInstance.subscribe');
    expect(src).not.toContain('laneStoreInstance.getState');
  });
});
