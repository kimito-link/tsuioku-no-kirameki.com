// @vitest-environment happy-dom
// v0.1.2268: ニコ生以外の席・タイル・カードに、内部の疑似ID(8+9桁)とニコニコのユーザーページを出さない
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { buildPersonTileEl } from '../personTileDom.js';
import {
  foreignPersonDisplay, getPersonDisplayResolver, isSafeForeignProfileUrl, resolvePersonDisplay, seatLinkFor, seatTitleFor,
  setPersonDisplayResolver, stripInternalNumericId
} from '../personDisplayResolver.js';
import { buildVenueHoverCardModel } from '../venueHoverCard.js';
import { numericUidForYtKey, ytRecordToNicoEntry } from '../../../extension-youtube/src/ytNicoShim.js';

const SHIM_RESOLVER = getPersonDisplayResolver(); // import した shim が登録したもの
const NICO_REAL = '8004919137'; // ニコ生の本物の ID(たまたま 8 + 9桁)

function io() {
  return {
    storyAvatarLoadGuard: { pickDisplaySrc: (s) => s, noteRemoteAttempt: vi.fn() },
    isHttpOrHttpsUrl: (u) => /^https?:\/\//.test(String(u)),
    storyTileUsesYukkuriTvStyle: () => false
  };
}
/** @param {string} uid @param {object} [over] */
function tile(uid, over = {}) {
  return buildPersonTileEl({
    displaySrc: 'https://example.test/a.png',
    title: 'たろう',
    meta: { idLine: `ID:${uid}`, nameLine: 'たろう' },
    entry: { userId: uid },
    ...over
  }, io());
}
const NO_8 = (el) => expect(el.outerHTML).not.toMatch(/(?<!\d)8\d{9}(?!\d)/);
const NO_NICO = (el) => expect(el.outerHTML).not.toMatch(/nicovideo\.jp/);

describe('ニコ生の出力は 1 バイトも変わらない', () => {
  afterEach(() => setPersonDisplayResolver(SHIM_RESOLVER));
  const golden = (uid) => `<a class="nl-story-userlane-cell nl-story-userlane-cell--linkable" href="https://www.nicovideo.jp/user/${uid}" target="_blank" rel="noopener noreferrer" title="たろう | ${uid}"><img class="nl-story-userlane-avatar" src="https://example.test/a.png" alt="" title="たろう | ${uid}" decoding="async" referrerpolicy="no-referrer"><span class="nl-story-userlane-meta"><span class="nl-story-userlane-meta__id">ID:${uid}</span><span class="nl-story-userlane-meta__name">たろう</span></span></a>`;
  it('決め手が未登録: 8004919137 も 123456 も今までの HTML そのまま', () => {
    setPersonDisplayResolver(null);
    const a = tile(NICO_REAL).outerHTML;
    const b = tile('123456').outerHTML;
    expect(a).toBe(golden(NICO_REAL));
    expect(b).toBe(golden('123456'));
  });
  it('idLine が uid そのものなら「 | uid」を付けない従来の分岐も同じ', () => {
    setPersonDisplayResolver(null);
    const el = tile('123456', { meta: { idLine: '123456', nameLine: 'たろう' } });
    expect(el.getAttribute('title')).toBe('たろう');
  });
  it('決め手が「内部IDでない」と答えれば(null)従来と同じ HTML', () => {
    setPersonDisplayResolver(() => null);
    expect(tile(NICO_REAL).outerHTML).toBe(golden(NICO_REAL));
    setPersonDisplayResolver(null);
  });
  it('ホバーカード: 決め手なしのニコは本登録のまま・publicId の指定が無ければ変わらない', () => {
    setPersonDisplayResolver(null);
    const m = buildVenueHoverCardModel({ uid: NICO_REAL, displayName: 'たろう', platformId: 'niconico', count: 1 });
    expect(m.idLine).toBe(`ID:${NICO_REAL}(本登録)`);
    expect(m.idKind).toBe('registered');
    const m2 = buildVenueHoverCardModel({ uid: NICO_REAL, displayName: 'たろう', count: 1 });
    expect(m2.idLine).toBe(`ID:${NICO_REAL}(本登録)`);
  });
});

