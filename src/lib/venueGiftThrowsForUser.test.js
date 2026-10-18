import { describe, expect, it } from 'vitest';
import { giftThrowsForUser, giftThrowsSectionHtml, giftThrowWhenLabel } from './venueGiftThrowsForUser.js';

const LV = 'lv351615340';
const NOW = 1_800_000_000_000;
/** @param {Record<string, unknown>} o */
const row = (o) => ({
  itemName: 'シャンパーン',
  senderName: '花子',
  points: 900,
  time: '0:10:00',
  sortKey: 600,
  thumbnailUrl: 'https://example.com/i.png',
  userId: '111',
  kokenHistoryId: 'h1',
  ...o,
  // 公式のランキング(タイルの🎁)は contribution の合計=pt の10倍(実測: 記名25人すべてで Σ明細の contribution = ランキングの contribution)。
  contribution: o.contribution ?? Number(o.points ?? 900) * 10
});
const payload = (history, extra = {}) => ({ liveId: LV, capturedAt: NOW - 5_000, source: 'koken-api', history, totalCounts: [], ...extra });
const call = (history, over = {}) =>
  giftThrowsForUser({ payload: payload(history), uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW, ...over });

describe('結びつけは数値uidの完全一致だけ(名前では引かない)', () => {
  it('★同じ名前で別uidの行は混ざらない', () => {
    const r = call([row({ kokenHistoryId: 'a' }), row({ userId: '222', kokenHistoryId: 'b', points: 5000 })]);
    expect(r.rows.map((x) => x.points)).toEqual([900]);
  });
  it('★uid の無い行(匿名・DOM由来)は誰にも付かない。同名でも付かない', () => {
    const r = call([row({ userId: '', kokenHistoryId: 'c', senderName: '花子' }), row({ kokenHistoryId: 'd' })]);
    expect(r.rows).toHaveLength(1);
    expect(r.sumPoints).toBe(900);
  });
  it('★押した人の uid が数値でなければ何も出さない', () => {
    for (const bad of ['', 'a:xyz', '０12', '011', '12 3', undefined]) {
      expect(call([row({})], { uid: bad }).ok).toBe(false);
    }
  });
});

