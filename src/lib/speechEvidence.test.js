import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  SPEECH_UNKNOWN,
  hasSpeech,
  mergeSpeechEvidence,
  speechEvidence,
  speechEvidenceFromCandidate,
  speechEvidenceFromMirrorCell,
  speechEvidenceFromRoster,
  speechEvidenceFromRow
} from './speechEvidence.js';

/** 2026-10-16: 「発言の証拠」の規則。0(数えた結果)と null(不明)を区別し、証拠の無い人に件数・時刻を捏造しない。 */
describe('speechEvidence', () => {
  it('★comments: 0(数えた結果)と null(不明)を区別する', () => {
    expect(speechEvidence({ comments: 0 }).comments).toBe(0);
    expect(speechEvidence({}).comments).toBeNull();
    expect(speechEvidence({ comments: 'abc' }).comments).toBeNull();
    expect(speechEvidence({ comments: 3.9 }).comments).toBe(3);
  });
  it('★texts から件数を捏造しない(texts 3件・comments 無し → comments は null のまま)', () => {
    expect(speechEvidence({ texts: ['a', 'b', 'c'] }).comments).toBeNull();
  });
  it('comments 0 なのに texts がある矛盾は不明(null)へ倒す', () => {
    expect(speechEvidence({ comments: 0, texts: ['x'] }).comments).toBeNull();
  });
  it('texts: 空文字・空白だけは捨て、空白を畳み、上限(5件)で切る', () => {
    const e = speechEvidence({ texts: ['  a   b ', '', '   ', 'c', 'd', 'e', 'f', 'g'] });
    expect(e.texts).toEqual(['a b', 'c', 'd', 'e', 'f']);
  });
  it('lastAt: 有限かつ正のときだけ・0/負/不正は null', () => {
    expect(speechEvidence({ lastAt: 123.7 }).lastAt).toBe(123);
    expect(speechEvidence({ lastAt: 0 }).lastAt).toBeNull();
    expect(speechEvidence({ lastAt: -5 }).lastAt).toBeNull();
    expect(speechEvidence({ lastAt: 'x' }).lastAt).toBeNull();
  });
  it('入力が null/undefined でも落ちない', () => {
    expect(speechEvidence(null)).toEqual({ comments: null, lastAt: null, texts: [] });
    expect(speechEvidence(undefined)).toEqual({ comments: null, lastAt: null, texts: [] });
  });
});

describe('hasSpeech', () => {
  it('★不明・0件・本文なしは偽 / 本文あり・件数>0 は真', () => {
    expect(hasSpeech(SPEECH_UNKNOWN)).toBe(false);
    expect(hasSpeech(speechEvidence({ comments: 0 }))).toBe(false);
    expect(hasSpeech(null)).toBe(false);
    expect(hasSpeech(speechEvidence({ texts: ['a'] }))).toBe(true);
    expect(hasSpeech(speechEvidence({ comments: 2 }))).toBe(true);
  });
});

describe('speechEvidenceFromCandidate', () => {
  it('★commentCount 0 の候補(支援者のみ)は lastAt を作らない / 3件なら _laneSortAt', () => {
    expect(speechEvidenceFromCandidate({ commentCount: 0, _laneSortAt: 999, recentTexts: [] })).toEqual({ comments: 0, lastAt: null, texts: [] });
    expect(speechEvidenceFromCandidate({ commentCount: 3, _laneSortAt: 999, recentTexts: ['a'] })).toEqual({ comments: 3, lastAt: 999, texts: ['a'] });
  });
  it('欠落(commentCount 無し・recentTexts 無し)は不明として落ちない', () => {
    expect(speechEvidenceFromCandidate({})).toEqual({ comments: null, lastAt: null, texts: [] });
    expect(speechEvidenceFromCandidate(null)).toBe(SPEECH_UNKNOWN);
  });
});

