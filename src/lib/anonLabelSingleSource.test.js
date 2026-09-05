import { describe, expect, it } from 'vitest';
import { anonymousDisplayLabel } from './nicoUserPage.js';
import { comeviewAnonLabel } from './comeviewUserNotes.js';

/*
 * ★匿名NNN の正本が1本であることを機械に見張らせる（2026-08-30）。
 *
 *   ■ なぜ要るか
 *     この2つは【別々に実装された】ため、同じ人に別の番号を出していた。実測:
 *       a:1234567890 → 会場 匿名890 / コメビュ 匿名644
 *       a:9876543210 → 会場 匿名210 / コメビュ 匿名604
 *     ＝会場で「匿名890さん」だった人が、コメビュでは「匿名644さん」。
 *     同じ人だと分からない＝匿名さんを覚えられない。
 *
 *   ■ これは今日直した「発言1と発言70で揺れる」と★同じ型
 *     表示の正本が2本あると、人は同期し続けられない（AGENTS.md §12.8）。
 *
 *   ■ なぜ「どちらかに寄せる」ではなく合成なのか（★node で実測して決めた）
 *     両者は【逆の場面で強い】。200人中のかぶり:
 *       英数字ID(a:d8KyTJKlU_rTi7sC ＝実機の形) … 末尾3桁 39 / ハッシュ ★21
 *       数字だけのID(a:1000007)              … 末尾3桁 ★0 / ハッシュ 11
 *     ⟹ 単純にどちらかへ寄せると、一部の利用者が必ず悪化する。
 *       「数字があれば末尾3桁・無ければハッシュ」＝両方の強みを残す形が正本。
 *       これは nicoUserPage.js の現行ロジックと同じ骨格なので、そちらを正本とする。
 *
 *   ★このテストが無いと、片方だけ直されて再び割れる。
 */

const SAMPLES = [
  'a:d8KyTJKlU_rTi7sC', // ★実機の形（comeviewUserNotes.test.js:64 から採った）
  'a:1234567890',
  'a:9876543210',
  'a:00000123',
  'a:abcdef',
  'a:1',
  'a:zzzz_ZZZZ-9999',
  'a:513'
];

describe('★匿名NNN の正本は1本（2つの入口が同じ番号を返す）', () => {
  it.each(SAMPLES)('%s は両方で同じ番号になる', (uid) => {
    expect(comeviewAnonLabel(uid)).toBe(anonymousDisplayLabel(uid));
  });

  it('★番号がバラけること自体も確かめる（全部同じ番号なら「一致」は無意味）', () => {
    const labels = new Set(SAMPLES.map((u) => comeviewAnonLabel(u)));
    expect(labels.size).toBeGreaterThan(1);
  });
});

describe('既存契約は維持する（統合で壊さない）', () => {
  it('comeviewAnonLabel は匿名形式でない ID に付けない（空文字）', () => {
    // comeviewUserNotes.test.js:69-72 と同じ契約。
    // ★ここが正本側と違う点なので、委譲しても残さなければならない。
    expect(comeviewAnonLabel('41199319')).toBe('');
    expect(comeviewAnonLabel('')).toBe('');
    expect(comeviewAnonLabel('名無しさん')).toBe('');
  });

  it('anonymousDisplayLabel は匿名形式でなくても番号を出す（席の名前に使うため）', () => {
    // nicoUserPage.test.js:55-57 の契約。空キーでも「匿名N」を返す。
    expect(anonymousDisplayLabel('名無しさん')).toMatch(/^匿名\d{1,3}$/);
    expect(anonymousDisplayLabel('')).toMatch(/^匿名\d{1,3}$/);
  });

  it('数字を含むキーは末尾3桁ベース（nicoUserPage.test.js:59 の既存契約）', () => {
    expect(anonymousDisplayLabel('a:99999456')).toBe('匿名456');
    expect(comeviewAnonLabel('a:99999456')).toBe('匿名456');
  });

  it('同じ ID は常に同じ番号（描画ごとに変わらない）', () => {
    expect(comeviewAnonLabel('a:abcdef')).toBe(comeviewAnonLabel('a:abcdef'));
  });
});
