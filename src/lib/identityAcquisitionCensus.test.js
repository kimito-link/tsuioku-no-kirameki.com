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

  it('合成既定サムネ(thumbScore=1)は「取れた」に数えない', () => {
    const c = countIdentityAcquisition([
      { userId: '11111', nickname: '太郎', thumbScore: 1 },
      { userId: '22222', nickname: '花子', thumbScore: 2 }
    ]);
    expect(c.withThumb).toBe(1);
    expect(c.thumbPercent).toBe(50);
    expect(c.missingThumb).toBe(1);
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
  it('★全員匿名は「対象なし」と言う(赤くしない)', () => {
    /*
     * 赤くすると、匿名中心の配信では永久に赤=読んでも直せない計器になる
     * ([[instrument-value-is-measured-by-fixes-2026-08-12]])。
     */
    const line = formatIdentityAcquisitionLine(
      countIdentityAcquisition([{ userId: 'a:1' }, { userId: 'a:2' }])
    );
    expect(line).toContain('対象なし');
    expect(line).toContain('仕様');
    expect(line).not.toContain('🔴');
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
    expect(line).toContain('匿名1人は対象外');
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
