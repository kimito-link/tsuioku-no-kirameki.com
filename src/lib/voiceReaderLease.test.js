import { describe, expect, it, vi } from 'vitest';
import {
  VOICE_READER_CLAIM,
  VOICE_READER_LEASE_TTL_MS,
  VOICE_READER_RELEASE,
  createVoiceReaderLeaseLink,
  createVoiceReaderLeaseTable,
  startVoiceReaderLease,
  VOICE_READER_LEASE_BEAT_MS
} from './voiceReaderLease.js';

/** 2つのページが1つの表(Background 役)を共有する。 */
function setup() {
  let t = 1000;
  const now = () => t;
  const table = createVoiceReaderLeaseTable();
  /** @param {any} msg */
  const send = (msg) => {
    if (msg.type === VOICE_READER_CLAIM) return Promise.resolve(table.claim(msg.liveId, msg.holder, t));
    if (msg.type === VOICE_READER_RELEASE) { table.release(msg.holder); return Promise.resolve({ ok: true }); }
    return Promise.resolve(null);
  };
  const venue = createVoiceReaderLeaseLink(send, { now, holder: 'venue' });
  const comeview = createVoiceReaderLeaseLink(send, { now, holder: 'comeview' });
  return { venue, comeview, advance: (/** @type {number} */ ms) => { t += ms; } };
}

describe('voiceReaderLease (v0.1.1794)', () => {
  it('同じ配信は先に名乗った方だけが読む(大文字小文字・前後の空白は同じ配信)', async () => {
    const { venue, comeview } = setup();
    await venue.beat('lv123');
    await comeview.beat(' LV123 ');
    expect(await venue.check('lv123')).toBe(true);
    expect(await comeview.check('lv123')).toBe(false);
  });
  it('別の配信ならどちらも読む', async () => {
    const { venue, comeview } = setup();
    await venue.beat('lv1');
    await comeview.beat('lv2');
    expect(await venue.check('lv1')).toBe(true);
    expect(await comeview.check('lv2')).toBe(true);
  });
  it('読んでいた方が手放す・合図が途切れると、もう片方が引き継ぐ', async () => {
    const a = setup();
    await a.venue.beat('lv1');
    await a.comeview.beat('lv1');
    a.venue.release();
    await a.comeview.beat('lv1');
    expect(await a.comeview.check('lv1')).toBe(true);

    const b = setup();
    await b.venue.beat('lv1');
    await b.comeview.beat('lv1');
    b.advance(VOICE_READER_LEASE_TTL_MS + 1);
    await b.comeview.beat('lv1');
    expect(await b.comeview.check('lv1')).toBe(true);
    await b.venue.beat('lv1');
    expect(await b.venue.check('lv1')).toBe(false);
  });
  it('答えが無い・古い時は名乗りの返事を待ってから答える(開いた直後に二重に読まない)', async () => {
    const { venue, comeview, advance } = setup();
    await venue.beat('lv1');
    expect(await comeview.check('lv1')).toBe(false);
    advance(VOICE_READER_LEASE_TTL_MS + 1);
    // 会場の合図が途切れた後は、待って名乗り直せば読める
    expect(await comeview.check('lv1')).toBe(true);
  });
  it('返事が無い・壊れている時は読む(声が全部止まるよりまし)', async () => {
    const dead = createVoiceReaderLeaseLink(() => { throw new Error('no sw'); }, { holder: 'x' });
    await dead.beat('lv1');
    expect(await dead.check('lv1')).toBe(true);
    const weird = createVoiceReaderLeaseLink(() => Promise.resolve('?'), { holder: 'y' });
    await weird.beat('lv1');
    expect(await weird.check('lv1')).toBe(true);
    expect(await weird.check('')).toBe(true);
  });
  it('startVoiceReaderLease: 読み上げ中だけ名乗り、止めたら1回だけ手放す', async () => {
    vi.useFakeTimers();
    try {
      /** @type {string[]} */
      const sent = [];
      const link = createVoiceReaderLeaseLink((msg) => { sent.push(String(msg.type)); return Promise.resolve({ granted: true }); }, { holder: 'h' });
      let active = true;
      startVoiceReaderLease(() => active, () => 'lv1', { link });
      await vi.advanceTimersByTimeAsync(VOICE_READER_LEASE_BEAT_MS * 2);
      expect(sent.filter((t) => t === VOICE_READER_CLAIM)).toHaveLength(2);
      active = false;
      await vi.advanceTimersByTimeAsync(VOICE_READER_LEASE_BEAT_MS * 3);
      expect(sent.filter((t) => t === VOICE_READER_RELEASE)).toHaveLength(1);
      expect(startVoiceReaderLease(() => true, () => 'lv1', { link: null })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('whenMine: ページごとに届いた順で「読む/譲る」を決める', async () => {
    const { venue, comeview } = setup();
    await venue.beat('lv1');
    /** @type {string[]} */
    const log = [];
    void comeview.whenMine('lv1', () => log.push('c1'), () => log.push('c1-yield'));
    void venue.whenMine('lv1', () => log.push('v1'));
    void venue.whenMine('lv1', () => log.push('v2'));
    await comeview.whenMine('lv1', () => log.push('c2'), () => log.push('c2-yield'));
    await venue.whenMine('lv1', () => log.push('v3'));
    expect(log.filter((x) => x.startsWith('v'))).toEqual(['v1', 'v2', 'v3']);
    expect(log.filter((x) => x.startsWith('c'))).toEqual(['c1-yield', 'c2-yield']);
  });
});
