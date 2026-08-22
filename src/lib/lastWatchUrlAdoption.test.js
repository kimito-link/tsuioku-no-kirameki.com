import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ADOPT,
  REJECT,
  judgeLastWatchUrlAdoption,
  shouldAdoptLastWatchUrl
} from './lastWatchUrlAdoption.js';

const ROOT = path.resolve(__dirname, '../..');

describe('judgeLastWatchUrlAdoption', () => {
  it('★ユーザーが踏んだ症状: 閉じた直後(記録は新しい)でも採用しない', () => {
    // ★これが本丸。panel_summary は約2秒ごとに書かれるので、
    //   閉じた直後は必ず fresh:true になる。それでも終了の印が勝つ。
    const v = judgeLastWatchUrlAdoption({ endedAt: Date.now(), fresh: true });
    expect(v.decision).toBe(REJECT);
    expect(v.reason).toContain('終了済み');
  });

  it('終了の印が無く、記録が新しいなら採用する(退化させない)', () => {
    const v = judgeLastWatchUrlAdoption({ endedAt: 0, fresh: true });
    expect(v.decision).toBe(ADOPT);
  });

  it('終了の印が無くても、記録が古ければ採用しない(従来の守り)', () => {
    expect(judgeLastWatchUrlAdoption({ endedAt: 0, fresh: false }).decision).toBe(REJECT);
  });

  it('★印が無い＝「終わっていない」ではなく「まだ分からない」ので鮮度で決める', () => {
    // 印なし(null/undefined/0)はすべて「分からない」扱い＝鮮度に委ねる
    for (const ended of [null, undefined, 0, '', false]) {
      expect(judgeLastWatchUrlAdoption({ endedAt: ended, fresh: true }).decision).toBe(ADOPT);
      expect(judgeLastWatchUrlAdoption({ endedAt: ended, fresh: false }).decision).toBe(REJECT);
    }
  });

  it('★壊れた endedAt を「終了済み」と誤読しない(NaN/負数/文字列)', () => {
    for (const bad of ['abc', NaN, -1, Infinity, -Infinity]) {
      const v = judgeLastWatchUrlAdoption({ endedAt: bad, fresh: true });
      expect(v.decision).toBe(ADOPT); // 印として読めない＝印なし扱い＝鮮度に委ねる
    }
  });

  it('★数値文字列の endedAt は終了済みとして読む(storage往復で文字列化されても効く)', () => {
    expect(judgeLastWatchUrlAdoption({ endedAt: '1755900000000', fresh: true }).decision)
      .toBe(REJECT);
  });

  it('★fresh が未指定/真偽値でないときは採用しない(fail-closed)', () => {
    expect(judgeLastWatchUrlAdoption({}).decision).toBe(REJECT);
    expect(judgeLastWatchUrlAdoption({ fresh: 'yes' }).decision).toBe(REJECT);
    expect(judgeLastWatchUrlAdoption({ fresh: 1 }).decision).toBe(REJECT);
    expect(judgeLastWatchUrlAdoption(/** @type {any} */ (null)).decision).toBe(REJECT);
  });

  it('★どちらの結論でも理由を必ず返す(速報で人が検算できるように)', () => {
    for (const input of [{ endedAt: 1, fresh: true }, { fresh: true }, { fresh: false }]) {
      expect(judgeLastWatchUrlAdoption(input).reason.length).toBeGreaterThan(0);
    }
  });
});

describe('shouldAdoptLastWatchUrl', () => {
  it('judge と同じ結論を真偽値で返す', () => {
    expect(shouldAdoptLastWatchUrl({ endedAt: 0, fresh: true })).toBe(true);
    expect(shouldAdoptLastWatchUrl({ endedAt: Date.now(), fresh: true })).toBe(false);
    expect(shouldAdoptLastWatchUrl({ endedAt: 0, fresh: false })).toBe(false);
  });
});

describe('★配線されているか(判定だけ作って呼ばれない片肺を防ぐ)', () => {
  const status = readFileSync(path.join(ROOT, 'src/extension/status-entry.js'), 'utf8');

  it('status-entry.js が判定を import している', () => {
    expect(status).toContain('lastWatchUrlAdoption.js');
    expect(status).toContain('shouldAdoptLastWatchUrl');
  });

  it('★経路3が終了フラグのキーを読んでいる', () => {
    // ★「印を読む」配線が無ければ、判定を入れても永久に endedAt:undefined で
    //   今までと同じ動きになる(＝静かに死ぬ)。実名で固定する。
    expect(status).toContain('liveEndedStorageKey');
  });

  it('★経路3が古い判定(isLastWatchUrlFresh の直接採用)に戻っていない', () => {
    // 変異で赤を確認済み: fresh をそのまま採用に使う形へ戻すとここが落ちる。
    const i = status.indexOf('KEY_LAST_WATCH_URL);');
    expect(i).toBeGreaterThan(-1);
    // ★経路3のブロック内(次の関数定義まで)に判定があること。
    const end = status.indexOf('function uniqLvSorted', i);
    expect(end).toBeGreaterThan(i);
    const near = status.slice(i, end);
    expect(near).toContain('shouldAdoptLastWatchUrl');
    // ★fresh を素通しで採用に使う形へ戻っていないこと
    expect(near).not.toContain('if (fresh) lvList.push');
    // ★判定の【結果】が採用条件に使われていること。
    //   2026-08-23: 「呼んでいるか」だけを見る形では、採用条件を常に真に
    //   書き換える毒が素通りした(実際に試して確認)。結果の使い先まで固定する。
    expect(near).toContain('adopt = shouldAdoptLastWatchUrl(');
    expect(near).toContain('if (adopt) lvList.push(lv);');
    // ★判定の【結果】が採用条件に使われていること。
    //   2026-08-23: 「呼んでいるか」だけを見る形では、採用条件を常に真に
    //   書き換える毒が素通りした(実際に試して確認)。結果の使い先まで固定する。
  });
});
