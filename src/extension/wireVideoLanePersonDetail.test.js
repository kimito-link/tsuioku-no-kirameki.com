import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { buildViewerBehaviorBoard, viewerBehaviorBoardInnerHtml } from '../lib/viewerBehavior.js';
import { hydrateViewerBehaviorLiveLayout } from './viewerBehaviorLiveLayout.js';
import { wireVideoLanePersonDetail } from './wireVideoLanePersonDetail.js';
import { wireLaneUserDetailOpen } from './popup/wireLaneUserDetailOpen.js';

const NOW = Date.parse('2026-11-26T10:37:00+09:00');
const FIRST = Date.parse('2026-11-03T12:00:00+09:00');
const ID = 'UCaaaaaaaaaaaaaaaaaaaaaa';

function setup(kind) {
  const win = new Window();
  const doc = win.document;
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const created = [];
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.Element = win.Element;
  globalThis.MouseEvent = win.MouseEvent;
  globalThis.chrome = {
    runtime: { getURL: (p) => `chrome-extension://ID/${p}` },
    windows: { create: vi.fn((opts) => { created.push(opts); return Promise.resolve({}); }) },
  };
  const board = buildViewerBehaviorBoard({
    nowMs: NOW,
    historyReady: true,
    contentKind: kind,
    visiblePeople: [{
      id: ID,
      name: '花子',
      commentCount: 2,
      giftCount: 1,
      knownAmountJpy: 500,
      pending: true,
      viewerReplies: [{ name: '@viewer', kind: 'viewer', id: 'UCbbbbbbbbbbbbbbbbbbbbbb' }],
    }],
    historyById: { [ID]: { name: '花子', commentCount: 8, liveVisits: 2, seenLive: true, firstAt: FIRST, lastAt: NOW } },
  });
  doc.body.innerHTML = `<div id="box" class="nlsb-video-watch-card">${viewerBehaviorBoardInnerHtml(board)}</div>`;
  const box = doc.getElementById('box');
  box.__nlsbBoard = board;
  hydrateViewerBehaviorLiveLayout(box, board, { document: doc });
  const prevEl = globalThis.Element;
  const prevME = globalThis.MouseEvent;
  return { win, doc, box, board, created, restore() {
    globalThis.window = prevWin;
    globalThis.document = prevDoc;
    globalThis.Element = prevEl;
    globalThis.MouseEvent = prevME;
    delete globalThis.chrome;
  } };
}