describe('ニコ生以外(ytNicoShim が決め手を登録している)', () => {
  beforeAll(() => { expect(SHIM_RESOLVER).toBeTypeOf('function'); setPersonDisplayResolver(SHIM_RESOLVER); });
  afterAll(() => setPersonDisplayResolver(SHIM_RESOLVER));
  it('YouTube UC…: チャンネルへのリンク・内部ID も ニコのURL も出ない', () => {
    const uc = 'UCabcdefghijklmnopqrstuv';
    const uid = numericUidForYtKey(uc);
    const el = tile(uid, { title: `名前（${uid}）`, meta: { idLine: uid, nameLine: '名前' } });
    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe(`https://www.youtube.com/channel/${uc}`);
    expect(el.title).toBe('名前');
    NO_8(el); NO_NICO(el);
  });
  it('YouTube @ハンドル: /@handle へ', () => {
    const uid = numericUidForYtKey('handle:@SK-dt8bb');
    const el = tile(uid, { title: 'SK-dt8bb（@SK-dt8bb）', meta: { idLine: uid, nameLine: '@SK-dt8bb' } });
    expect(el.getAttribute('href')).toBe('https://www.youtube.com/@SK-dt8bb');
    expect(el.querySelector('.nl-story-userlane-meta__id').textContent).toBe('@SK-dt8bb');
    expect(el.title).toBe('SK-dt8bb（@SK-dt8bb）');
    NO_8(el); NO_NICO(el);
  });
  it('YouTube 名前だけの人(name:): リンク無しの span・名前だけの title', () => {
    const uid = numericUidForYtKey('name:ただの人');
    const el = tile(uid, { title: `ただの人（${uid}）`, meta: { idLine: `ID:${uid}`, nameLine: 'ただの人' } });
    expect(el.tagName).toBe('SPAN');
    expect(el.getAttribute('href')).toBeNull();
    expect(el.className).toBe('nl-story-userlane-cell');
    expect(el.title).toBe('ただの人');
    NO_8(el); NO_NICO(el);
  });
  it('shim が知らない 8+9桁(未登録)でも: span・名前だけ・番号を出さない・「 | uid」を付け足さない', () => {
    const el = tile('8123456780', { title: 'だれか', meta: { idLine: '8123456780', nameLine: 'だれか' } });
    expect(el.tagName).toBe('SPAN');
    expect(el.title).toBe('だれか');
    NO_8(el); NO_NICO(el);
  });
  it('名前が内部IDだけなら「名前未取得」', () => {
    const el = tile('8123456781', { title: '8123456781', meta: { idLine: '8123456781', nameLine: '8123456781' } });
    expect(el.title).toBe('名前未取得');
    NO_8(el);
  });
  it('mirror の title が「名前（8004919137）」でも出ない / idLine≠uid の「 | uid」ケースも付けない', () => {
    const uid = numericUidForYtKey('UCzzzzzzzzzzzzzzzzzzzzzz');
    const el = tile(uid, { title: `名前（${uid}）`, meta: { idLine: 'ID:別の表示', nameLine: '名前' } });
    expect(el.title).toBe('名前');
    expect(el.querySelector('.nl-story-userlane-meta__id').textContent).toBe('ID:別の表示');
    NO_8(el);
  });
  it('Twitch: 確かめた login だけ twitch.tv/<login>・確かでなければ span', () => {
    const known = 'tw:@kato_junichi0817';
    const uid = numericUidForYtKey(known);
    const el = tile(uid, { title: 'かとう', meta: { idLine: uid, nameLine: 'かとう' } });
    expect(el.getAttribute('href')).toBe('https://www.twitch.tv/kato_junichi0817');
    NO_8(el); NO_NICO(el);
    const raw = 'tw:123456789';
    const uid2 = numericUidForYtKey(raw);
    const el2 = tile(uid2, { title: '名無し', meta: { idLine: uid2, nameLine: '名無し' } });
    expect(el2.tagName).toBe('SPAN');
    NO_8(el2); NO_NICO(el2);
    // login が記録で確かめられた人は リンク
    ytRecordToNicoEntry({ channelId: raw, name: 'たろう', login: 'taro_tw', text: 'x' }, 0, 'lv1', raw);
    const el3 = tile(uid2, { title: 'たろう', meta: { idLine: uid2, nameLine: 'たろう' } });
    expect(el3.getAttribute('href')).toBe('https://www.twitch.tv/taro_tw');
  });
  it('Kick: 確かめた slug だけ kick.com/<slug>・確かでなければ span', () => {
    const uid = numericUidForYtKey('kk:@some_slug');
    const el = tile(uid, { title: 'k', meta: { idLine: uid, nameLine: 'k' } });
    expect(el.getAttribute('href')).toBe('https://kick.com/some_slug');
    const uid2 = numericUidForYtKey('kk:987654321');
    const el2 = tile(uid2, { title: 'k2', meta: { idLine: uid2, nameLine: 'k2' } });
    expect(el2.tagName).toBe('SPAN');
    NO_8(el); NO_8(el2); NO_NICO(el); NO_NICO(el2);
  });
  it('TwitCasting: tcUserUrl のユーザーだけ・不明なら span', () => {
    const uid = numericUidForYtKey('tc:@c:someone_1');
    const el = tile(uid, { title: 'tc', meta: { idLine: uid, nameLine: 'tc' } });
    expect(el.tagName === 'A' ? el.getAttribute('href') : '').toMatch(/^(https:\/\/twitcasting\.tv\/|$)/);
    NO_8(el); NO_NICO(el);
    const uid2 = numericUidForYtKey('tc:12345');
    const el2 = tile(uid2, { title: 'tc2', meta: { idLine: uid2, nameLine: 'tc2' } });
    expect(el2.tagName).toBe('SPAN');
    NO_8(el2); NO_NICO(el2);
  });
  it('SHOWROOM: リンクを出さない(既知でも span)', () => {
    for (const k of ['sr:@room_abc', 'sr:n:だれか', 'sr:12345']) {
      const uid = numericUidForYtKey(k);
      const el = tile(uid, { title: 'sr', meta: { idLine: uid, nameLine: 'sr' } });
      expect(el.tagName).toBe('SPAN');
      expect(el.getAttribute('href')).toBeNull();
      NO_8(el); NO_NICO(el);
    }
  });
  it('席: 内部IDの人は title から数字が消え、リンク扱いは「出せるページがあるか」だけ', () => {
    const uc = numericUidForYtKey('UCqqqqqqqqqqqqqqqqqqqqqq');
    const nm = numericUidForYtKey('name:だれ');
    expect(seatTitleFor(uc, '名前（' + uc + '）')).toBe('名前');
    expect(seatTitleFor(nm, `だれ（${nm}）`)).toBe('だれ');
    expect(seatLinkFor(uc, true)).toBe(true);
    expect(seatLinkFor(nm, true)).toBe(false);
    // 内部IDでない人(ニコ生の本物の数字ID含む)は従来の判定・名前のまま
    expect(seatLinkFor('123456', true)).toBe(true);
    expect(seatTitleFor('123456', 'たろう')).toBe('たろう');
    expect(resolvePersonDisplay('123456', { title: 'x' })).toBeNull();
  });
  it('ホバーカード: 内部ID は ID 行に出さない・出してよい公開ID は「ID:…」', () => {
    const uid = numericUidForYtKey('handle:@SK-dt8bb');
    const m = buildVenueHoverCardModel({ uid, displayName: `SK（${uid}）`, platformId: 'youtube', count: 1 });
    expect(JSON.stringify(m)).not.toContain(uid);
    expect(m.displayName).toBe('SK');
    expect(m.idLine).toBe('ID:@SK-dt8bb');
    expect(m.idKind).toBe('public');
    const nm = numericUidForYtKey('name:ただ');
    const m2 = buildVenueHoverCardModel({ uid: nm, displayName: 'ただ', platformId: 'youtube', count: 1 });
    expect(m2.idLine).toBe('');
    expect(m2.idKind).toBe('none');
    const m3 = buildVenueHoverCardModel({ uid: nm, displayName: 'ただ', platformId: 'twitch', publicId: '@override', count: 1 });
    expect(m3.idLine).toBe('ID:@override');
  });
});

