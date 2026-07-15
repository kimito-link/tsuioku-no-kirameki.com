import { describe, it, expect } from 'vitest';
import {
  beginVenueSeatLinkPaint,
  createVenueSeatLinkParityState,
  observeVenueSeatLink,
  toVenueSeatLinkParityDiag
} from './venueSeatLinkParity.js';

/**
 * venueSeatLinkParity.js — 会場タイルのリンク欠落: 診断先行アプローチ(実害確定計器)。
 * 正本: venue-tile-link-parity-diagnose-DESIGN.md
 *
 * 掟: 数えるだけ・DOM/データを触らない(venueDomCensus.jsと同じ)。
 */

describe('createVenueSeatLinkParityState', () => {
  it('初期値は全部ゼロ・lastSampleはnull', () => {
    const state = createVenueSeatLinkParityState();
    expect(state.paints).toBe(0);
    expect(state.checked).toBe(0);
    expect(state.badPaints).toBe(0);
    expect(state.uidMismatch).toBe(0);
    expect(state.affordanceMismatch).toBe(0);
    expect(state.hrefStale).toBe(0);
    expect(state.lastSample).toBeNull();
  });
});

describe('observeVenueSeatLink（全一致=正常系はカウントしない）', () => {
  it('鏡uid=roster uid・リンク判定=タイルタグが一致すれば不一致カウントは増えない', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 0,
      mirrorUid: '123456',
      rosterUid: '123456',
      seatLinkOn: true,
      tileTag: 'A',
      tileHref: 'https://www.nicovideo.jp/user/123456',
      mode: 'mirror',
      wallNow: 1000
    });
    expect(state.checked).toBe(1);
    expect(state.uidMismatch).toBe(0);
    expect(state.affordanceMismatch).toBe(0);
    expect(state.hrefStale).toBe(0);
    expect(state.badPaints).toBe(0);
    expect(state.lastSample).toBeNull();
  });

  it('両側とも匿名(非リンク・span)なら一致として扱う', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 1,
      mirrorUid: 'a:anon1',
      rosterUid: 'a:anon1',
      seatLinkOn: false,
      tileTag: 'SPAN',
      tileHref: '',
      mode: 'mirror',
      wallNow: 1000
    });
    expect(state.uidMismatch).toBe(0);
    expect(state.affordanceMismatch).toBe(0);
    expect(state.badPaints).toBe(0);
  });
});

describe('observeVenueSeatLink（INV-1: uid不一致）', () => {
  it('鏡uidとroster uidが異なれば uidMismatch が増える', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 2,
      mirrorUid: '111111',
      rosterUid: '222222',
      seatLinkOn: true,
      tileTag: 'A',
      tileHref: 'https://www.nicovideo.jp/user/111111',
      mode: 'mirror',
      wallNow: 2000
    });
    expect(state.uidMismatch).toBe(1);
    expect(state.badPaints).toBe(1);
    expect(state.lastSample?.kind).toContain('uid');
  });

  it('片方が空文字ならuid不一致とは呼ばない', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 3,
      mirrorUid: '123456',
      rosterUid: '',
      seatLinkOn: true,
      tileTag: 'A',
      tileHref: 'https://www.nicovideo.jp/user/123456',
      mode: 'mirror',
      wallNow: 2000
    });
    expect(state.uidMismatch).toBe(0);
  });
});

describe('observeVenueSeatLink（INV-2: リンク可否の実体不一致）', () => {
  it('席クラスON(seatLinkOn=true)なのにタイル実体がSPANなら affordanceMismatch', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 4,
      mirrorUid: '333333',
      rosterUid: '333333',
      seatLinkOn: true,
      tileTag: 'SPAN',
      tileHref: '',
      mode: 'mirror',
      wallNow: 3000
    });
    expect(state.affordanceMismatch).toBe(1);
    expect(state.lastSample?.kind).toContain('tag');
  });

  it('席クラスOFF(seatLinkOn=false)なのにタイル実体がAなら affordanceMismatch', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 5,
      mirrorUid: 'a:anon2',
      rosterUid: 'a:anon2',
      seatLinkOn: false,
      tileTag: 'A',
      tileHref: 'https://www.nicovideo.jp/user/999999',
      mode: 'mirror',
      wallNow: 3000
    });
    expect(state.affordanceMismatch).toBe(1);
  });
});

