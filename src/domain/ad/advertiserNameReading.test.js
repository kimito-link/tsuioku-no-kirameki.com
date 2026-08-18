import { describe, expect, it } from 'vitest';
import {
  ADVERTISER_NAME_READING_VERSION,
  AD_MESSAGE_MIN_CODEPOINTS,
  readAdvertiserName
} from './advertiserNameReading.js';

/**
 * ★この検査が守っているのは「メッセージを見つけること」ではなく
 *   【人の名前をメッセージとして晒さないこと】(誤り①の封鎖)。
 *   メッセージを取りこぼす(誤り②)のは現状と同じなので許容できる。
 */

const read = (advertiserName, hasUserId = false) =>
  readAdvertiserName({ advertiserName, hasUserId });

describe('実データ(2026-08-18 実測20件の上位8件)での判定', () => {
  it('userId ありは名前として扱う', () => {
    expect(read('ゲスト', true).reading).toBe('name');
    expect(read('お菊は気まぐれポニーちゃん', true).reading).toBe('name');
    expect(read('うんうん', true).reading).toBe('name');
  });

  it('★終端記号つきの長い文はメッセージ', () => {
    expect(read('コメリにも１６ｃｍ自慢行くの？').reading).toBe('message');
  });

  it('★短い名前(userId 無し)は判定不能に倒す — メッセージと断定しない', () => {
    expect(read('ON').reading).toBe('unknown');
    expect(read('とねりん').reading).toBe('unknown');
  });

  it('★人間でも割れるものは判定不能(いっくん応援団)', () => {
    // 名前とも応援メッセージとも読める。機械が断定しない=このリポの掟。
    expect(read('いっくん応援団').reading).toBe('unknown');
  });

  it('★合成ラベル「名無し」をメッセージと読まない', () => {
    // nicoadContributionRankingApi.js が匿名の空名に合成する値。
    expect(read('名無し').reading).toBe('unknown');
  });
});

describe('★批判役の反証(文法特徴を使わない)に耐えるか', () => {
  it('絵文字のみでも壊れない(判定不能に落ちる)', () => {
    expect(read('💖✨').reading).toBe('unknown');
    expect(() => read('💖✨')).not.toThrow();
  });

  it('★絵文字はコードポイントで1文字と数える(サロゲートペア)', () => {
    // '💖✨' は .length だと 3、コードポイントなら 2。
    expect(read('💖✨').lengthCp).toBe(2);
  });

  it('英数字のみでも終端記号があればメッセージ', () => {
    expect(read('GET NOW 2026!').reading).toBe('message');
  });

  it('単語列(終端記号なし)は判定不能', () => {
    expect(read('セール 開催 中').reading).toBe('unknown');
  });
});

describe('★誤り①(人の名前を晒す)の封鎖', () => {
  it('終端記号があっても短ければメッセージにしない', () => {
    expect(read('推せ！').reading).toBe('unknown');
    expect(read('推せ！').lengthCp).toBeLessThan(AD_MESSAGE_MIN_CODEPOINTS);
  });

  it('★ASCII のピリオドは終端記号に含めない(「hoge Inc.」を守る)', () => {
    expect(read('Kimito Link Inc.').reading).toBe('unknown');
    expect(read('Kimito Link Inc.').endsWithTerminalMark).toBe(false);
  });

  it('★userId があれば終端記号つきでも名前のまま(uid が最優先)', () => {
    expect(read('行くよ！！', true).reading).toBe('name');
  });
});

describe('境界と壊れた入力', () => {
  it('空文字・空白のみは判定不能', () => {
    expect(read('').reading).toBe('unknown');
    expect(read('   ').reading).toBe('unknown');
  });

  it('null/undefined でも落ちない', () => {
    expect(() => readAdvertiserName(null)).not.toThrow();
    expect(() => readAdvertiserName(undefined)).not.toThrow();
    expect(() => readAdvertiserName({})).not.toThrow();
    expect(readAdvertiserName(null).reading).toBe('unknown');
  });

  it('ちょうど下限の長さならメッセージになる', () => {
    const s = 'あ'.repeat(AD_MESSAGE_MIN_CODEPOINTS - 1) + '！';
    expect([...s].length).toBe(AD_MESSAGE_MIN_CODEPOINTS);
    expect(read(s).reading).toBe('message');
  });
});

describe('★構造で返す(文字列に閉じない)', () => {
  it('判定の根拠もあわせて返す', () => {
    const r = read('コメリにも１６ｃｍ自慢行くの？');
    expect(r).toMatchObject({
      reading: 'message',
      hasUserId: false,
      endsWithTerminalMark: true
    });
    expect(r.lengthCp).toBeGreaterThan(0);
  });

  it('★版を返す(判定を改善したとき、どの規則で読んだか分かる)', () => {
    expect(read('x').version).toBe(ADVERTISER_NAME_READING_VERSION);
    expect(ADVERTISER_NAME_READING_VERSION).toBe(1);
  });
});
