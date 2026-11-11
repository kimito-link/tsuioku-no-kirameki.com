import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PARTICIPATION_QUEUE_MAX,
  PARTICIPATION_WORDS_KEY,
  applyParticipationComment,
  applyParticipationComments,
  commentMatchesWord,
  emptyParticipationQueue,
  formatParticipationObsText,
  inheritParticipationWords,
  markParticipationDone,
  moveParticipation,
  normalizeParticipationQueue,
  openParticipationQueue,
  participationCommentBeforeAccept,
  participationCommentKey,
  participationQueueDemoState,
  participationQueueStorageKey,
  participationQueueToStorage,
  recentRowsForParticipation,
  removeParticipationAt,
  resetParticipationOrder,
  setParticipationWords,
  shuffleParticipation
} from './participationQueue.js';
import { participationProfileUrl } from './participationQueueProfile.js';

function words(join = '参加', cancel = '辞退') {
  return setParticipationWords(emptyParticipationQueue(), { joinWord: join, cancelWord: cancel }, 1);
}

function row(over) {
  return {
    commentNo: over.no,
    text: over.text,
    userId: over.userId || '',
    name: over.name || '',
    nickname: over.nickname || '',
    selfPosted: over.selfPosted === true,
    avatarUrl: over.avatarUrl || '',
    ytChannelId: over.ytChannelId || '',
    login: over.login || '',
    ...(over.capturedAt ? { capturedAt: over.capturedAt } : {}),
    ...(over.ytPostedAt ? { ytPostedAt: over.ytPostedAt } : {})
  };
}