describe('speechEvidenceFromMirrorCell', () => {
  it('★時刻を作らない(capturedAt を受け取らない)', () => {
    const e = speechEvidenceFromMirrorCell({ stats: { c: 4 }, recentTexts: ['a'], capturedAt: Date.now() });
    expect(e.lastAt).toBeNull();
    expect(e.comments).toBe(4);
    expect(e.texts).toEqual(['a']);
  });
  it('stats.c が 0/無し は不明(数えていないと区別できない)', () => {
    expect(speechEvidenceFromMirrorCell({ stats: { c: 0 } }).comments).toBeNull();
    expect(speechEvidenceFromMirrorCell({}).comments).toBeNull();
  });
});

describe('speechEvidenceFromRoster', () => {
  it('★lastTextAt が優先・無ければ件数>0 のとき lastSeen・旧エントリでも落ちない', () => {
    expect(speechEvidenceFromRoster({ commentCount: 2, lastTextAt: 500, lastSeen: 900, recentTexts: ['a'] }).lastAt).toBe(500);
    expect(speechEvidenceFromRoster({ commentCount: 2, lastSeen: 900, recentTexts: ['a'] }).lastAt).toBe(900);
    expect(speechEvidenceFromRoster({ commentCount: 0, lastSeen: 900 }).lastAt).toBeNull();
    expect(speechEvidenceFromRoster({}).comments).toBeNull();
  });
  it('★realComments があれば commentCount(下駄込み)でなくそれを使う(0 も有効な答え)', () => {
    expect(speechEvidenceFromRoster({ commentCount: 1, realComments: 0, lastSeen: 900 })).toEqual({ comments: 0, lastAt: null, texts: [] });
    expect(speechEvidenceFromRoster({ commentCount: 1, realComments: null, lastSeen: 900 }).comments).toBeNull();
    expect(speechEvidenceFromRoster({ commentCount: 9, realComments: 2, lastSeen: 900 }).comments).toBe(2);
  });
  it('recentTexts が無く lastText があれば1件として使う', () => {
    expect(speechEvidenceFromRoster({ commentCount: 1, lastText: 'こんにちは', lastSeen: 10 }).texts).toEqual(['こんにちは']);
  });
});

describe('speechEvidenceFromRow', () => {
  it('本文のある生の行は1件の発言・本文なし/ギフト行は不明', () => {
    expect(speechEvidenceFromRow({ text: 'hi', capturedAt: 50 })).toEqual({ comments: 1, lastAt: 50, texts: ['hi'] });
    expect(speechEvidenceFromRow({ text: '', capturedAt: 50 })).toBe(SPEECH_UNKNOWN);
    expect(speechEvidenceFromRow({ text: 'x', isGift: true })).toBe(SPEECH_UNKNOWN);
  });
});

describe('mergeSpeechEvidence', () => {
  it('★両方 null→null / 片方既知→和 / lastAt は max / texts は新しい行優先', () => {
    expect(mergeSpeechEvidence(SPEECH_UNKNOWN, SPEECH_UNKNOWN).comments).toBeNull();
    const a = speechEvidence({ comments: 2, lastAt: 100, texts: ['old'] });
    const b = speechEvidence({ comments: 3, lastAt: 200, texts: ['new'] });
    expect(mergeSpeechEvidence(a, b)).toEqual({ comments: 5, lastAt: 200, texts: ['new'] });
    expect(mergeSpeechEvidence(a, SPEECH_UNKNOWN)).toEqual({ comments: 2, lastAt: 100, texts: ['old'] });
    expect(mergeSpeechEvidence(SPEECH_UNKNOWN, b)).toEqual({ comments: 3, lastAt: 200, texts: ['new'] });
  });
  it('新しい行に本文が無ければ古い本文を残す', () => {
    const a = speechEvidence({ comments: 1, lastAt: 100, texts: ['old'] });
    const b = speechEvidence({ comments: 1, lastAt: 200, texts: [] });
    expect(mergeSpeechEvidence(a, b).texts).toEqual(['old']);
  });
});

describe('★変異テスト: このファイルに Math.max(1 を書かない', () => {
  it('speechEvidence.js のソースに「Math.max(1」が無い(0 や不明を 1 にする下駄が嘘の根)', () => {
    const src = fs.readFileSync(path.resolve('src/lib/speechEvidence.js'), 'utf8');
    // コメント行は除いて検査する(説明文で触れるのは許す)
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    expect(code).not.toMatch(/Math\.max\(\s*1\b/);
  });
});
