import { describe, expect, it } from 'vitest';
import {
  VOICE_READER_CLAIM,
  VOICE_READER_LEASE_TTL_MS,
  VOICE_READER_RELEASE,
  createVoiceReaderLeaseLink,
  createVoiceReaderLeaseTable
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
    expect(venue.mayRead('lv123')).toBe(true);
    expect(comeview.mayRead('lv123')).toBe(false);
  });
  it('別の配信ならどちらも読む', async () => {
    const { venue, comeview } = setup();
    await venue.beat('lv1');
    await comeview.beat('lv2');
    expect(venue.mayRead('lv1')).toBe(true);
    expect(comeview.mayRead('lv2')).toBe(true);
  });
  it('読んでいた方が手放す・合図が途切れると、もう片方が引き継ぐ', async () => {
    const a = setup();
    await a.venue.beat('lv1');
    await a.comeview.beat('lv1');
    a.venue.release();
    await a.comeview.beat('lv1');
    expect(a.comeview.mayRead('lv1')).toBe(true);

    const b = setup();
    await b.venue.beat('lv1');
    await b.comeview.beat('lv1');
    b.advance(VOICE_READER_LEASE_TTL_MS + 1);
    await b.comeview.beat('lv1');
    expect(b.comeview.mayRead('lv1')).toBe(true);
    await b.venue.beat('lv1');
    expect(b.venue.mayRead('lv1')).toBe(false);
  });
  it('答えが古い・返事が無い・壊れている時は読む(声が全部止まるよりまし)', async () => {
    const { venue, comeview, advance } = setup();
    await venue.beat('lv1');
    await comeview.beat('lv1');
    advance(VOICE_READER_LEASE_TTL_MS + 1);
    expect(comeview.mayRead('lv1')).toBe(true);
    const dead = createVoiceReaderLeaseLink(() => { throw new Error('no sw'); }, { holder: 'x' });
    await dead.beat('lv1');
    expect(dead.mayRead('lv1')).toBe(true);
    const weird = createVoiceReaderLeaseLink(() => Promise.resolve('?'), { holder: 'y' });
    await weird.beat('lv1');
    expect(weird.mayRead('lv1')).toBe(true);
    expect(weird.mayRead('')).toBe(true);
  });
});