describe('参加の順番', () => {
  it('参加の言葉で先着順に並び、同じ人は二重に並ばない', () => {
    let s = words();
    s = applyParticipationComments(s, [
      row({ no: 1, text: '参加', userId: '11', name: 'りんく' }),
      row({ no: 2, text: '参加', userId: '22', name: 'こん太' }),
      row({ no: 3, text: '参加', userId: '11', name: 'りんく' })
    ], 10);
    expect(s.order.map((p) => p.name)).toEqual(['りんく', 'こん太']);
    expect(s.seen).toEqual(['no:1', 'no:2', 'no:3']);
  });

  it('辞退の言葉で待ちから外れる', () => {
    let s = words();
    s = applyParticipationComments(s, [
      row({ no: 1, text: '参加', userId: '11', name: 'りんく' }),
      row({ no: 2, text: '参加', userId: '22', name: 'こん太' }),
      row({ no: 3, text: '辞退', userId: '11', name: 'りんく' })
    ], 10);
    expect(s.order.map((p) => p.name)).toEqual(['こん太']);
  });

  it('言葉の一部だけでは並ばない。全角と英字の大小は同じ言葉にする', () => {
    expect(commentMatchesWord('参加したい', '参加')).toBe(false);
    expect(commentMatchesWord(' 参加 ', '参加')).toBe(true);
    expect(commentMatchesWord('Ｊｏｉｎ', 'join')).toBe(true);
    expect(commentMatchesWord('Join', 'join')).toBe(true);
    let s = words('join', '辞退');
    s = applyParticipationComment(s, row({ no: 1, text: 'JOIN', name: 'たぬ姉' }), 2);
    expect(s.order.map((p) => p.name)).toEqual(['たぬ姉']);
  });

  it('自分のコメントは並ばない', () => {
    const s = applyParticipationComment(
      words(),
      row({ no: 1, text: '参加', userId: '11', name: 'りんく', selfPosted: true }),
      3
    );
    expect(s.order).toEqual([]);
    expect(s.seen).toEqual(['no:1']);
  });

  it('済にすると回数を足して次の人を先頭にする。外すだけでは回数は増えない', () => {
    let s = applyParticipationComments(words(), [
      row({ no: 1, text: '参加', userId: '11', name: 'りんく' }),
      row({ no: 2, text: '参加', userId: '22', name: 'こん太' })
    ], 4);
    s = markParticipationDone(s, 0, 5);
    expect(s.order.map((p) => p.name)).toEqual(['こん太']);
    expect(s.counts['u:11']).toBe(1);
    s = removeParticipationAt(s, 0, 6);
    expect(s.order).toEqual([]);
    expect(s.counts['u:22']).toBeUndefined();
  });

  it('済のあとに同じ人が別のコメントで参加すると、末尾に戻り回数は残る', () => {
    let s = applyParticipationComment(words(), row({ no: 1, text: '参加', userId: '11', name: 'りんく' }), 1);
    s = markParticipationDone(s, 0, 2);
    s = applyParticipationComments(s, [
      row({ no: 1, text: '参加', userId: '11', name: 'りんく' }),
      row({ no: 2, text: '参加', userId: '22', name: 'こん太' }),
      row({ no: 3, text: '参加', userId: '11', name: 'りんく' })
    ], 3);
    expect(s.order.map((p) => p.name)).toEqual(['こん太', 'りんく']);
    expect(s.counts['u:11']).toBe(1);
  });

  it('上下・シャッフル・待ちを空にする', () => {
    let s = applyParticipationComments(words(), [
      row({ no: 1, text: '参加', name: 'りんく' }),
      row({ no: 2, text: '参加', name: 'こん太' }),
      row({ no: 3, text: '参加', name: 'たぬ姉' })
    ], 1);
    s = moveParticipation(s, 2, -1, 2);
    expect(s.order.map((p) => p.name)).toEqual(['りんく', 'たぬ姉', 'こん太']);
    const shuffled = shuffleParticipation(s, () => 0, 3);
    expect(shuffled.order.map((p) => p.name)).toEqual(['たぬ姉', 'こん太', 'りんく']);
    const reset = resetParticipationOrder(shuffled, 4);
    expect(reset.order).toEqual([]);
    expect(reset.seen).toEqual(shuffled.seen);
    expect(reset.counts).toEqual(shuffled.counts);
    expect(resetParticipationOrder(reset)).toBe(reset);
  });

  it('知らない新しい版は中身を使わず、上書き用の形も作らない', () => {
    const raw = { v: 2, order: [{ key: 'u:1', name: 'りんく' }], joinWord: '参加' };
    const s = normalizeParticipationQueue(raw);
    expect(s.opaque).toBe(true);
    expect(s.order).toEqual([]);
    expect(applyParticipationComment(s, row({ no: 1, text: '参加', name: 'こん太' }))).toBe(s);
    expect(participationQueueToStorage(s)).toBe(null);
  });

  it('待ちの上限を超えた人は並べず、同じコメントは二度使わない', () => {
    let s = words();
    const rows = [];
    for (let i = 0; i < PARTICIPATION_QUEUE_MAX + 2; i += 1) {
      rows.push(row({ no: i + 1, text: '参加', userId: String(1000 + i), name: `人${i}` }));
    }
    s = applyParticipationComments(s, rows, 1);
    expect(s.order).toHaveLength(PARTICIPATION_QUEUE_MAX);
    expect(s.seen).toHaveLength(PARTICIPATION_QUEUE_MAX + 2);
    const again = applyParticipationComment(s, rows[0], 2);
    expect(again).toBe(s);
  });

  it('言葉を決める前、待ちを開く前、空にする前のコメントは並ばない', () => {
    const before = row({ no: 1, text: '参加', userId: '11', name: 'りんく', capturedAt: 100 });
    const afterWord = row({ no: 2, text: '参加', userId: '22', name: 'こん太', capturedAt: 250 });
    let s = setParticipationWords(emptyParticipationQueue(), { joinWord: '参加', cancelWord: '辞退' }, 200);
    expect(participationCommentBeforeAccept(before, s.acceptAfter)).toBe(true);
    s = applyParticipationComments(s, [before, afterWord], 260);
    expect(s.order.map((p) => p.name)).toEqual(['こん太']);
    expect(s.seen).toEqual(['no:2']);

    const duringOpen = row({ no: 3, text: '参加', userId: '33', name: 'たぬ姉', capturedAt: 280 });
    const afterOpen = row({ no: 4, text: '参加', userId: '44', name: '次の人', capturedAt: 320 });
    s = openParticipationQueue(s, 300);
    s = applyParticipationComments(s, [duringOpen, afterOpen], 330);
    expect(s.order.map((p) => p.name)).toEqual(['こん太', '次の人']);

    const staleCancel = row({ no: 5, text: '辞退', userId: '22', name: 'こん太', capturedAt: 350 });
    const rejoin = row({ no: 6, text: '参加', userId: '22', name: 'こん太', capturedAt: 410 });
    s = resetParticipationOrder(s, 400);
    s = applyParticipationComments(s, [staleCancel, rejoin, before], 420);
    expect(s.order.map((p) => p.name)).toEqual(['こん太']);
  });

  it('受け取った時刻が新しくても、書かれた時刻が言葉の前なら並ばない', () => {
    let s = setParticipationWords(emptyParticipationQueue(), { joinWord: '参加', cancelWord: '辞退' }, 5000);
    const backlog = row({
      no: 1,
      text: '参加',
      userId: '11',
      name: 'りんく',
      capturedAt: 6000,
      ytPostedAt: 1000
    });
    const live = row({ no: 2, text: '参加', userId: '22', name: 'こん太', capturedAt: 6100 });
    s = applyParticipationComments(s, [backlog, live], 6200);
    expect(s.order.map((p) => p.name)).toEqual(['こん太']);
    expect(s.seen).toEqual(['no:2']);
  });

  it('言葉が空、または参加と辞退が同じときは動かない', () => {
    const bare = emptyParticipationQueue();
    expect(applyParticipationComment(bare, row({ no: 1, text: '参加', name: 'りんく' }))).toBe(bare);
    const same = words('参加', '参加');
    expect(applyParticipationComment(same, row({ no: 1, text: '参加', name: 'りんく' }))).toBe(same);
  });

  it('配信の言葉をまだ決めていなければ、前回の言葉を載せる', () => {
    const inherited = inheritParticipationWords(emptyParticipationQueue(), { v: 1, joinWord: '参加', cancelWord: '辞退' });
    expect(inherited.wordsSet).toBe(false);
    expect(inherited.joinWord).toBe('参加');
    const fixed = setParticipationWords(inherited, { joinWord: '', cancelWord: '辞退' }, 2);
    const again = inheritParticipationWords(fixed, { joinWord: '参加', cancelWord: '辞退' });
    expect(again.joinWord).toBe('');
  });

  it('保存キーは配信 id の形が正しいときだけ作る', () => {
    expect(participationQueueStorageKey('lv123')).toBe('nls_pq_v1_lv123');
    expect(participationQueueStorageKey('LV123')).toBe('nls_pq_v1_lv123');
    expect(participationQueueStorageKey('../x')).toBe('');
    expect(participationQueueStorageKey('')).toBe('');
    expect(PARTICIPATION_WORDS_KEY).toBe('nls_pq_words_v1');
  });

  it('OBS の文字は先頭を「いま」にし、30人を超えた分は人数だけにする', () => {
    expect(formatParticipationObsText(emptyParticipationQueue())).toBe('');
    const demo = formatParticipationObsText(participationQueueDemoState());
    expect(demo.split('\n')[0]).toBe('いま  りんく（2）');
    expect(demo).toContain('たぬ姉（1）');
    let s = words();
    const rows = [];
    for (let i = 0; i < 31; i += 1) rows.push(row({ no: i + 1, text: '参加', userId: String(i + 1), name: `人${i}` }));
    s = applyParticipationComments(s, rows, 1);
    const text = formatParticipationObsText(s);
    expect(text.split('\n')).toHaveLength(31);
    expect(text.endsWith('ほか 1人')).toBe(true);
  });

  it('公開ページは分かる人だけ。YouTube 系の仮の数値はニコニコのページにしない', () => {
    expect(participationProfileUrl('12345', '')).toBe('https://www.nicovideo.jp/user/12345');
    expect(participationProfileUrl('8000000001', 'UC1234567890123456789012')).toBe('https://www.youtube.com/channel/UC1234567890123456789012');
    expect(participationProfileUrl('8000000001', '')).toBe('');
    expect(participationProfileUrl('1', 'tw:@rinku')).toBe('https://www.twitch.tv/rinku');
    expect(participationProfileUrl('1', 'kk:@good_slug')).toBe('https://kick.com/good_slug');
    expect(participationProfileUrl('1', 'tt:@live.name', '')).toBe('https://www.tiktok.com/@live.name/live');
    expect(participationProfileUrl('1', 'ww:user_path')).toBe('https://whowatch.tv/profile/user_path');
    expect(participationProfileUrl('1', 'tw:58355428', 'fan_a')).toBe('https://www.twitch.tv/fan_a');
    expect(participationProfileUrl('guest', '', 'javascript:alert(1)')).toBe('');
  });

  it('直近だけを返し、コメント番号を優先する', () => {
    expect(recentRowsForParticipation([1, 2, 3, 4], 2)).toEqual([3, 4]);
    expect(participationCommentKey({ commentNo: 9, id: 'x' })).toBe('no:9');
    expect(participationCommentKey({ id: 'x' })).toBe('id:x');
  });

  it('コメビュが参加の順番へコメントを渡す', () => {
    const src = readFileSync(new URL('../extension/comeview-entry.js', import.meta.url), 'utf8');
    expect(src).toContain('noteParticipationComments(');
    expect(src).toContain('setParticipationQueueLive(');
    const html = readFileSync(new URL('../../extension/comeview.html', import.meta.url), 'utf8');
    expect(html).toContain('id="cvPq"');
    const obs = readFileSync(new URL('../../extension/participation-queue.html', import.meta.url), 'utf8');
    expect(obs).toContain('color-scheme: light');
    expect(obs).not.toMatch(/<html[^>]*background/i);
  });
});
