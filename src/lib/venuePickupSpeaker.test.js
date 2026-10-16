import { describe, expect, it } from 'vitest';
import { resolvePickupSpeaker } from './venuePickupSpeaker.js';
import { appendPickupRows } from './venuePickupRing.js';
import { applyVenuePickupView, buildVenuePickupView, createVenuePickupBanner } from './venuePickupBanner.js';
import { pickTickerHighlightEntry } from './pickTickerHighlight.js';

/** 2026-10-17: ピックアップ枠の発言者表示(サムネ・ハンドル名・ID・リンクをセットで・§3.5)。 */
const NOW = 1_700_000_000_000;

describe('resolvePickupSpeaker', () => {
  it('★数値ID: ハンドル名・ID・ユーザーページのリンク・公式パターンのサムネ(+代替顔)', () => {
    const s = resolvePickupSpeaker({ userId: '19707371', name: 'キリン' });
    expect(s).toMatchObject({ uid: '19707371', anon: false, name: 'キリン', idLine: 'ID:19707371', href: 'https://www.nicovideo.jp/user/19707371' });
    expect(s.avatar).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1970/19707371.jpg');
    expect(s.fallbackAvatar).toMatch(/^data:image\/svg\+xml/);
  });
  it('★観測済みのプロフィールのサムネ(http)があれば導出URLより優先', () => {
    const s = resolvePickupSpeaker({ userId: '19707371', name: 'a' }, { profileAvatarUrl: 'https://img.example/k.jpg' });
    expect(s.avatar).toBe('https://img.example/k.jpg');
    expect(resolvePickupSpeaker({ userId: '19707371', name: 'a' }, { profileAvatarUrl: 'data:xx' }).avatar).toMatch(/usericon/);
  });
  it('★発言行に名前が無い(NDGR)ときは、観測済みプロフィールのハンドルネームを使う', () => {
    expect(resolvePickupSpeaker({ userId: '19707371', name: '' }, { profileNickname: 'キリン' }).name).toBe('キリン');
    expect(resolvePickupSpeaker({ userId: '19707371', name: '行の名前' }, { profileNickname: 'キリン' }).name).toBe('行の名前');
  });
  it('★匿名: 「匿名NNN」・identicon・IDもリンクも出さない(捏造しない)', () => {
    const s = resolvePickupSpeaker({ userId: 'a:xYz12345', name: '匿名' });
    expect(s.anon).toBe(true);
    expect(s.name).toMatch(/^匿名\d+/);
    expect(s.idLine).toBe('');
    expect(s.href).toBe('');
    expect(s.avatar).toMatch(/^data:image\/svg\+xml/);
  });
  it('uid も名前も無い入力でも落ちず、匿名として扱う', () => {
    expect(resolvePickupSpeaker(null).anon).toBe(true);
    expect(resolvePickupSpeaker({}).name).toMatch(/^匿名/);
  });
});

describe('枠への配線(リング→選定→表示)', () => {
  const ring = appendPickupRows([], [{ key: 'k1', userId: '19707371', name: 'キリン', text: 'こんばんは今日も楽しい' }], NOW - 1000, { resolveSpeaker: (sp) => resolvePickupSpeaker(sp) });
  it('★リングの行が発言者の情報セットを持ち、枠の view に載る(本文の下に「ハンドル名 ・ ID」)', () => {
    expect(ring[0].speaker.idLine).toBe('ID:19707371');
    const view = buildVenuePickupView(pickTickerHighlightEntry(ring, NOW));
    expect(view.text).toBe('こんばんは今日も楽しい');
    expect(view.meta).toBe('キリン ・ ID:19707371');
    expect(view.speaker.href).toBe('https://www.nicovideo.jp/user/19707371');
  });
  it('resolveSpeaker が無い/例外でも行は積める(speaker は null=従来の表示)', () => {
    const r1 = appendPickupRows([], [{ key: 'k', userId: 'u', name: 'n', text: 'あいうえお' }], NOW);
    expect(r1[0].speaker).toBeNull();
    const r2 = appendPickupRows([], [{ key: 'k', userId: 'u', name: 'n', text: 'あいうえお' }], NOW, { resolveSpeaker: () => { throw new Error('x'); } });
    expect(r2).toHaveLength(1);
    expect(buildVenuePickupView(pickTickerHighlightEntry(r1, NOW)).meta).toBe('n');
  });
  it('★DOM: サムネ(src)・meta のリンク(href)が付き、匿名では href を外す・サムネ無しは隠す', () => {
    const mk = () => ({ className: '', textContent: '', dataset: {}, children: [], attrs: {}, append(...k) { this.children.push(...k); }, setAttribute(a, v) { this.attrs[a] = String(v); }, removeAttribute(a) { delete this.attrs[a]; } });
    const els = createVenuePickupBanner(/** @type {any} */ ({ createElement: mk }));
    expect(els.face.attrs.hidden).toBe(''); // 初期は隠す
    applyVenuePickupView(els, buildVenuePickupView(pickTickerHighlightEntry(ring, NOW)));
    expect(els.face.attrs.src).toMatch(/usericon/);
    expect('hidden' in els.face.attrs).toBe(false);
    expect(els.meta.textContent).toBe('キリン ・ ID:19707371');
    expect(els.meta.attrs.href).toBe('https://www.nicovideo.jp/user/19707371');
    const anon = appendPickupRows([], [{ key: 'a', userId: 'a:xYz12345', name: '匿名', text: '匿名のコメント' }], NOW - 500, { resolveSpeaker: (sp) => resolvePickupSpeaker(sp) });
    applyVenuePickupView(els, buildVenuePickupView(pickTickerHighlightEntry(anon, NOW)));
    expect('href' in els.meta.attrs).toBe(false);
    expect(els.face.attrs.src).toMatch(/^data:image\/svg/);
    applyVenuePickupView(els, buildVenuePickupView(null));
    expect(els.face.attrs.hidden).toBe('');
  });
});
