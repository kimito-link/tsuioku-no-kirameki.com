/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  readVenueTileThumbState,
  buildVenueHoverCardModel,
  createVenueHoverCardEl,
  renderVenueHoverCard,
  resolveVenueHoverCardPlacement
} from './venueHoverCard.js';

/**
 * venueHoverCard.js — 会場アイコンのホバープレビューカード(純ロジック+DOMビルダー)。
 * 設計正本: venue-avatar-hover-preview-DESIGN系(wayfinder→to-spec方式・SPEC.md §4.1)。
 * buildPersonTileEl(personTileDom.js)は一切変更しない・新しいID判定ロジックは作らない。
 */

describe('readVenueTileThumbState', () => {
  function makeCell({ src = '', tvFallback = false, complete = true, naturalWidth = 64 } = {}) {
    const cell = document.createElement('a');
    cell.className = 'nl-story-userlane-cell';
    const img = document.createElement('img');
    img.className = 'nl-story-userlane-avatar';
    if (tvFallback) img.classList.add('nl-avatar--tv-fallback');
    img.src = src;
    Object.defineProperty(img, 'complete', { value: complete, configurable: true });
    Object.defineProperty(img, 'naturalWidth', { value: naturalWidth, configurable: true });
    cell.appendChild(img);
    return cell;
  }

  it('data:image/svg+xml は identicon と判定する', () => {
    const cell = makeCell({ src: 'data:image/svg+xml;base64,ABC' });
    const state = readVenueTileThumbState(cell);
    expect(state.kind).toBe('identicon');
    expect(state.load).toBe('ok');
  });

  it('nl-avatar--tv-fallback クラスは tv-fallback と判定する', () => {
    const cell = makeCell({ src: 'https://example.test/tv.png', tvFallback: true });
    const state = readVenueTileThumbState(cell);
    expect(state.kind).toBe('tv-fallback');
  });

  it('http(s) URL(tv-fallbackでもidenticonでもない)は real-http と判定する', () => {
    const cell = makeCell({ src: 'https://example.test/real.png' });
    const state = readVenueTileThumbState(cell);
    expect(state.kind).toBe('real-http');
  });

  it('complete かつ naturalWidth=0 は failed(白丸)と判定する', () => {
    const cell = makeCell({ src: 'https://example.test/broken.png', complete: true, naturalWidth: 0 });
    const state = readVenueTileThumbState(cell);
    expect(state.load).toBe('failed');
  });

  it('未complete(読み込み中)は loading と判定する', () => {
    const cell = makeCell({ src: 'https://example.test/slow.png', complete: false, naturalWidth: 0 });
    const state = readVenueTileThumbState(cell);
    expect(state.load).toBe('loading');
  });

  it('complete かつ naturalWidth>0 は ok と判定する', () => {
    const cell = makeCell({ src: 'https://example.test/ok.png', complete: true, naturalWidth: 64 });
    const state = readVenueTileThumbState(cell);
    expect(state.load).toBe('ok');
  });

  it('imgの無いセル/nullでも落ちず kind=none load=loading を返す(観測のみ・例外を投げない)', () => {
    const emptyCell = document.createElement('span');
    expect(readVenueTileThumbState(emptyCell).kind).toBe('none');
    expect(readVenueTileThumbState(null).kind).toBe('none');
    expect(readVenueTileThumbState(undefined).kind).toBe('none');
  });
});

