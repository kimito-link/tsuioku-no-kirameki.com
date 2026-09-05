import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countIdentityAcquisition,
  formatIdentityAcquisitionLine,
  hasNumericUserId,
  hasRealNickname
} from './identityAcquisitionCensus.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★v0.1.1378: サムネ / 数値ID / アカウント名 の取得率(ユーザー確定の価値指標)。
 *   「計器強化して サムネ ID アカウント名 を確実にとるのが価値高いと思う」(2026-08-12)
 */
describe('hasNumericUserId — 数値IDだけを「取れる側」とみなす', () => {
  it('数値IDは true', () => {
    expect(hasNumericUserId('12345')).toBe(true);
    expect(hasNumericUserId('145113332')).toBe(true);
  });
  it('匿名(a:)・空・短すぎる数字は false', () => {
    expect(hasNumericUserId('a:OwL7K9AOqD')).toBe(false);
    expect(hasNumericUserId('')).toBe(false);
    expect(hasNumericUserId('123')).toBe(false);
  });
});

describe('hasRealNickname — 代替表記を「取れた」と数えない', () => {
  it('本物の名前は true', () => {
    expect(hasRealNickname('ねこぴ', '12345')).toBe(true);
  });

  /*
   * ★ここを甘くすると「名前が取れている率99%」という嘘の緑になる。
   *   実機の速報では表示名が「匿名」や「u/<uid>」になる経路が実在する
   *   (storyUserLaneMeta.js の formatNicknameWithUidFallback)。
   */
  it('「匿名」「(未取得)」「u/<uid>」は未取得として扱う', () => {
    expect(hasRealNickname('匿名', '12345')).toBe(false);
    expect(hasRealNickname('（未取得）', '12345')).toBe(false);
    expect(hasRealNickname('未取得', '12345')).toBe(false);
    expect(hasRealNickname('u/12345', '12345')).toBe(false);
    expect(hasRealNickname('12345', '12345')).toBe(false);
    expect(hasRealNickname('', '12345')).toBe(false);
  });
});

describe('countIdentityAcquisition — 「取れない」と「取れなかった」を分ける', () => {
  it('★匿名は分母に入れない(仕様上ありえないものを失敗に数えない)', () => {
    const c = countIdentityAcquisition([
      { userId: 'a:anon1' },
      { userId: 'a:anon2' },
      { userId: '11111', nickname: '太郎', thumbScore: 2 }
    ]);
    expect(c.total).toBe(3);
    expect(c.anonymous).toBe(2);
    expect(c.identifiable).toBe(1);
    // 分母は identifiable=1 なので 100%(匿名2人で 33% にならない)
    expect(c.allPercent).toBe(100);
  });

  it('推測URL(thumbScore=1)は「取れた」に数えず、別に数える', () => {
    /*
     * ★実機(2026-08-12)の実例: りんく段4人が全員 thumbScore=1 で「サムネ0%」。
     *   画面にはアイコンが出ているが、それは
     *   `https://.../usericon/s/<上位>/<uid>.jpg` を式で組んだだけ(実在未確認)。
     *   同じ速報で1件が実際に404していた。ここを成功に数えると嘘の緑になる。
     */
    const c = countIdentityAcquisition([
      { userId: '11111', nickname: '太郎', thumbScore: 1 },
      { userId: '22222', nickname: '花子', thumbScore: 2 }
    ]);
    expect(c.withThumb).toBe(1);
    expect(c.thumbPercent).toBe(50);
    expect(c.missingThumb).toBe(1);
    expect(c.guessedThumb).toBe(1);
  });

  it('★推測URLの人数を行に出す(画面に絵が出るのに0%の理由を説明する)', () => {
    const line = formatIdentityAcquisitionLine(
      countIdentityAcquisition([
        { userId: '11111', nickname: '太郎', thumbScore: 1 },
        { userId: '22222', nickname: '花子', thumbScore: 1 }
      ])
    );
    expect(line).toContain('推測URL');
    expect(line).toContain('2人');
    expect(line).toContain('404');
  });

  it('サムネと名前を別々に数える(どちらが欠けているか分かる)', () => {
    const c = countIdentityAcquisition([
      { userId: '11111', nickname: '太郎', thumbScore: 0 },
      { userId: '22222', nickname: '', thumbScore: 2 }
    ]);
    expect(c.withThumb).toBe(1);
    expect(c.withName).toBe(1);
    expect(c.withAll).toBe(0);
    expect(c.missingThumb).toBe(1);
    expect(c.missingName).toBe(1);
  });

  it('空配列でも壊れない', () => {
    const c = countIdentityAcquisition([]);
    expect(c.total).toBe(0);
    expect(c.identifiable).toBe(0);
    expect(c.allPercent).toBe(0);
  });
});

