// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  collectVenueLaneDomCensus,
  countVenueKeyDuplicates,
  venueDomCensusToParityDom,
  VENUE_CENSUS_SECTIONS
} from './venueDomCensus.js';

/** @param {string} [key] userKey('' や省略=無鍵) */
function makeTile(key) {
  const tile = document.createElement('div');
  tile.className = 'nl-story-userlane-cell';
  if (key) tile.dataset.userKey = key;
  return tile;
}

/** @param {{ empty?: boolean, tile?: HTMLElement|null }} [opts] */
function makeSeat(opts = {}) {
  const seat = document.createElement('div');
  seat.className = `nlsb-seat${opts.empty ? ' nlsb-is-empty' : ''}`;
  if (opts.tile) seat.appendChild(opts.tile);
  return seat;
}

function makeLane() {
  const lane = document.createElement('div');
  lane.className = 'nl-story-userlane';
  return lane;
}

/** 空の会場骨格(stack+5段+lobbyList)。 */
function makeVenueDom() {
  const stack = document.createElement('div');
  stack.className = 'nl-story-userlane-stack';
  /** @type {Record<string, HTMLElement>} */
  const laneEls = {};
  for (const sec of ['link', 'gift', 'ad', 'konta', 'tanu']) {
    laneEls[sec] = makeLane();
    stack.appendChild(laneEls[sec]);
  }
  const lobbyList = document.createElement('div');
  lobbyList.className = 'nlsb-lobby-list';
  return { stack, laneEls, lobbyList };
}

describe('collectVenueLaneDomCensus', () => {
  it('席収容タイル+裸タイルを可視として数え、keys を文書順で返す', () => {
    const { stack, laneEls, lobbyList } = makeVenueDom();
    laneEls.tanu.appendChild(makeSeat({ tile: makeTile('u:1') }));
    laneEls.tanu.appendChild(makeSeat({ tile: makeTile('u:2') }));
    laneEls.tanu.appendChild(makeTile('c:#1|広告')); // 素通し裸タイル(.nlsb-seat 管理外)
    const c = collectVenueLaneDomCensus({ laneEls, lobbyList, stackEl: stack });
    expect(c.perSection.tanu.visible).toBe(3);
    expect(c.perSection.tanu.bare).toBe(1);
    expect(c.perSection.tanu.keys).toEqual(['u:1', 'u:2', 'c:#1|広告']);
    expect(c.perSection.link.visible).toBe(0);
  });

  it('幽霊(is-empty なのに中身あり)は可視に入れず ghost に数える(消し残り予備軍)', () => {
    const { stack, laneEls, lobbyList } = makeVenueDom();
    laneEls.tanu.appendChild(makeSeat({ tile: makeTile('u:1') }));
    laneEls.tanu.appendChild(makeSeat({ empty: true, tile: makeTile('u:ghost') }));
    const c = collectVenueLaneDomCensus({ laneEls, lobbyList, stackEl: stack });
    expect(c.perSection.tanu.visible).toBe(1);
    expect(c.perSection.tanu.ghost).toBe(1);
    expect(c.perSection.tanu.keys).toEqual(['u:1']); // 幽霊の key は可視 keys に入れない
  });

  it('空可視(席は可視なのにタイル無し)=白円空白の再演を数える', () => {
    const { stack, laneEls, lobbyList } = makeVenueDom();
    laneEls.link.appendChild(makeSeat({})); // タイルの無い可視席
    laneEls.link.appendChild(makeSeat({ empty: true })); // 正常な空席(不可視)は数えない
    const c = collectVenueLaneDomCensus({ laneEls, lobbyList, stackEl: stack });
    expect(c.perSection.link.visibleEmpty).toBe(1);
    expect(c.perSection.link.ghost).toBe(0);
  });

  it('無鍵(dataset.userKey 無し)の可視タイルは unkeyed に数え keys に入れない', () => {
    const { stack, laneEls, lobbyList } = makeVenueDom();
    laneEls.konta.appendChild(makeSeat({ tile: makeTile('') }));
    laneEls.konta.appendChild(makeSeat({ tile: makeTile('u:9') }));
    const c = collectVenueLaneDomCensus({ laneEls, lobbyList, stackEl: stack });
    expect(c.perSection.konta.visible).toBe(2);
    expect(c.perSection.konta.unkeyed).toBe(1);
    expect(c.perSection.konta.keys).toEqual(['u:9']);
  });

  it('ロビーも同じ規則で数える(lobby セクション)', () => {
    const { stack, laneEls, lobbyList } = makeVenueDom();
    lobbyList.appendChild(makeSeat({ tile: makeTile('u:8') }));
    lobbyList.appendChild(makeTile('u:7')); // 席なし素通し(paintVenueLobby の node 無し経路)
    const c = collectVenueLaneDomCensus({ laneEls, lobbyList, stackEl: stack });
    expect(c.perSection.lobby.visible).toBe(2);
    expect(c.perSection.lobby.bare).toBe(1);
    expect(c.perSection.lobby.keys).toEqual(['u:8', 'u:7']);
  });

  it('迷子(stack 配下だが5段のどれにも属さないタイル)を strays に数える', () => {
    const { stack, laneEls, lobbyList } = makeVenueDom();
    stack.appendChild(makeTile('u:lost')); // 段の外に直接置かれたタイル
    const c = collectVenueLaneDomCensus({ laneEls, lobbyList, stackEl: stack });
    expect(c.strays).toBe(1);
    expect(c.perSection.tanu.visible).toBe(0);
  });

  it('スコープ固定: topBar 等スコープ外のタイルは数に入らない(誤カウントしない)', () => {
    const { stack, laneEls, lobbyList } = makeVenueDom();
    const host = document.createElement('div');
    host.appendChild(stack);
    const topBar = document.createElement('div');
    topBar.className = 'nlsb-topbar-list';
    topBar.appendChild(makeTile('u:top1'));
    host.appendChild(topBar); // stack の外(兄弟)=走査スコープ外
    laneEls.tanu.appendChild(makeSeat({ tile: makeTile('u:1') }));
    const c = collectVenueLaneDomCensus({ laneEls, lobbyList, stackEl: stack });
    const totalVisible = VENUE_CENSUS_SECTIONS.reduce((a, s) => a + c.perSection[s].visible, 0);
    expect(totalVisible).toBe(1); // topBar の u:top1 は入らない
    expect(c.strays).toBe(0);
  });

  it('額縁/群衆は extras の参考値として写す(判定はしない)', () => {
    const { stack, laneEls, lobbyList } = makeVenueDom();
    const charFrameLayer = document.createElement('div');
    for (let i = 0; i < 12; i += 1) charFrameLayer.appendChild(document.createElement('img'));
    const c = collectVenueLaneDomCensus({
      laneEls,
      lobbyList,
      stackEl: stack,
      extras: { charFrameLayer, crowdOn: true, crowdCount: 154 }
    });
    expect(c.charFrameTiles).toBe(12);
    expect(c.crowdOn).toBe(true);
    expect(c.crowdCount).toBe(154);
  });

  it('要素が無くても throw しない(全セクション0)', () => {
    const c = collectVenueLaneDomCensus({});
    for (const sec of VENUE_CENSUS_SECTIONS) expect(c.perSection[sec].visible).toBe(0);
    expect(c.strays).toBe(0);
    expect(c.charFrameTiles).toBe(0);
  });
});