describe('buildVenueHoverCardModel', () => {
  const baseThumb = { src: 'https://example.test/a.png', kind: 'real-http', load: 'ok' };

  it('数値ID(5〜14桁)は idKind=registered になり「本登録」ラベルが付く', () => {
    const model = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'たろう', count: 3, hasGift: false, giftCount: 0, venueRank: 0, thumb: baseThumb
    });
    expect(model.idKind).toBe('registered');
    expect(model.idLine).toContain('本登録');
    expect(model.idLine).toContain('12345678');
  });

  it('本登録の境界: 4桁以下/15桁以上は registered にしない(personTileDom.jsと同じisNumericNicoUserId基準)', () => {
    const tooShort = buildVenueHoverCardModel({
      uid: '1234', displayName: 'x', count: 0, hasGift: false, giftCount: 0, venueRank: 0, thumb: baseThumb
    });
    expect(tooShort.idKind).not.toBe('registered');
    const tooLong = buildVenueHoverCardModel({
      uid: '123456789012345', displayName: 'x', count: 0, hasGift: false, giftCount: 0, venueRank: 0, thumb: baseThumb
    });
    expect(tooLong.idKind).not.toBe('registered');
  });

  it('匿名(a:xxx)は idKind=anonymous でカード情報自体は全部出る(全員主役)', () => {
    const model = buildVenueHoverCardModel({
      uid: 'a:xyz', displayName: '匿名さん', count: 5, hasGift: true, giftCount: 1, venueRank: 0, thumb: baseThumb
    });
    expect(model.idKind).toBe('anonymous');
    expect(model.idLine).toContain('匿名');
    expect(model.displayName).toBe('匿名さん');
    expect(model.statLine).toContain('5');
  });

  it('uidが空ならidKind=noneでも情報は出る', () => {
    const model = buildVenueHoverCardModel({
      uid: '', displayName: '名無し', count: 1, hasGift: false, giftCount: 0, venueRank: 0, thumb: baseThumb
    });
    expect(model.idKind).toBe('none');
    expect(model.displayName).toBe('名無し');
  });

  it('load!==ok の http サムネは avatarSrc を空にする(失敗URLの野良再プローブ禁止)', () => {
    const failedModel = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'x', count: 0, hasGift: false, giftCount: 0, venueRank: 0,
      thumb: { src: 'https://example.test/broken.png', kind: 'real-http', load: 'failed' }
    });
    expect(failedModel.avatarSrc).toBe('');
    const okModel = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'x', count: 0, hasGift: false, giftCount: 0, venueRank: 0,
      thumb: { src: 'https://example.test/ok.png', kind: 'real-http', load: 'ok' }
    });
    expect(okModel.avatarSrc).toBe('https://example.test/ok.png');
  });

  it('identicon/tv-fallback はload状態に関わらずavatarSrcをそのまま出す(生成物でありネットワーク先ではない)', () => {
    const model = buildVenueHoverCardModel({
      uid: 'a:xyz', displayName: 'x', count: 0, hasGift: false, giftCount: 0, venueRank: 0,
      thumb: { src: 'data:image/svg+xml;base64,ABC', kind: 'identicon', load: 'ok' }
    });
    expect(model.avatarSrc).toBe('data:image/svg+xml;base64,ABC');
  });

  it('venueRank 1〜3 だけ statLine に順位が入り、0/4以上では入らない', () => {
    const rank1 = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'x', count: 1, hasGift: false, giftCount: 0, venueRank: 1, thumb: baseThumb
    });
    expect(rank1.statLine).toContain('🥇');
    const rank2 = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'x', count: 1, hasGift: false, giftCount: 0, venueRank: 2, thumb: baseThumb
    });
    expect(rank2.statLine).toContain('🥈');
    const rank3 = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'x', count: 1, hasGift: false, giftCount: 0, venueRank: 3, thumb: baseThumb
    });
    expect(rank3.statLine).toContain('🥉');
    const rank0 = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'x', count: 1, hasGift: false, giftCount: 0, venueRank: 0, thumb: baseThumb
    });
    expect(rank0.statLine).not.toMatch(/[🥇🥈🥉]/u);
    const rank4 = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'x', count: 1, hasGift: false, giftCount: 0, venueRank: 4, thumb: baseThumb
    });
    expect(rank4.statLine).not.toMatch(/[🥇🥈🥉]/u);
  });

  it('hasGift=trueならギフト件数がstatLineに入る', () => {
    const model = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'x', count: 1, hasGift: true, giftCount: 3, venueRank: 0, thumb: baseThumb
    });
    expect(model.statLine).toContain('3');
  });

  it('hasGift=falseならギフト言及なし', () => {
    const model = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'x', count: 1, hasGift: false, giftCount: 0, venueRank: 0, thumb: baseThumb
    });
    expect(model.statLine).not.toContain('🎁');
  });

  it('thumbStatusLabelがkind/loadの組み合わせごとに人間可読な文言を返す', () => {
    expect(buildVenueHoverCardModel({
      uid: '1', displayName: 'x', count: 0, hasGift: false, giftCount: 0, venueRank: 0,
      thumb: { src: 'https://x', kind: 'real-http', load: 'ok' }
    }).thumbStatusLabel).toContain('実サムネ');
    expect(buildVenueHoverCardModel({
      uid: '1', displayName: 'x', count: 0, hasGift: false, giftCount: 0, venueRank: 0,
      thumb: { src: 'https://x', kind: 'real-http', load: 'failed' }
    }).thumbStatusLabel).toContain('失敗');
    expect(buildVenueHoverCardModel({
      uid: '1', displayName: 'x', count: 0, hasGift: false, giftCount: 0, venueRank: 0,
      thumb: { src: '', kind: 'none', load: 'loading' }
    }).thumbStatusLabel).toContain('読み込み中');
    expect(buildVenueHoverCardModel({
      uid: '1', displayName: 'x', count: 0, hasGift: false, giftCount: 0, venueRank: 0,
      thumb: { src: 'data:image/svg+xml;x', kind: 'identicon', load: 'ok' }
    }).thumbStatusLabel).toContain('代替顔');
    expect(buildVenueHoverCardModel({
      uid: '1', displayName: 'x', count: 0, hasGift: false, giftCount: 0, venueRank: 0,
      thumb: { src: 'https://x', kind: 'tv-fallback', load: 'ok' }
    }).thumbStatusLabel).toContain('公式デフォルト');
  });

  it('不正入力(undefined/null相当のフィールド)でも落ちない', () => {
    expect(() => buildVenueHoverCardModel({})).not.toThrow();
    const model = buildVenueHoverCardModel({});
    expect(model.idKind).toBe('none');
  });
});