describe('formatIdentityAcquisitionLine — 読んで次の一手が決まる', () => {
  it('★全員匿名でも赤くしない(守る価値は維持)', () => {
    /*
     * 赤くすると、匿名中心の配信では永久に赤=読んでも直せない計器になる
     * ([[instrument-value-is-measured-by-fixes-2026-08-12]])。★この価値は維持する。
     *
     * ★v1(2026-08-17)で文言だけ変えた: 旧実装は「対象なし(…数値IDもサムネも
     *   【仕様上ありません】)」と書いていたが、この【仕様上ありません】は誤りだった。
     *   実機で匿名(a:)に個人サムネと本人設定の表示名が出ていることを確認済み。
     *   ＝「赤くしない」は守り、「仕様上無い」という嘘だけをやめる。
     */
    const line = formatIdentityAcquisitionLine(
      countIdentityAcquisition([{ userId: 'a:1' }, { userId: 'a:2' }])
    );
    expect(line).toContain('数値IDの人がいません');
    expect(line).not.toContain('🔴');
    // ★誤った前提の文言が復活したら赤にする
    expect(line).not.toContain('仕様上ありません');
  });

  it('★全員匿名でも、匿名側の保有(サムネ/名前)を必ず数字で出す', () => {
    /*
     * 旧実装はここで素通りしていたため「匿名にサムネ/名前があるか」を
     * 誰も答えられなかった＝前提の誤りを検出できない計器だった。
     */
    const line = formatIdentityAcquisitionLine(
      countIdentityAcquisition([
        { userId: 'a:1', rawNickname: 'メデタセット', thumbScore: 2, avatarObserved: true },
        { userId: 'a:2', rawNickname: '', thumbScore: 0 }
      ])
    );
    expect(line).toContain('匿名2人のうち');
    expect(line).toContain('サムネ観測1人');
    expect(line).toContain('本人名1人');
  });

  it('誰も居ないときは「未観測」(異常なしと言わない)', () => {
    const line = formatIdentityAcquisitionLine(countIdentityAcquisition([]));
    expect(line).toContain('未観測');
  });

  it('★未取得があれば人数を名指しする(取得経路を疑える形)', () => {
    const line = formatIdentityAcquisitionLine(
      countIdentityAcquisition([
        { userId: '11111', nickname: '太郎', thumbScore: 0 },
        { userId: '22222', nickname: '', thumbScore: 2 }
      ])
    );
    expect(line).toContain('未取得');
    expect(line).toContain('サムネ1人');
    expect(line).toContain('名前1人');
  });

  it('★分母を明示する(「取れるはずの人」基準だと隠さない)', () => {
    const line = formatIdentityAcquisitionLine(
      countIdentityAcquisition([
        { userId: 'a:1' },
        { userId: '11111', nickname: '太郎', thumbScore: 2 }
      ])
    );
    expect(line).toContain('対象1人');
    expect(line).toContain('匿名1人は分母外');
  });

  it('★実稼働の率(画面の全員が分母)も併記する', () => {
    /*
     * 実機(2026-08-17)は55人中51人が匿名で、同じ状態が【100%】とも【7.3%】とも
     * 書けた。期待値だけ出すと「ほぼ完璧に取れている」と誤読される
     * ＝ユーザー「正確なデータをださないといみがない」。
     */
    const line = formatIdentityAcquisitionLine(
      countIdentityAcquisition([
        { userId: 'a:1' },
        { userId: 'a:2' },
        { userId: 'a:3' },
        { userId: '11111', nickname: '太郎', rawNickname: '太郎', thumbScore: 2 }
      ])
    );
    expect(line).toContain('期待値');
    expect(line).toContain('実稼働');
    // 期待値は100%(1/1)だが、実稼働は25%(1/4)
    expect(line).toContain('両方100%');
    expect(line).toContain('両方25%');
  });

  it('全員そろっていれば ✅ と明示する', () => {
    const line = formatIdentityAcquisitionLine(
      countIdentityAcquisition([{ userId: '11111', nickname: '太郎', thumbScore: 2 }])
    );
    expect(line).toContain('✅');
    expect(line).toContain('そろっています');
  });

  it('材料が無ければ空文字(速報を壊さない)', () => {
    expect(formatIdentityAcquisitionLine(null)).toBe('');
  });
});

/*
 * ★配線: 数えても速報に出さなければ「無いのと同じ」。
 *   今日この失敗を複数回踏んだ([[unwired-judgement-is-systemic-2026-08-12]] /
 *   [[fastdiag-lite-is-the-printer-subset]])。
 */
describe('★配線 — 実表示(picked)を数えて速報に出す', () => {
  const popupSrc = read('src/extension/popup-entry.js');
  const reportSrc = read('src/lib/aiShareFullText.js');

  /*
   * ★popup-entry.js は max-lines のラチェット管理下なので、写像・組み立ては
   *   lib 側(countIdentityFromLanePicks / buildIdentityAcquisitionProbe)に置く。
   *   popup に残るのは呼び出し2行だけ。
   */
  it('popup が取得率を数えている', () => {
    expect(popupSrc).toContain('countIdentityFromLanePicks');
  });

  it('★候補全体でなく【画面に出ている picked】を数えている', () => {
    /*
     * 候補(rosteredCandidates)を数えると「表示されていない人」まで母数に入り、
     * 画面と食い違う数字になる([[check-what-the-number-counts-2026-08-09]])。
     */
    expect(popupSrc).toMatch(/_identityAcquisition = countIdentityFromLanePicks\(picked\)/);
    expect(popupSrc).not.toMatch(/countIdentityFromLanePicks\(rosteredCandidates\)/);
  });

  it('★診断の snapshot に載せている(ここに無いと速報に出ない)', () => {
    expect(popupSrc).toMatch(/identityAcquisition: buildIdentityAcquisitionProbe\(_identityAcquisition\)/);
  });

  it('★状態速報の本文に1行出している', () => {
    expect(reportSrc).toContain('identityAcquisition?.line');
    expect(reportSrc).toMatch(/if \(idLine\) \{ lines\.push\(idLine\)/);
  });
});
