import { describe, it, expect } from 'vitest';
import {
  createHostWriteTrapState,
  noteHostWriteTrapArmed,
  noteHostWriteTrapReport,
  pickCulpritFrame,
  classifyCulpritUrl,
  snapshotHostWriteTrap,
  formatHostWriteTrapLine,
  TRAP_SAMPLE_MAX
} from './hostWriteTrap.js';

const OWN = 'chrome-extension://edpellgokebgpjboflekdmmlnjgajnfn/';

describe('pickCulpritFrame — 自分を犯人と誤報しない', () => {
  it('★自拡張のフレームを飛ばして外部のフレームを返す', () => {
    const frames = [
      `    at installHostDisplayWriteTrap (${OWN}dist/page-intercept.js:1:100)`,
      `    at Object.set (${OWN}dist/page-intercept.js:1:200)`,
      '    at t.restoreLayout (https://live2.nicovideo.jp/main.js:1:84213)'
    ];
    expect(pickCulpritFrame(frames, OWN)).toContain('live2.nicovideo.jp');
    expect(pickCulpritFrame(frames, OWN)).toContain('restoreLayout');
  });

  it('★トラップ自身の名前を含む行は必ず飛ばす(originが未指定でも)', () => {
    const frames = [
      '    at installHostDisplayWriteTrap (x.js:1:1)',
      '    at hostWriteTrap.note (y.js:1:1)',
      '    at pageCode (https://example.com/a.js:1:1)'
    ];
    expect(pickCulpritFrame(frames, '')).toContain('example.com');
  });

  it('全部が自拡張なら先頭を返す(黙って空にしない=原因を消さない)', () => {
    const frames = [`    at foo (${OWN}dist/content.js:1:1)`];
    // ★空文字にすると「犯人不明」と区別できなくなる。あえて返して own-extension に分類させる。
    expect(pickCulpritFrame(frames, OWN)).toContain('content.js');
  });

  it('空配列・非配列は空文字', () => {
    expect(pickCulpritFrame([], OWN)).toBe('');
    expect(pickCulpritFrame(null, OWN)).toBe('');
    expect(pickCulpritFrame(undefined, OWN)).toBe('');
  });
});

describe('classifyCulpritUrl', () => {
  it('ニコ生のURLは page', () => {
    expect(classifyCulpritUrl('at t.x (https://live2.nicovideo.jp/m.js:1:1)', OWN)).toBe('page');
  });
  it('別の拡張IDは other-extension', () => {
    expect(classifyCulpritUrl('at x (chrome-extension://OTHERID/a.js:1:1)', OWN))
      .toBe('other-extension');
  });
  it('★自拡張IDは own-extension(other と混ぜない)', () => {
    expect(classifyCulpritUrl(`at x (${OWN}dist/content.js:1:1)`, OWN)).toBe('own-extension');
  });
  it('判別できないものは unknown', () => {
    expect(classifyCulpritUrl('at <anonymous>', OWN)).toBe('unknown');
    expect(classifyCulpritUrl('', OWN)).toBe('unknown');
  });
});

describe('noteHostWriteTrapReport — 合算と上限', () => {
  it('counts と noneWrites を合算する', () => {
    const s = createHostWriteTrapState();
    noteHostWriteTrapReport(s, { counts: { prop: 2, setAttribute: 1 }, noneWrites: 3 });
    noteHostWriteTrapReport(s, { counts: { prop: 1 }, noneWrites: 2 });
    expect(s.counts.prop).toBe(3);
    expect(s.counts.setAttribute).toBe(1);
    expect(s.noneWrites).toBe(5);
  });

  it(`★サンプルは ${TRAP_SAMPLE_MAX} 件で打ち切るが、回数は数え続ける`, () => {
    const s = createHostWriteTrapState();
    for (let i = 0; i < 7; i += 1) {
      noteHostWriteTrapReport(s, {
        noneWrites: 1,
        newSamples: [{ route: 'prop', valueHead: `v${i}`, frames: ['at x'], t: i }]
      });
    }
    expect(s.samples.length).toBe(TRAP_SAMPLE_MAX);
    expect(s.noneWrites).toBe(7);
  });

  it('長すぎる値・フレームは切り詰める(速報を膨らませない)', () => {
    const s = createHostWriteTrapState();
    noteHostWriteTrapReport(s, {
      newSamples: [{
        route: 'cssText',
        valueHead: 'x'.repeat(200),
        frames: ['y'.repeat(300), 'a', 'b', 'c', 'd']
      }]
    });
    expect(s.samples[0].valueHead.length).toBe(80);
    expect(s.samples[0].frames.length).toBe(3);
    expect(s.samples[0].frames[0].length).toBe(160);
  });

  it('壊れた入力で例外を投げない', () => {
    const s = createHostWriteTrapState();
    expect(() => noteHostWriteTrapReport(s, null)).not.toThrow();
    expect(() => noteHostWriteTrapReport(s, { newSamples: [null, 1, 'x'] })).not.toThrow();
    expect(() => noteHostWriteTrapReport(null, {})).not.toThrow();
  });
});