describe('純関数', () => {
  it('stripInternalNumericId', () => {
    expect(stripInternalNumericId('名前（8004919137）')).toBe('名前');
    expect(stripInternalNumericId('名前 | 8004919137')).toBe('名前');
    expect(stripInternalNumericId('名前 ID:8004919137')).toBe('名前');
    expect(stripInternalNumericId('12345678901')).toBe('12345678901'); // 11桁は内部IDではない
    expect(stripInternalNumericId('8004919137')).toBe('');
  });
  it('javascript: ・ほかのサービス・ニコニコの URL は人のページにしない', () => {
    expect(isSafeForeignProfileUrl('javascript:alert(1)', 'youtube')).toBe(false);
    expect(isSafeForeignProfileUrl('https://www.nicovideo.jp/user/123', 'youtube')).toBe(false);
    expect(isSafeForeignProfileUrl('https://www.twitch.tv/x', 'youtube')).toBe(false);
    expect(isSafeForeignProfileUrl('https://www.youtube.com/@x', 'twitch')).toBe(false);
    expect(isSafeForeignProfileUrl('http://www.youtube.com/@x', 'youtube')).toBe(false);
    expect(isSafeForeignProfileUrl('https://u:p@www.youtube.com/@x', 'youtube')).toBe(false);
    expect(isSafeForeignProfileUrl('https://www.youtube.com/@x', 'youtube')).toBe(true);
    expect(isSafeForeignProfileUrl('https://www.showroom-live.com/r/x', 'showroom')).toBe(false);
    const d = foreignPersonDisplay({ uid: '8000000001', title: 't', url: 'https://www.nicovideo.jp/user/1', platformId: 'youtube' });
    expect(d.href).toBe('');
  });
});

describe('配線', () => {
  it('venueBar の席の title・リンク判定・shim の登録は共通の決め手を通す', async () => {
    const { readFileSync } = await import('node:fs');
    const bar = readFileSync('src/extension/venueBar.js', 'utf8');
    expect(bar).toMatch(/const displayName = seatTitleFor\(uid, /);
    expect(bar).toMatch(/const seatLinkOn = seatLinkFor\(uid, isNumericNicoUserId\(uid\) && nicoUserPageUrl\(uid\) !== ''\);/);
    const shim = readFileSync('extension-youtube/src/ytNicoShim.js', 'utf8');
    expect(shim).toMatch(/setPersonDisplayResolver\(\(uid, ctx\) =>/);
    const tileSrc = readFileSync('src/lib/personTileDom.js', 'utf8');
    expect(tileSrc).toMatch(/resolvePersonDisplay\(fullUid,/);
  });
});