describe('通常動画のサムネイルは、横の欄の詳細を開き、発言一覧はリンクからだけ', () => {
  afterEach(() => {
    delete globalThis.chrome;
  });

  it('動画のタイルを押しても発言一覧の窓は開かず、なじみ・来訪・返信・未対応が欄内に出る', () => {
    const ctx = setup('video');
    try {
      wireLaneUserDetailOpen(ctx.doc);
      wireVideoLanePersonDetail(ctx.box, { board: ctx.board, document: ctx.doc });
      const tile = ctx.doc.querySelector('.nl-story-userlane-cell[data-user-key="u:' + ID + '"]');
      expect(tile).toBeTruthy();
      tile.dispatchEvent(new ctx.win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      expect(ctx.created).toHaveLength(0);
      const detail = ctx.box.querySelector('.nlsb-viewer-behavior__detail');
      expect(detail.hidden).toBe(false);
      const html = detail.innerHTML;
      expect(html).toContain('花子');
      expect(html).toContain('なじみ');
      expect(html).toContain('来訪：');
      expect(html).toContain('視聴者の返信');
      expect(html).toContain('@viewer');
      expect(html).toContain('未対応');
      expect(html).toContain('発言一覧を開く');
    } finally {
      ctx.restore();
    }
  });

  it('録画のチャット再生でカードが描き直されても、開いていた人の詳細は開いたまま', () => {
    const ctx = setup('video');
    try {
      wireVideoLanePersonDetail(ctx.box, { board: ctx.board, document: ctx.doc });
      const tile = ctx.doc.querySelector('.nl-story-userlane-cell[data-user-key="u:' + ID + '"]');
      tile.dispatchEvent(new ctx.win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      // 描き直し(innerHTML の入れ替え + レーンの組み直し)
      ctx.box.innerHTML = viewerBehaviorBoardInnerHtml(ctx.board);
      hydrateViewerBehaviorLiveLayout(ctx.box, ctx.board, { document: ctx.doc });
      wireVideoLanePersonDetail(ctx.box, { board: ctx.board, document: ctx.doc });
      const detail = ctx.box.querySelector('.nlsb-viewer-behavior__detail');
      expect(detail.hidden).toBe(false);
      expect(detail.innerHTML).toContain('花子');
    } finally {
      ctx.restore();
    }
  });

  it('返信を読めないサービス(Twitch の録画など)では、「投稿者の返信 なし」を出さない', () => {
    const ctx = setup('video');
    try {
      const board = { ...ctx.board, platform: 'twitch', rows: ctx.board.rows.map((r) => ({ ...r, creatorReplies: [], viewerReplies: [] })) };
      wireVideoLanePersonDetail(ctx.box, { board, document: ctx.doc });
      ctx.box.__nlsbBoard = board;
      const tile = ctx.doc.querySelector('.nl-story-userlane-cell[data-user-key="u:' + ID + '"]');
      tile.dispatchEvent(new ctx.win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      const html = ctx.box.querySelector('.nlsb-viewer-behavior__detail').innerHTML;
      expect(html).toContain('花子');
      expect(html).not.toContain('投稿者の返信');
      expect(html).not.toContain('なし</p>');
    } finally {
      ctx.restore();
    }
  });

  it('詳細の「発言一覧を開く」だけが、これまでと同じ comeview の窓を開く', () => {
    const ctx = setup('video');
    try {
      wireLaneUserDetailOpen(ctx.doc);
      wireVideoLanePersonDetail(ctx.box, { board: ctx.board, document: ctx.doc });
      const tile = ctx.doc.querySelector('.nl-story-userlane-cell[data-user-key="u:' + ID + '"]');
      tile.dispatchEvent(new ctx.win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      const btn = ctx.box.querySelector('[data-open-comeview]');
      btn.dispatchEvent(new ctx.win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      expect(ctx.created).toHaveLength(1);
      expect(ctx.created[0].url).toContain('comeview.html?user=' + encodeURIComponent(ID));
      expect(ctx.created[0].url).toContain('uname=');
    } finally {
      ctx.restore();
    }
  });
});

describe('ライブのタイルクリックは master と同じ（動画の配線の外）', () => {
  it('動画カードの外にある配信モードのタイルは、これまでどおり発言一覧の窓を開く', () => {
    const ctx = setup('video');
    try {
      // 配信モードと同じレーンを、動画カードの外に置く（ライブページの既存グリッドを模す）
      const liveHost = ctx.doc.createElement('div');
      liveHost.id = 'live-grid';
      ctx.doc.body.appendChild(liveHost);
      const liveBoard = ctx.board;
      liveHost.innerHTML = '<div data-live-lane-host></div>';
      hydrateViewerBehaviorLiveLayout(liveHost, liveBoard, { document: ctx.doc });
      wireLaneUserDetailOpen(ctx.doc);
      wireVideoLanePersonDetail(ctx.box, { board: ctx.board, document: ctx.doc });
      const liveTile = liveHost.querySelector('.nl-story-userlane-cell[data-user-key="u:' + ID + '"]');
      expect(liveTile).toBeTruthy();
      liveTile.dispatchEvent(new ctx.win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      expect(ctx.created).toHaveLength(1);
      expect(ctx.created[0].url).toContain('comeview.html?user=' + encodeURIComponent(ID));
      expect(ctx.box.querySelector('.nlsb-viewer-behavior__detail').hidden).toBe(true);
    } finally {
      ctx.restore();
    }
  });
});