describe('formatHostWriteTrapLine — ★0の意味を三分岐で言い切る', () => {
  it('(1) arm未受信は「未装着」=まだ測れていない', () => {
    const line = formatHostWriteTrapLine(snapshotHostWriteTrap(createHostWriteTrapState(), OWN));
    expect(line).toContain('⚪');
    expect(line).toContain('未装着');
    expect(line).toContain('arm未受信');
    // ★「0回」と読めてはいけない。
    expect(line).not.toContain('0回');
  });

  it('(1b) 装着失敗は理由を出す', () => {
    const s = createHostWriteTrapState();
    noteHostWriteTrapArmed(s, false, 'defineProperty-threw');
    const line = formatHostWriteTrapLine(snapshotHostWriteTrap(s, OWN));
    expect(line).toContain('装着失敗');
    expect(line).toContain('defineProperty-threw');
  });

  it('★(2) 装着済みで0回は「ページではない」と積極的に言い、次の一手も出す', () => {
    const s = createHostWriteTrapState();
    noteHostWriteTrapArmed(s, true, '');
    const line = formatHostWriteTrapLine(snapshotHostWriteTrap(s, OWN));
    expect(line).toContain('✅');
    expect(line).toContain('0回');
    expect(line).toContain('ページではありません');
    expect(line).toContain('他の拡張');
  });

  it('★(3) 捕獲ありは犯人を名指しする(URL・関数名・分類)', () => {
    const s = createHostWriteTrapState();
    noteHostWriteTrapArmed(s, true, '');
    noteHostWriteTrapReport(s, {
      counts: { setAttribute: 7 },
      noneWrites: 7,
      newSamples: [{
        route: 'setAttribute',
        valueHead: 'display: none; pointer-events: none;',
        frames: [
          `    at Object.set (${OWN}dist/page-intercept.js:1:1)`,
          '    at t.restoreLayout (https://live2.nicovideo.jp/main.js:1:84213)'
        ]
      }]
    });
    const line = formatHostWriteTrapLine(snapshotHostWriteTrap(s, OWN));
    expect(line).toContain('⚠');
    expect(line).toContain('7回');
    expect(line).toContain('setAttribute:7');
    expect(line).toContain('restoreLayout');
    expect(line).toContain('[分類:ページ]');
    expect(line).toContain('display: none');
  });

  it('★自拡張が犯人だった場合は「計器矛盾」と明示(黙って混ぜない)', () => {
    const s = createHostWriteTrapState();
    noteHostWriteTrapArmed(s, true, '');
    noteHostWriteTrapReport(s, {
      counts: { prop: 1 }, noneWrites: 1,
      newSamples: [{ route: 'prop', valueHead: 'none', frames: [`    at foo (${OWN}dist/content.js:1:1)`] }]
    });
    expect(formatHostWriteTrapLine(snapshotHostWriteTrap(s, OWN))).toContain('計器矛盾');
  });

  it('null は空文字(速報を壊さない)', () => {
    expect(formatHostWriteTrapLine(null)).toBe('');
    expect(snapshotHostWriteTrap(null, OWN)).toBe(null);
  });
});