describe('resolveVenueHoverCardPlacement', () => {
  const viewport = { width: 1280, height: 800 };

  it('上に十分な余白があれば placement=above になる', () => {
    const result = resolveVenueHoverCardPlacement({
      anchor: { left: 500, top: 300, width: 48, height: 48 },
      card: { width: 200, height: 150 },
      viewport
    });
    expect(result.placement).toBe('above');
    expect(result.top).toBeLessThan(300);
  });

  it('上に入らないとき placement=below にフリップする', () => {
    const result = resolveVenueHoverCardPlacement({
      anchor: { left: 500, top: 10, width: 48, height: 48 },
      card: { width: 200, height: 150 },
      viewport
    });
    expect(result.placement).toBe('below');
    expect(result.top).toBeGreaterThan(10);
  });

  it('左端で viewport 内にクランプされる(margin既定8px)', () => {
    const result = resolveVenueHoverCardPlacement({
      anchor: { left: 2, top: 300, width: 48, height: 48 },
      card: { width: 200, height: 150 },
      viewport
    });
    expect(result.left).toBeGreaterThanOrEqual(8);
  });

  it('右端で viewport 内にクランプされる', () => {
    const result = resolveVenueHoverCardPlacement({
      anchor: { left: 1270, top: 300, width: 48, height: 48 },
      card: { width: 200, height: 150 },
      viewport
    });
    expect(result.left + 200).toBeLessThanOrEqual(1280 - 8 + 0.001);
  });

  it('anchor/card/viewportが不正でも例外を投げず有限の座標を返す', () => {
    const result = resolveVenueHoverCardPlacement({});
    expect(Number.isFinite(result.left)).toBe(true);
    expect(Number.isFinite(result.top)).toBe(true);
  });
});

describe('createVenueHoverCardEl / renderVenueHoverCard', () => {
  it('カードDOM構造(クラス・子順序)を持つ', () => {
    const doc = document;
    const cardEl = createVenueHoverCardEl(doc);
    expect(cardEl.className).toBe('nlsb-hover-card');
    const avatarBox = cardEl.querySelector('.nlsb-hover-card__avatar-box');
    expect(avatarBox).toBeTruthy();
    expect(avatarBox.querySelector('.nlsb-hover-card__avatar')).toBeTruthy();
    expect(cardEl.querySelector('.nlsb-hover-card__body')).toBeTruthy();
    expect(cardEl.querySelector('.nlsb-hover-card__name')).toBeTruthy();
    expect(cardEl.querySelector('.nlsb-hover-card__id')).toBeTruthy();
    expect(cardEl.querySelector('.nlsb-hover-card__stats')).toBeTruthy();
    expect(cardEl.querySelector('.nlsb-hover-card__thumb-status')).toBeTruthy();
  });

  it('renderVenueHoverCardはモデルの中身をDOMへ反映する', () => {
    const cardEl = createVenueHoverCardEl(document);
    const model = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'たろう', count: 3, hasGift: true, giftCount: 2, venueRank: 1,
      thumb: { src: 'https://example.test/a.png', kind: 'real-http', load: 'ok' }
    });
    renderVenueHoverCard(cardEl, model);
    expect(cardEl.querySelector('.nlsb-hover-card__name').textContent).toBe('たろう');
    expect(cardEl.querySelector('.nlsb-hover-card__id').textContent).toContain('本登録');
    expect(cardEl.querySelector('.nlsb-hover-card__avatar').src).toContain('example.test/a.png');
    expect(cardEl.dataset.thumbKind).toBe('real-http');
    expect(cardEl.dataset.thumbLoad).toBe('ok');
  });

  it('avatarSrcが空ならavatar imgをhiddenにする', () => {
    const cardEl = createVenueHoverCardEl(document);
    const model = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'x', count: 0, hasGift: false, giftCount: 0, venueRank: 0,
      thumb: { src: 'https://example.test/broken.png', kind: 'real-http', load: 'failed' }
    });
    renderVenueHoverCard(cardEl, model);
    expect(cardEl.querySelector('.nlsb-hover-card__avatar').hidden).toBe(true);
  });

  it('2回目のrenderでノードを再生成しない(同一要素の中身差し替え)', () => {
    const cardEl = createVenueHoverCardEl(document);
    const nameEl1 = cardEl.querySelector('.nlsb-hover-card__name');
    renderVenueHoverCard(cardEl, buildVenueHoverCardModel({
      uid: '1', displayName: 'A', count: 0, hasGift: false, giftCount: 0, venueRank: 0,
      thumb: { src: '', kind: 'none', load: 'loading' }
    }));
    renderVenueHoverCard(cardEl, buildVenueHoverCardModel({
      uid: '2', displayName: 'B', count: 0, hasGift: false, giftCount: 0, venueRank: 0,
      thumb: { src: '', kind: 'none', load: 'loading' }
    }));
    const nameEl2 = cardEl.querySelector('.nlsb-hover-card__name');
    expect(nameEl1).toBe(nameEl2);
    expect(nameEl2.textContent).toBe('B');
  });
});
