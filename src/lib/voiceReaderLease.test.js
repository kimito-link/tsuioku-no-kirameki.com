import { describe, expect, it, vi } from 'vitest';
import {
  VOICE_READER_CLAIM,
  VOICE_READER_LEASE_TTL_MS,
  VOICE_READER_RELEASE,
  createVoiceReaderLeaseLink,
  createVoiceReaderLeaseTable,
  startVoiceReaderLease,
  VOICE_READER_LEASE_BEAT_MS,
  VOICE_READER_PRIO_HEADLESS,
  VOICE_READER_PRIO_VISIBLE
} from './voiceReaderLease.js';

/** 2つのページが1つの表(Background 役)を共有する。 */
function setup() {
  let t = 1000;
  const now = () => t;
  const table = createVoiceReaderLeaseTable();
  /** @param {any} msg */
  const send = (msg) => {
    if (msg.type === VOICE_READER_CLAIM) return Promise.resolve(table.claim(msg.liveId, msg.holder, t, msg.prio));
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

  // 2026-11-25: 別窓の会場を開いていても、先に名乗った視聴ページ内の閉じた会場(声だけ)が読み、
  //   別窓の吹き出しが声より中央4.4秒先に出ていた(箱の実測)。見えている会場が読み手を引き継ぐ。
  it('見えている会場は、閉じた会場(声だけ)から読み手を引き継ぐ。引き継がれた側は1回だけ onLost', async () => {
    let t = 1000;
    const table = createVoiceReaderLeaseTable();
    /** @param {any} msg */
    const send = (msg) => Promise.resolve(msg.type === VOICE_READER_CLAIM ? table.claim(msg.liveId, msg.holder, t, msg.prio) : (table.release(msg.holder), { ok: true }));
    const lost = vi.fn();
    const headless = createVoiceReaderLeaseLink(send, { now: () => t, holder: 'inpage', priority: () => VOICE_READER_PRIO_HEADLESS, onLost: lost });
    let windowOpen = true;
    const windowVenue = createVoiceReaderLeaseLink(send, { now: () => t, holder: 'window', priority: () => (windowOpen ? VOICE_READER_PRIO_VISIBLE : VOICE_READER_PRIO_HEADLESS) });
    await headless.beat('lv1');
    expect(await headless.check('lv1')).toBe(true);
    await windowVenue.beat('lv1');
    expect(await windowVenue.check('lv1')).toBe(true);
    t += VOICE_READER_LEASE_BEAT_MS; // 閉じた会場の次の名乗りで「譲った」と分かる
    await headless.beat('lv1');
    expect(await headless.check('lv1')).toBe(false);
    expect(lost).toHaveBeenCalledTimes(1);
    await headless.beat('lv1');
    expect(lost).toHaveBeenCalledTimes(1);
    // 別窓を畳んでも(優先度0)、閉じた会場は横取りしない(同じ優先度は先着のまま・ばたつかない)
    windowOpen = false;
    await windowVenue.beat('lv1');
    await headless.beat('lv1');
    expect(await headless.check('lv1')).toBe(false);
    // 別窓を閉じたら(手放す)閉じた会場が読み手に戻る
    windowVenue.release();
    await headless.beat('lv1');
    expect(await headless.check('lv1')).toBe(true);
  });
  it('同じ優先度どうしは今までどおり先着(見えている会場とコメビュは取り合わない)', () => {
    const table = createVoiceReaderLeaseTable();
    expect(table.claim('lv1', 'venue', 1000, VOICE_READER_PRIO_VISIBLE).granted).toBe(true);
    expect(table.claim('lv1', 'comeview', 1001, VOICE_READER_PRIO_VISIBLE).granted).toBe(false);
    expect(table.claim('lv1', 'inpage', 1002, VOICE_READER_PRIO_HEADLESS).granted).toBe(false);
    expect(table.claim('lv1', 'old', 1003).granted).toBe(false);
  });
  it('名乗りに優先度を載せる(priority が無い・壊れていれば 0)', async () => {
    /** @type {any[]} */
    const sent = [];
    const send = (/** @type {any} */ msg) => { sent.push(msg); return Promise.resolve({ granted: true }); };
    await createVoiceReaderLeaseLink(send, { holder: 'a', priority: () => VOICE_READER_PRIO_VISIBLE }).beat('lv1');
    await createVoiceReaderLeaseLink(send, { holder: 'b' }).beat('lv1');
    await createVoiceReaderLeaseLink(send, { holder: 'c', priority: () => { throw new Error('x'); } }).beat('lv1');
    expect(sent.map((m) => m.prio)).toEqual([1, 0, 0]);
  });
});
