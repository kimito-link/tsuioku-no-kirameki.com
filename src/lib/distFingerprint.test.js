import { describe, it, expect } from 'vitest';
import {
  FINGERPRINT_SCHEMA,
  ALWAYS_INPUTS,
  maskBuildId,
  normalizeInputs,
  fingerprintText,
  judgeDistFreshness,
  judgeBuildInputsHealthy
} from './distFingerprint.js';

describe('maskBuildId', () => {
  it('MMDD-HHmmss 形式の buildId を固定文字列に置換する', () => {
    expect(maskBuildId('nicolivelog build 0921-201053 done')).toBe('nicolivelog build MMDD-HHmmss done');
  });

  it('複数箇所の buildId をすべて置換する(g フラグ)', () => {
    expect(maskBuildId('a 0921-201053 b 0921-201251 c')).toBe('a MMDD-HHmmss b MMDD-HHmmss c');
  });

  it('★ループ根治の核心: buildId だけが違う2つの本文は同じマスク結果になる', () => {
    const before = 'const NL_BUILD_ID="0921-201053";function x(){}';
    const after = 'const NL_BUILD_ID="0921-201251";function x(){}';
    expect(maskBuildId(before)).toBe(maskBuildId(after));
  });

  it('buildId が無ければ変化しない', () => {
    expect(maskBuildId('plain text no id')).toBe('plain text no id');
  });

  it('null/undefined は空文字として扱う', () => {
    expect(maskBuildId(null)).toBe('');
    expect(maskBuildId(undefined)).toBe('');
  });
});

describe('normalizeInputs', () => {
  it('常時入力(ALWAYS_INPUTS)を常に含む', () => {
    const result = normalizeInputs([]);
    for (const always of ALWAYS_INPUTS) {
      expect(result).toContain(always);
    }
  });

  it('バックスラッシュを posix 区切りへ正規化する', () => {
    const result = normalizeInputs(['src\\extension\\popup-entry.js']);
    expect(result).toContain('src/extension/popup-entry.js');
  });

  it('先頭の ./ を除去する', () => {
    const result = normalizeInputs(['./src/lib/foo.js']);
    expect(result).toContain('src/lib/foo.js');
  });

  it('node_modules 配下を除外する', () => {
    const result = normalizeInputs(['node_modules/esbuild/lib/main.js', 'src/lib/foo.js']);
    expect(result).not.toContain('node_modules/esbuild/lib/main.js');
    expect(result).toContain('src/lib/foo.js');
  });

  it('入れ子の node_modules も除外する', () => {
    const result = normalizeInputs(['a/node_modules/b/index.js']);
    expect(result.some((p) => p.includes('node_modules'))).toBe(false);
  });

  it('重複を除去し、ソート済みで返す', () => {
    const result = normalizeInputs(['src/b.js', 'src/a.js', 'src/a.js']);
    const filtered = result.filter((p) => p.startsWith('src/'));
    expect(filtered).toEqual(['src/a.js', 'src/b.js']);
  });

  it('空/未定義の入力を無視する', () => {
    const result = normalizeInputs(['', undefined, null, 'src/x.js']);
    expect(result).toContain('src/x.js');
  });
});

describe('fingerprintText', () => {
  it('mode と entries(path+blob)を含む決定的なテキストを返す', () => {
    const text = fingerprintText({
      mode: 'default',
      entries: [
        { path: 'src/b.js', blob: 'bbb' },
        { path: 'src/a.js', blob: 'aaa' }
      ]
    });
    expect(text).toContain(`schema=${FINGERPRINT_SCHEMA}`);
    expect(text).toContain('mode=default');
    expect(text).toContain('src/a.js aaa');
    expect(text).toContain('src/b.js bbb');
  });

  it('entries の順序に依存しない(内部でソートする)', () => {
    const a = fingerprintText({
      mode: 'default',
      entries: [{ path: 'z.js', blob: '1' }, { path: 'a.js', blob: '2' }]
    });
    const b = fingerprintText({
      mode: 'default',
      entries: [{ path: 'a.js', blob: '2' }, { path: 'z.js', blob: '1' }]
    });
    expect(a).toBe(b);
  });
});

