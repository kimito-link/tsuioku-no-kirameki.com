import { describe, it, expect } from 'vitest';
import {
  copyDiagBySchema,
  makeInitialFromSchema,
  makeNonDefaultSample,
  defaultValueForKind,
  defaultForField,
  coerceByKind,
  schemaFieldNames
} from './diagSchemaCopy.js';
import { CANONICAL_TIME_FIELD } from './timeAuthority.js';

/** @type {import('./diagSchemaCopy.js').DiagSchema} */
const SCHEMA = [
  { name: 'hits', kind: 'count' },
  { name: 'lastMs', kind: 'ms' },
  { name: 'ready', kind: 'flag' },
  { name: 'note', kind: 'text' },
  { name: 'stage', kind: 'stage' },
  { name: 'lastAt', kind: 'count', default: 0 }
];

describe('defaultValueForKind: kind ごとの既定値', () => {
  it('ms だけ -1(未計測)で、count の 0 と区別される', () => {
    expect(defaultValueForKind('ms')).toBe(-1);
    expect(defaultValueForKind('count')).toBe(0);
    expect(defaultValueForKind('flag')).toBe(false);
    expect(defaultValueForKind('text')).toBe('');
    expect(defaultValueForKind('stage')).toBe('');
  });

  it('field.default があれば kind 既定より優先される', () => {
    expect(defaultForField({ name: 'x', kind: 'ms', default: 0 })).toBe(0);
    expect(defaultForField({ name: 'x', kind: 'ms' })).toBe(-1);
  });
});

describe('makeInitialFromSchema', () => {
  it('schema のキー集合と一致し、既定値で埋まる', () => {
    expect(makeInitialFromSchema(SCHEMA)).toEqual({
      hits: 0,
      lastMs: -1,
      ready: false,
      note: '',
      stage: '',
      lastAt: 0
    });
  });

  it('壊れた schema(null/非配列/名前なし)でも落ちない', () => {
    expect(makeInitialFromSchema(null)).toEqual({});
    expect(makeInitialFromSchema([{ kind: 'count' }])).toEqual({});
  });
});

describe('copyDiagBySchema: ★個別列挙の廃止(失敗#3 の構造的根絶)', () => {
  it('schema にある値を全部写す', () => {
    const input = { hits: 3, lastMs: 120, ready: true, note: 'x', stage: 'persist', lastAt: 999 };
    expect(copyDiagBySchema(SCHEMA, input)).toEqual(input);
  });

  it('schema に無い値は落とす', () => {
    const copied = copyDiagBySchema(SCHEMA, { hits: 1, stray: 'no' });
    expect('stray' in copied).toBe(false);
  });

  it('欠損は既定値で埋める(読み手が undefined を踏まない)', () => {
    expect(copyDiagBySchema(SCHEMA, {})).toEqual(makeInitialFromSchema(SCHEMA));
    expect(copyDiagBySchema(SCHEMA, null)).toEqual(makeInitialFromSchema(SCHEMA));
    expect(copyDiagBySchema(SCHEMA, 'not-an-object')).toEqual(makeInitialFromSchema(SCHEMA));
  });

  it('数値化できない値は既定値へ落とす(壊れた storage 値を下流に流さない)', () => {
    const copied = copyDiagBySchema(SCHEMA, { hits: 'abc', lastMs: NaN });
    expect(copied.hits).toBe(0);
    expect(copied.lastMs).toBe(-1);
  });

  it('ms の 0 は「観測して0」として保たれる(-1 に化けない)', () => {
    expect(copyDiagBySchema(SCHEMA, { lastMs: 0 }).lastMs).toBe(0);
  });

  it('時点は明示指定したときだけ付く(時点は epoch だけ保存)', () => {
    // ★フィールド名は timeAuthority の正本から取る(テスト側でも文字列を独自に書かない)。
    expect(CANONICAL_TIME_FIELD in copyDiagBySchema(SCHEMA, {})).toBe(false);
    expect(copyDiagBySchema(SCHEMA, {}, { [CANONICAL_TIME_FIELD]: 1234 })[CANONICAL_TIME_FIELD]).toBe(1234);
    expect(copyDiagBySchema(SCHEMA, {}, { [CANONICAL_TIME_FIELD]: NaN })[CANONICAL_TIME_FIELD]).toBe(0);
  });

  it('★schema にフィールドを足して snapshot 側を直し忘れる事故が起きない', () => {
    // 「schema に1つ足す」だけで copy 結果にも必ず現れることを示す=これが v1355 の根拠。
    const extended = [...SCHEMA, { name: 'newField', kind: 'count' }];
    const copied = copyDiagBySchema(extended, { newField: 42 });
    expect(copied.newField).toBe(42);
  });
});

describe('coerceByKind', () => {
  it('flag は真偽値化、text は文字列化する', () => {
    expect(coerceByKind(1, { name: 'f', kind: 'flag' })).toBe(true);
    expect(coerceByKind(undefined, { name: 'f', kind: 'flag' })).toBe(false);
    expect(coerceByKind(5, { name: 't', kind: 'text' })).toBe('5');
    expect(coerceByKind({}, { name: 't', kind: 'text' })).toBe('');
  });
});

describe('makeNonDefaultSample: G2 の合成入力', () => {
  it('全フィールドが既定値と異なる', () => {
    const sample = makeNonDefaultSample(SCHEMA);
    const initial = makeInitialFromSchema(SCHEMA);
    for (const name of schemaFieldNames(SCHEMA)) {
      expect(sample[name], name).not.toEqual(initial[name]);
    }
  });

  it('往復して同じ値が戻る(G2 が恒真でないことの確認)', () => {
    const sample = makeNonDefaultSample(SCHEMA);
    expect(copyDiagBySchema(SCHEMA, sample)).toEqual(sample);
  });
});