describe('countVenueKeyDuplicates', () => {
  it('同一段内の二重占有=dupIntra / 段×段=dupCross / 段×ロビー=dupLaneLobby', () => {
    const dup = countVenueKeyDuplicates({
      link: { keys: ['u:1', 'u:1'] }, // 同一段で2回=dupIntra 1
      gift: { keys: [] },
      ad: { keys: ['u:2'] },
      konta: { keys: ['u:2'] }, // ad と konta に居る=dupCross 1
      tanu: { keys: ['u:3'] },
      lobby: { keys: ['u:3'] } // 段とロビーの二重在籍=dupLaneLobby 1
    });
    expect(dup).toEqual({ dupIntra: 1, dupCross: 1, dupLaneLobby: 1 });
  });

  it('重複が無ければ全部0', () => {
    const dup = countVenueKeyDuplicates({
      link: { keys: ['u:1'] },
      tanu: { keys: ['u:2'] },
      lobby: { keys: ['u:3'] }
    });
    expect(dup).toEqual({ dupIntra: 0, dupCross: 0, dupLaneLobby: 0 });
  });
});

describe('venueDomCensusToParityDom', () => {
  it('keys を落とし(PII/容量)、重複を集計し、measured:true を明示する', () => {
    const { stack, laneEls, lobbyList } = makeVenueDom();
    laneEls.tanu.appendChild(makeSeat({ tile: makeTile('u:1') }));
    laneEls.tanu.appendChild(makeTile('u:1')); // 裸+同段重複
    laneEls.tanu.appendChild(makeSeat({ empty: true, tile: makeTile('u:g') })); // 幽霊
    lobbyList.appendChild(makeSeat({ tile: makeTile('u:1') })); // 段×ロビー二重
    const dom = venueDomCensusToParityDom(
      collectVenueLaneDomCensus({ laneEls, lobbyList, stackEl: stack })
    );
    expect(dom.measured).toBe(true);
    expect(dom.perSection.tanu.visible).toBe(2);
    expect(dom.perSection.tanu).not.toHaveProperty('keys');
    expect(dom.ghost).toBe(1);
    expect(dom.bare).toBe(1);
    expect(dom.dupIntra).toBe(1);
    expect(dom.dupLaneLobby).toBe(1);
  });

  it('census が無ければ null(fail-closed: 判定側は DOM未計測=⚪)', () => {
    expect(venueDomCensusToParityDom(null)).toBeNull();
    expect(venueDomCensusToParityDom(undefined)).toBeNull();
  });
});