describe('observeVenueSeatLink（INV-3: href鮮度）', () => {
  it('タイルがAでhrefが別人のuidを指していれば hrefStale', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 6,
      mirrorUid: '444444',
      rosterUid: '444444',
      seatLinkOn: true,
      tileTag: 'A',
      tileHref: 'https://www.nicovideo.jp/user/999999',
      mode: 'mirror',
      wallNow: 4000
    });
    expect(state.hrefStale).toBe(1);
    expect(state.lastSample?.kind).toContain('href');
  });

  it('hrefが今回の鏡uidと一致していれば hrefStale は増えない', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 7,
      mirrorUid: '555555',
      rosterUid: '555555',
      seatLinkOn: true,
      tileTag: 'A',
      tileHref: 'https://www.nicovideo.jp/user/555555',
      mode: 'mirror',
      wallNow: 4000
    });
    expect(state.hrefStale).toBe(0);
  });

  it('hrefがマッチしない形式(相対パス等)は fail-open でカウントしない', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 8,
      mirrorUid: '666666',
      rosterUid: '666666',
      seatLinkOn: true,
      tileTag: 'A',
      tileHref: '#',
      mode: 'mirror',
      wallNow: 4000
    });
    expect(state.hrefStale).toBe(0);
  });
});

describe('beginVenueSeatLinkPaint / badPaints の1paint1回計上', () => {
  it('同一paint内で複数の不一致が起きても badPaints は1回だけ増える', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 0, mirrorUid: '1', rosterUid: '2', seatLinkOn: true, tileTag: 'A',
      tileHref: '', mode: 'mirror', wallNow: 1
    });
    observeVenueSeatLink(state, {
      seatIndex: 1, mirrorUid: '3', rosterUid: '4', seatLinkOn: true, tileTag: 'A',
      tileHref: '', mode: 'mirror', wallNow: 1
    });
    expect(state.uidMismatch).toBe(2);
    expect(state.badPaints).toBe(1);
  });

  it('次のpaintで再度不一致が起きればbadPaintsはさらに増える', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 0, mirrorUid: '1', rosterUid: '2', seatLinkOn: true, tileTag: 'A',
      tileHref: '', mode: 'mirror', wallNow: 1
    });
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 0, mirrorUid: '1', rosterUid: '2', seatLinkOn: true, tileTag: 'A',
      tileHref: '', mode: 'mirror', wallNow: 2
    });
    expect(state.badPaints).toBe(2);
    expect(state.paints).toBe(2);
  });

  it('paintsはbeginVenueSeatLinkPaintの呼び出し回数を数える', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    beginVenueSeatLinkPaint(state);
    beginVenueSeatLinkPaint(state);
    expect(state.paints).toBe(3);
  });
});

describe('lastSample（直近1件保持・上書き）', () => {
  it('複数回の不一致で最後の1件だけが残る', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 10, mirrorUid: '111', rosterUid: '222', seatLinkOn: true, tileTag: 'A',
      tileHref: '', mode: 'mirror', wallNow: 100
    });
    observeVenueSeatLink(state, {
      seatIndex: 20, mirrorUid: '333', rosterUid: '444', seatLinkOn: true, tileTag: 'A',
      tileHref: '', mode: 'fallback', wallNow: 200
    });
    expect(state.lastSample?.seatIndex).toBe(20);
    expect(state.lastSample?.mirrorUid).toBe('333');
    expect(state.lastSample?.mode).toBe('fallback');
  });
});

describe('observeVenueSeatLink（正常スキップ系: タイル未検出）', () => {
  it('tileTagが空文字なら checked にも入れない(空可視はvenueDomCensusの縄張り)', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 9,
      mirrorUid: '777777',
      rosterUid: '777777',
      seatLinkOn: true,
      tileTag: '',
      tileHref: '',
      mode: 'mirror',
      wallNow: 5000
    });
    expect(state.checked).toBe(0);
  });
});

describe('toVenueSeatLinkParityDiag', () => {
  it('checked=0は⚪未観測', () => {
    const state = createVenueSeatLinkParityState();
    const diag = toVenueSeatLinkParityDiag(state, 1000);
    expect(diag.line).toBe('席リンク一致 ⚪ 未観測');
  });

  it('不一致ゼロは✅', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 0, mirrorUid: '1', rosterUid: '1', seatLinkOn: false, tileTag: 'SPAN',
      tileHref: '', mode: 'mirror', wallNow: 1000
    });
    const diag = toVenueSeatLinkParityDiag(state, 1000);
    expect(diag.line).toContain('✅');
    expect(diag.line).toContain('検1');
  });

  it('不一致ありは🔴+件数+直近サンプルを1行に含む', () => {
    const state = createVenueSeatLinkParityState();
    beginVenueSeatLinkPaint(state);
    observeVenueSeatLink(state, {
      seatIndex: 5, mirrorUid: '111111', rosterUid: '222222', seatLinkOn: true, tileTag: 'A',
      tileHref: '', mode: 'mirror', wallNow: 1000
    });
    const diag = toVenueSeatLinkParityDiag(state, 5000);
    expect(diag.line).toContain('🔴');
    expect(diag.line).toContain('uid≠1');
    expect(diag.line).toContain('席5');
    expect(diag.checked).toBe(1);
    expect(diag.uidMismatch).toBe(1);
  });

  it('壊れたstateでも例外を投げずnullを返す', () => {
    expect(toVenueSeatLinkParityDiag(null, 1000)).toBeNull();
    expect(toVenueSeatLinkParityDiag(undefined, 1000)).toBeNull();
  });
});
