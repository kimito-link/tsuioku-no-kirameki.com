import { describe, expect, it } from 'vitest';
import { buildMergedVoiceText, buildVoiceReadingText } from './voicevoxClient.js';
import {
  buildVoiceQueueSpeech,
  compileReadingDictionary,
  compileVoiceReadingScript,
  composeVoiceReading,
  DEFAULT_COMMENT_TEMPLATE,
  EMPTY_VOICE_READING_SCRIPT,
  excludeEntryFromInput,
  isVoiceReadingExcluded,
  mergeVoiceReadingImport,
  normalizeVoiceReadingScript,
  parseVoiceReadingImport,
  renderVoiceTemplate,
  serializeVoiceReadingScript,
  VOICE_READING_SCRIPT_SCHEMA
} from './voiceReadingScript.js';

describe('読み上げ辞書', () => {
  it('空の設定は今までどおり(名前、本文 / 本文だけ / 拍手の8)', () => {
    expect(buildVoiceReadingText({ name: 'リスナー', text: 'こんにちは' })).toBe('リスナー、こんにちは');
    expect(buildVoiceReadingText({ name: '', text: '8888' })).toBe('パチパチ');
    expect(buildMergedVoiceText({ name: '', body: '8888', count: 4 })).toBe('パチパチ、ほか3件');
  });

  it('辞書は整えより先。888 はぱちぱち、草はくさ。長い語が先', () => {
    const script = compileVoiceReadingScript({
      dictionary: [
        { word: '草', reading: 'くさ' },
        { word: '888', reading: 'ぱちぱち' },
        { word: '8888', reading: 'ぱちぱちぱち' }
      ]
    });
    expect(composeVoiceReading({ kind: 'comment', name: '', text: '草' }, { script })).toBe('くさ');
    expect(composeVoiceReading({ kind: 'comment', name: '', text: '888' }, { script })).toBe('ぱちぱち');
    expect(composeVoiceReading({ kind: 'comment', name: 'リスナー', text: '草888' }, { script })).toBe('リスナー、くさぱちぱち');
    expect(composeVoiceReading({ kind: 'comment', name: '', text: '8888' }, { script })).toBe('ぱちぱちぱち');
    expect(composeVoiceReading({ kind: 'comment', name: '', text: '88888' }, { script })).toBe('ぱちぱちぱち8');
    expect(composeVoiceReading({ kind: 'comment', name: '', text: '88888' })).toBe('パチパチ');
  });

  it('単語の中の記号は正規表現にしない', () => {
    const script = compileVoiceReadingScript({
      dictionary: [{ word: 'a.b', reading: 'えーびー' }]
    });
    expect(composeVoiceReading({ kind: 'comment', text: 'a.b' }, { script })).toBe('えーびー');
    expect(composeVoiceReading({ kind: 'comment', text: 'axb' }, { script })).toBe('axb');
  });

  it('置換の正規表現はコメントごとに作り直さない', () => {
    const script = compileVoiceReadingScript({
      dictionary: [{ word: '草', reading: 'くさ' }]
    });
    const re = script.dictRe;
    expect(re).toBeInstanceOf(RegExp);
    for (let i = 0; i < 40; i += 1) {
      expect(script.applyDict('草と草')).toBe('くさとくさ');
    }
    expect(script.dictRe).toBe(re);
    const compiled = compileReadingDictionary([{ word: '草', reading: 'くさ' }]);
    expect(compiled.re).toBe(compiled.re);
  });

  it('壊れた保存値は捨てて、型は既定に戻す', () => {
    const n = normalizeVoiceReadingScript({
      schemaVersion: 99,
      dictionary: [
        { word: '', reading: 'あ' },
        { word: '草', reading: 'くさ' },
        { word: '草', reading: 'くさくさ' },
        null
      ],
      commentTemplate: 'ただの文',
      giftTemplate: '{gift}',
      exclude: [{ key: 'bad', name: 'x' }, { key: 'u:12', name: '12', at: 3 }]
    });
    expect(n.schemaVersion).toBe(VOICE_READING_SCRIPT_SCHEMA);
    expect(n.dictionary).toEqual([{ word: '草', reading: 'くさくさ' }]);
    expect(n.commentTemplate).toBe(DEFAULT_COMMENT_TEMPLATE);
    expect(n.giftTemplate).toBe('{gift}');
    expect(n.exclude).toEqual([{ key: 'u:12', name: '12', at: 3 }]);
  });
});

