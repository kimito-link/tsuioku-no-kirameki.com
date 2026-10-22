import { describe, it, expect } from 'vitest';
import { writeMirrorPayloadKeepingNewerTimeline } from './mirrorPayloadWrite.js';
import { KEY_COMMENT_TIMELINE_MIRROR as K } from './commentTimelineMirrorKey.js';

function fakeStorage(stored) {
  const sets = [];
  return { sets, get: async () => ({ [K]: stored }), set: async (o) => { sets.push(o); } };
}

describe('writeMirrorPayloadKeepingNewerTimeline(v0.1.1753)', () => {
  it('★保存済みのコメント鏡が新しければその鏡だけ落とし、他の鏡は書く', async () => {
    const st = fakeStorage({ liveId: 'lv1', capturedAt: 2000 });
    await writeMirrorPayloadKeepingNewerTimeline(st, { [K]: { liveId: 'lv1', capturedAt: 1000 }, lane: { a: 1 } });
    expect(st.sets).toEqual([{ lane: { a: 1 } }]);
  });
  it('コメント鏡だけで、それを落としたら何も書かない', async () => {
    const st = fakeStorage({ liveId: 'lv1', capturedAt: 2000 });
    await writeMirrorPayloadKeepingNewerTimeline(st, { [K]: { liveId: 'lv1', capturedAt: 1000 } });
    expect(st.sets).toEqual([]);
  });
  it('書こうとしている鏡のほうが新しい・読めないときは書く', async () => {
    const st = fakeStorage({ liveId: 'lv1', capturedAt: 1000 });
    const snap = { liveId: 'lv1', capturedAt: 2000 };
    await writeMirrorPayloadKeepingNewerTimeline(st, { [K]: snap });
    expect(st.sets).toEqual([{ [K]: snap }]);
    const broken = { sets: [], get: async () => { throw new Error('x'); }, set: async (o) => { broken.sets.push(o); } };
    await writeMirrorPayloadKeepingNewerTimeline(broken, { [K]: snap });
    expect(broken.sets).toEqual([{ [K]: snap }]);
  });
});
