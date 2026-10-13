import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
import { identiconFallbackForAvatarUrl } from './avatarFallbackFromUrl.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const venueBar = readFileSync(join(root, 'src/extension/venueBar.js'), 'utf8');

/**
 * ★守っている実害(2026-08-10 実機・ユーザー報告「サムネがおちてる」):
 *   会場が白丸だらけになる。原因はアイコン未設定ユーザーの CDN が 404 を返し、
 *   guard が【全員同じ】blank.jpg を出していたこと。
 *   実測: 未設定(135315894/138512750/138339168)=404 / 設定済(128121142/4046119)=200
 *   ＝URLの作り方は正しく、404は「本当に設定していない人」。
 *   v0.1.1307(広告段)と同じ結論=「404の白丸でなくゆっくり顔にする」を会場にも適用する。
 */

/** venueBar の解決器と同じ抽出規則(実装と1文字ずつ揃える=下の配線テストで固定)。 */
const extractUid = (src) => {
  const m = /\/usericon\/(?:[sm]\/)?\d+\/(\d{1,14})\.jpg/i.exec(String(src || ''));
  return m ? m[1] : '';
};

describe('会場のアイコン未設定フォールバック', () => {
  describe('失敗URLから uid を復元できる', () => {
    it('★実機で404だった実URLから uid が取れる', () => {
      expect(
        extractUid('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/13531/135315894.jpg')
      ).toBe('135315894');
      expect(
        extractUid('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/13851/138512750.jpg')
      ).toBe('138512750');
    });

    it('サイズ指定なし(s/ が無い形)でも取れる', () => {
      expect(
        extractUid('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/12812/128121142.jpg')
      ).toBe('128121142');
    });

    it('無関係なURLからは取らない(誤って顔を作らない)', () => {
      expect(extractUid('https://example.com/foo.jpg')).toBe('');
      expect(extractUid('')).toBe('');
      expect(extractUid(null)).toBe('');
      expect(extractUid('data:image/svg+xml;base64,AAA')).toBe('');
    });
  });

  describe('uid ごとに違う顔になる(白丸だらけにならない)', () => {
    it('★別の uid なら別の画像', () => {
      const a = anonymousIdenticonDataUrl('135315894', 64);
      const b = anonymousIdenticonDataUrl('138512750', 64);
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      expect(a).not.toBe(b);
    });

    it('同じ uid なら毎回同じ画像(ちらつかない)', () => {
      expect(anonymousIdenticonDataUrl('135315894', 64)).toBe(
        anonymousIdenticonDataUrl('135315894', 64)
      );
    });

    it('生成物は data URL(外部リクエストを増やさない)', () => {
      expect(anonymousIdenticonDataUrl('135315894', 64).startsWith('data:image/svg+xml')).toBe(true);
    });
  });

  describe('★配線: venueBar が解決器を guard に渡している', () => {
    it('代替顔の解決器(共通部品 avatarFallbackFromUrl.js)を import している', () => {
      expect(venueBar).toMatch(
        /import\s*\{\s*identiconFallbackForAvatarUrl\s*\}\s*from\s*'\.\.\/lib\/avatarFallbackFromUrl\.js'/
      );
    });

    it('★guard に fallbackSrcFor を渡している(落とすと白丸に戻る)', () => {
      expect(venueBar).toMatch(/fallbackSrcFor:\s*venueAvatarFallbackFor/);
    });

    it('★解決器は共通部品そのもの(会場に別実装を持たない)で、共通部品が uid を抽出して identicon を返す', () => {
      expect(venueBar).toMatch(/const venueAvatarFallbackFor = identiconFallbackForAvatarUrl;/);
      // このテストの extractUid と共通部品の結果が、あらゆる URL で一致する(抽出規則を揃える)
      for (const u of [
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/13531/135315894.jpg',
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/12812/128121142.jpg',
        'https://example.com/foo.jpg',
        '',
        'data:image/svg+xml;base64,AAA'
      ]) {
        const uid = extractUid(u);
        expect(identiconFallbackForAvatarUrl(u)).toBe(uid ? anonymousIdenticonDataUrl(uid, 64) : '');
      }
    });

    it('★共通 fallback(blank.jpg)も残す(解決できないときの最後の砦)', () => {
      expect(venueBar).toMatch(/fallbackSrc:\s*NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS/);
    });
  });
});