describe('読み方の型', () => {
  it('既定のギフト文は今までと同じ', () => {
    const item = { kind: 'gift', nickname: 'リスナー', gift: { name: '花火', count: 3, message: 'よろしく' } };
    const speech = buildVoiceQueueSpeech(item, true);
    expect(speech.body).toBe('ギフト、花火を3個贈りました。よろしく');
    expect(composeVoiceReading(speech.reading)).toBe('リスナー、ギフト、花火を3個贈りました。よろしく');
    expect(composeVoiceReading(buildVoiceQueueSpeech(item, false).reading)).toBe('ギフト、花火を3個贈りました。よろしく');
    expect(composeVoiceReading(buildVoiceQueueSpeech({ kind: 'gift', gift: { name: '花火', count: 1, message: '' } }, false).reading))
      .toBe('ギフト、花火を贈りました。');
  });

  it('ギフトの型を別にできる。名前が空なら「さん」も読点も残さない', () => {
    const script = compileVoiceReadingScript({
      giftTemplate: '{name}さん {gift} ありがとう',
      commentTemplate: '{comment}'
    });
    expect(composeVoiceReading(
      { kind: 'gift', name: 'リスナー', gift: '花火', count: 1, message: '' },
      { script }
    )).toBe('リスナーさん 花火 ありがとう');
    expect(composeVoiceReading(
      { kind: 'gift', name: '', gift: '花火', count: 2, message: '' },
      { script }
    )).toBe('花火 ありがとう');
    expect(composeVoiceReading({ kind: 'comment', name: 'リスナー', text: 'こんにちは' }, { script })).toBe('こんにちは');
    expect(renderVoiceTemplate(script.commentParts, { name: '', comment: 'こんにちは' })).toBe('こんにちは');
  });

  it('名前は本文の文字数に含めない', () => {
    const kana = (n) => Array.from({ length: n }, (_, i) => 'あいうえおかきくけこ'[i % 10]).join('');
    expect(buildVoiceReadingText({ name: 'リスナー', text: kana(50) }, { maxChars: 40 })).toBe(`リスナー、${kana(40)}`);
  });

  it('空の本文は名前があっても読まない', () => {
    expect(composeVoiceReading({ kind: 'comment', name: 'リスナー', text: '  ' })).toBe('');
  });
});

describe('読まない人・書き出し', () => {
  it('ユーザーIDと表示名で読まない人を作る。匿名のような汎用名は捨てる', () => {
    expect(excludeEntryFromInput('12')?.key).toBe('u:12');
    expect(excludeEntryFromInput('リスナー')?.key).toBe('n:リスナー');
    expect(excludeEntryFromInput('匿名')).toBeNull();
    const script = compileVoiceReadingScript({ exclude: [excludeEntryFromInput('12')] });
    expect(isVoiceReadingExcluded({ userId: '12', nickname: 'リスナー' }, script)).toBe(true);
    expect(isVoiceReadingExcluded({ userId: '13', nickname: 'リスナー' }, script)).toBe(false);
    expect(isVoiceReadingExcluded({ userId: '12' }, EMPTY_VOICE_READING_SCRIPT)).toBe(false);
  });

  it('JSON は置き換え、単語一覧は辞書だけ足す', () => {
    const current = normalizeVoiceReadingScript({
      dictionary: [{ word: '草', reading: 'くさ' }],
      commentTemplate: '{comment}',
      exclude: [{ key: 'u:1', name: '1' }]
    });
    const lines = parseVoiceReadingImport('888\tぱちぱち\n# メモ\n草、くさくさ\n');
    expect(lines.ok).toBe(true);
    if (!lines.ok) return;
    const merged = mergeVoiceReadingImport(current, lines);
    expect(merged.dictionary).toEqual([
      { word: '草', reading: 'くさくさ' },
      { word: '888', reading: 'ぱちぱち' }
    ]);
    expect(merged.commentTemplate).toBe('{comment}');
    expect(merged.exclude).toEqual([{ key: 'u:1', name: '1', at: 0 }]);

    const doc = parseVoiceReadingImport(serializeVoiceReadingScript(merged));
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    expect(doc.mode).toBe('document');
    expect(mergeVoiceReadingImport(current, doc).commentTemplate).toBe('{comment}');
    expect(parseVoiceReadingImport('{')).toEqual({ ok: false, reason: 'bad-json' });
  });
});