describe('配信の取り違え防止', () => {
  it('★別の配信の保存は使わない', () => {
    const r = giftThrowsForUser({ payload: payload([row({})], { liveId: 'lv999' }), uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('live-mismatch');
  });
  it('★保存側の配信IDが空でも使わない(fail-closed)', () => {
    const r = giftThrowsForUser({ payload: payload([row({})], { liveId: '' }), uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.ok).toBe(false);
  });
  it('配信IDは大文字小文字・前後空白を無視して比べる', () => {
    const r = giftThrowsForUser({ payload: payload([row({})], { liveId: ' LV351615340 ' }), uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.ok).toBe(true);
  });
});

describe('合計の整合(嘘の明細を出さない)', () => {
  it('★明細の合計がタイルの🎁ptを超えるなら出さない(照合できません)', () => {
    const r = call([row({ points: 900 })], { tileGiftPt: 300 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('over-total');
  });
  it('明細の合計がタイルと一致すれば注記なしで出す', () => {
    const r = call([row({ points: 900 })], { tileGiftPt: 9000 });
    expect(r.ok).toBe(true);
    expect(r.notes.join('')).not.toContain('全部ではありません');
  });
  it('★明細の合計がタイルより少なければ「全部ではありません」と明記する', () => {
    const r = call([row({ points: 900 })], { tileGiftPt: 20000 });
    expect(r.ok).toBe(true);
    expect(r.notes.join('')).toContain('全部ではありません');
    expect(r.notes.join('')).toContain('9,000');
    expect(r.notes.join('')).toContain('20,000');
  });
  it('タイルの値が不明(null)でも出せる(照合はしない)', () => {
    expect(call([row({})], { tileGiftPt: null }).ok).toBe(true);
  });
});

describe('重複・並び・古さ・匿名の注記', () => {
  it('★同じ kokenHistoryId は1件に畳む(二重表示しない)', () => {
    const r = call([row({ kokenHistoryId: 'x' }), row({ kokenHistoryId: 'x' })]);
    expect(r.rows).toHaveLength(1);
    expect(r.sumPoints).toBe(900);
  });
  it('新しい順に並べる', () => {
    const r = call([row({ kokenHistoryId: 'o', sortKey: 100, points: 1 }), row({ kokenHistoryId: 'n', sortKey: 900, points: 2 })]);
    expect(r.rows.map((x) => x.points)).toEqual([2, 1]);
  });
  it('★匿名の行が保存に含まれるときは「含みません」と注記する', () => {
    const r = call([row({}), row({ userId: '', kokenHistoryId: 'z' })]);
    expect(r.notes.join('')).toContain('匿名');
  });
  it('古い保存(5分超)は何分前の記録かを注記する', () => {
    const r = giftThrowsForUser({ payload: payload([row({})], { capturedAt: NOW - 8 * 60_000 }), uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.notes.join('')).toContain('8分前');
  });
  it('点数が0・壊れた行は1件だけ捨てる', () => {
    const r = call([null, 'x', row({ points: 0, kokenHistoryId: 'p' }), row({ kokenHistoryId: 'q' })]);
    expect(r.rows).toHaveLength(1);
  });
  it('空の履歴・壊れた保存は ok:false(例外にしない)', () => {
    expect(call([]).ok).toBe(false);
    expect(giftThrowsForUser({ payload: null, uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW }).ok).toBe(false);
    expect(giftThrowsForUser({ payload: { liveId: LV, history: 'x' }, uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW }).ok).toBe(false);
  });
});

describe('giftThrowsSectionHtml(外部入力の検疫)', () => {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  it('★アイテム名の HTML は無害化される', () => {
    const r = call([row({ itemName: '<img src=x onerror=alert(1)>' })]);
    const html = giftThrowsSectionHtml(r, esc);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
  it('★サムネは http(s) だけ。javascript: は出さない', () => {
    const r = call([row({ thumbnailUrl: 'javascript:alert(1)' })]);
    expect(giftThrowsSectionHtml(r, esc)).not.toContain('javascript:');
  });
  it('出せないとき(ok:false)は、照合できない理由だけ・over-total のみ文言を出し、他は空', () => {
    expect(giftThrowsSectionHtml(call([row({})], { tileGiftPt: 1 }), esc)).toContain('照合できません');
    expect(giftThrowsSectionHtml(call([]), esc)).toBe('');
  });
});

describe('いつ投げたか(v0.1.1663)', () => {
  const at = Math.floor((NOW - 12 * 60_000) / 1000);
  const clock = (() => {
    const d = new Date(at * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  })();
  it('★公開時刻があれば、時計の時刻・何分前・配信内の経過を並べる', () => {
    const r = call([row({ publishedAt: at })]);
    expect(r.rows[0].at).toBe(at * 1000);
    expect(giftThrowWhenLabel(r.rows[0], NOW)).toBe(`${clock}(12分前) ・ 配信0:10:00`);
  });
  it('★公開時刻が無い古い保存は、配信内の経過だけを「配信○」と明示する(数字だけにしない)', () => {
    const r = call([row({})]);
    expect(r.rows[0].at).toBe(0);
    expect(giftThrowWhenLabel(r.rows[0], NOW)).toBe('配信0:10:00');
  });
  it('どちらも無ければ空', () => {
    expect(giftThrowWhenLabel({ time: '—', at: 0 }, NOW)).toBe('');
  });
  it('区画のHTMLに時刻ラベルが入る', () => {
    const esc = (s) => String(s);
    const html = giftThrowsSectionHtml(call([row({ publishedAt: at })]), esc, NOW);
    expect(html).toContain(`${clock}(12分前)`);
  });
});

describe('ギフトがあるのに記録が出ない人の説明(v0.1.1665)', () => {
  const esc = (s) => String(s);
  it('★ギフトptがあるのに、この人のIDの記録が履歴に無いときは、理由を出す(区画ごと消さない)', () => {
    const r = call([row({ userId: '222', kokenHistoryId: 'z' })]); // 別の人の行だけ
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('empty');
    const html = giftThrowsSectionHtml(r, esc, NOW, true);
    expect(html).toContain('記録がありません');
    expect(html).not.toContain('直近10件'); // 公式の履歴は limit=100 で全件取れる(v0.1.1669)=「直近10件ほど」は誤りだった
    expect(html).toContain('匿名');
  });
  it('★履歴をまだ取得できていないときは、そう言う', () => {
    const r = giftThrowsForUser({ payload: null, uid: '111', liveId: LV, tileGiftPt: 50, nowMs: NOW });
    expect(giftThrowsSectionHtml(r, esc, NOW, true)).toContain('まだ取得できていません');
  });
  it('★ギフトptが無い人(広告だけ等)には何も足さない', () => {
    const r = call([row({ userId: '222', kokenHistoryId: 'z' })]);
    expect(giftThrowsSectionHtml(r, esc, NOW, false)).toBe('');
  });
  it('★uid が数値でない(押した人がuid無し)ときは何も出さない', () => {
    const r = call([row({})], { uid: '' });
    expect(giftThrowsSectionHtml(r, esc, NOW, true)).toBe('');
  });
});

describe('匿名の投げの集計と公式の合計との照合(v0.1.1669)', () => {
  const full = (rows, extra = {}) => ({ liveId: LV, capturedAt: NOW - 5_000, source: 'koken-api', history: rows, totalCounts: [], ...extra });
  it('★匿名の投げは「N件・合計Mpt」と数で出す(誰のものか分からないため含まない旨つき)', () => {
    const p = full([row({}), row({ userId: '', kokenHistoryId: 'a1', points: 30 }), row({ userId: '', kokenHistoryId: 'a2', points: 10 })]);
    const r = giftThrowsForUser({ payload: p, uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.anonCount).toBe(2);
    expect(r.anonPoints).toBe(40);
    expect(r.notes.join('')).toContain('匿名のギフト 2件・合計 40pt');
  });
  it('★明細の合計(記名+匿名)が公式の合計と一致し残り0なら、一致を明記する', () => {
    const p = full([row({ points: 900 }), row({ userId: '', kokenHistoryId: 'a1', points: 100 })], { officialTotalPoint: 1000, officialRemaining: 0 });
    const r = giftThrowsForUser({ payload: p, uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.official).toBe('match');
    expect(r.notes.join('')).toContain('公式の合計 1,000pt と一致');
  });
  it('★合計が一致しないときは一致と言わない(不足を明記)', () => {
    const p = full([row({ points: 900 })], { officialTotalPoint: 1000, officialRemaining: 0 });
    const r = giftThrowsForUser({ payload: p, uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.official).toBe('short');
    expect(r.notes.join('')).not.toContain('と一致');
  });
  it('★公式の履歴が100件を超えている(残りあり)ときは、古い分を含まないと明記する', () => {
    const p = full([row({})], { officialTotalPoint: 99999, officialRemaining: 30 });
    const r = giftThrowsForUser({ payload: p, uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.official).toBe('truncated');
    expect(r.notes.join('')).toContain('残り 30件');
  });
  it('公式の合計が無い保存(旧形式)では照合しない', () => {
    const r = giftThrowsForUser({ payload: full([row({})]), uid: '111', liveId: LV, tileGiftPt: null, nowMs: NOW });
    expect(r.official).toBeNull();
  });
});

describe('タイルの🎁はランキングの値(contribution=ptの10倍)と照合する(v0.1.1669)', () => {
  it('★明細の contribution の合計がタイルと一致すれば、全部の記録と言える(ptではなく contribution で比べる)', () => {
    const r = call([row({ points: 300 }), row({ points: 400, kokenHistoryId: 'h2' })], { tileGiftPt: 7000 });
    expect(r.ok).toBe(true);
    expect(r.notes.join('')).not.toContain('全部ではありません');
    expect(r.notes.join('')).toContain('ランキングの値)と一致');
  });
  it('★contribution を持たない古い保存では照合しない(単位が分からないので超過・不足を言わない)', () => {
    const r = call([row({ points: 900, contribution: undefined })].map((x) => { const y = { ...x }; delete y.contribution; return y; }), { tileGiftPt: 50 });
    expect(r.ok).toBe(true);
    expect(r.notes.join('')).not.toContain('全部ではありません');
    expect(r.notes.join('')).not.toContain('ランキングの値)と一致');
  });
});