describe('judgeDistFreshness', () => {
  const validSidecar = {
    schema: FINGERPRINT_SCHEMA,
    mode: 'default',
    fingerprint: 'abc123def456',
    inputs: ['src/a.js'],
    outputs: { 'extension/dist/a.js': 'hashA' }
  };

  it('正常系: 全て一致すれば ok', () => {
    const result = judgeDistFreshness({
      sidecar: validSidecar,
      fingerprint: 'abc123def456',
      missingInputs: [],
      outputHashes: { 'extension/dist/a.js': 'hashA' }
    });
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it('sidecar が無ければ NG', () => {
    const result = judgeDistFreshness({
      sidecar: null,
      fingerprint: null,
      missingInputs: [],
      outputHashes: {}
    });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/無い\/形式が違う/);
  });

  it('sidecar の schema が違えば NG', () => {
    const result = judgeDistFreshness({
      sidecar: { ...validSidecar, schema: 999 },
      fingerprint: 'abc123def456',
      missingInputs: [],
      outputHashes: { 'extension/dist/a.js': 'hashA' }
    });
    expect(result.ok).toBe(false);
  });

  it('入力の blob が1件でも欠けていれば NG', () => {
    const result = judgeDistFreshness({
      sidecar: validSidecar,
      fingerprint: 'abc123def456',
      missingInputs: ['src/a.js'],
      outputHashes: { 'extension/dist/a.js': 'hashA' }
    });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes('src/a.js'))).toBe(true);
  });

  it('指紋が不一致なら NG(ビルド入力が変わっている)', () => {
    const result = judgeDistFreshness({
      sidecar: validSidecar,
      fingerprint: 'different999',
      missingInputs: [],
      outputHashes: { 'extension/dist/a.js': 'hashA' }
    });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes('一致しない'))).toBe(true);
  });

  it('出力ファイルがこの tree に無ければ NG(add 忘れ)', () => {
    const result = judgeDistFreshness({
      sidecar: validSidecar,
      fingerprint: 'abc123def456',
      missingInputs: [],
      outputHashes: { 'extension/dist/a.js': null }
    });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes('add 忘れ'))).toBe(true);
  });

  it('出力ファイルの中身が sidecar と違えば NG(手編集/watch出力等)', () => {
    const result = judgeDistFreshness({
      sidecar: validSidecar,
      fingerprint: 'abc123def456',
      missingInputs: [],
      outputHashes: { 'extension/dist/a.js': 'differentHash' }
    });
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes('build 時と違う'))).toBe(true);
  });

  it('複数の問題を同時に検出できる', () => {
    const result = judgeDistFreshness({
      sidecar: validSidecar,
      fingerprint: 'different999',
      missingInputs: ['src/gone.js'],
      outputHashes: { 'extension/dist/a.js': null }
    });
    expect(result.ok).toBe(false);
    expect(result.problems.length).toBeGreaterThanOrEqual(3);
  });
});

describe('judgeBuildInputsHealthy', () => {
  it('★rawInputCount が 0 なら NG(esbuildのmetafile仕様変更等で静かに空になる穴の検知)', () => {
    const r = judgeBuildInputsHealthy({ rawInputCount: 0, targetCount: 15 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/空/);
  });

  it('rawInputCount が targetCount 未満なら NG', () => {
    const r = judgeBuildInputsHealthy({ rawInputCount: 10, targetCount: 15 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/entryPoint/);
  });

  it('rawInputCount が targetCount 以上なら OK(実測相当: 761件/15targets)', () => {
    const r = judgeBuildInputsHealthy({ rawInputCount: 761, targetCount: 15 });
    expect(r.ok).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('境界: ちょうど targetCount と同数なら OK', () => {
    const r = judgeBuildInputsHealthy({ rawInputCount: 15, targetCount: 15 });
    expect(r.ok).toBe(true);
  });
});
