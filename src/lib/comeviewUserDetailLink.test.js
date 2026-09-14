import { describe, expect, it } from 'vitest';
import {
  buildComeviewUserDetailPath,
  laneTileUserDetailTarget,
  USER_SPEECH_ROWS_MAX
} from './comeviewUserDetailLink.js';

describe('buildComeviewUserDetailPath', () => {
  it('uid と uname を encodeURIComponent して comeview パスにする', () => {
    expect(buildComeviewUserDetailPath('123', 'みち')).toBe(
      'comeview.html?user=123&uname=%E3%81%BF%E3%81%A1'
    );
  });

  it('記号を含む値をエンコードする(生のクエリ壊れを防ぐ)', () => {
    expect(buildComeviewUserDetailPath('a b', 'x&y')).toBe(
      'comeview.html?user=a%20b&uname=x%26y'
    );
  });

  it('匿名 uid(a: 始まり)もそのまま user= に載る', () => {
    expect(buildComeviewUserDetailPath('a:xyz', '匿名12')).toBe(
      'comeview.html?user=a%3Axyz&uname=%E5%8C%BF%E5%90%8D12'
    );
  });

  it('null/undefined は空文字として扱う', () => {
    expect(buildComeviewUserDetailPath(undefined, null)).toBe(
      'comeview.html?user=&uname='
    );
  });
});

describe('laneTileUserDetailTarget', () => {
  it('u:<数値uid> + "名 | uid" 形式の title から {uid, uname} を返す', () => {
    expect(
      laneTileUserDetailTarget({ userKey: 'u:123', title: 'みち | 123' })
    ).toEqual({ uid: '123', uname: 'みち' });
  });

  it('匿名 u:a:xyz + "匿名12" から {uid:"a:xyz", uname:"匿名12"} を返す(匿名NNNは comeview 側で捨てる)', () => {
    expect(
      laneTileUserDetailTarget({ userKey: 'u:a:xyz', title: '匿名12' })
    ).toEqual({ uid: 'a:xyz', uname: '匿名12' });
  });

  it('title が uid 併記なし(表示名だけ)でも先頭を表示名にする', () => {
    expect(
      laneTileUserDetailTarget({ userKey: 'u:999', title: 'ゆっくりさん' })
    ).toEqual({ uid: '999', uname: 'ゆっくりさん' });
  });

  it('c: 始まり(広告主等 uid 無しセル)は null', () => {
    expect(
      laneTileUserDetailTarget({ userKey: 'c:idline|title', title: 'x' })
    ).toBeNull();
  });

  it('空・欠落・非文字列は null', () => {
    expect(laneTileUserDetailTarget({ userKey: '', title: 'x' })).toBeNull();
    expect(laneTileUserDetailTarget({ title: 'x' })).toBeNull();
    expect(laneTileUserDetailTarget({ userKey: 'u:', title: 'x' })).toBeNull();
    expect(laneTileUserDetailTarget(null)).toBeNull();
    expect(laneTileUserDetailTarget('u:1')).toBeNull();
  });
});

describe('USER_SPEECH_ROWS_MAX', () => {
  it('上限は 1000(DESIGN §4.3)', () => {
    expect(USER_SPEECH_ROWS_MAX).toBe(1000);
  });
});
