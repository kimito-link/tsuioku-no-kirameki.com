import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPresetNoSet, selectPresetFiles, buildManifest } from './install-local-sounds.mjs';
import { CUSTOM_SOUND_PRESET } from '../src/lib/customSoundPreset.js';

const SCRIPT_PATH = fileURLToPath(new URL('./install-local-sounds.mjs', import.meta.url));

describe('buildPresetNoSet', () => {
  it('プリセット全体のユニークなNo.集合を作る(No.は複数キーから参照されうるため件数はcountPresetAssets以下)', () => {
    const set = buildPresetNoSet();
    expect(set.size).toBeGreaterThan(0);
    expect(set.size).toBeLessThanOrEqual(
      Object.values(CUSTOM_SOUND_PRESET).reduce((sum, list) => sum + list.length, 0)
    );
    // 代表的な1件が含まれること
    expect(set.has(204361)).toBe(true);
  });
});

describe('selectPresetFiles(ソースディレクトリのファイル名一覧からプリセット該当分だけ抽出)', () => {
  it('プリセットに載っているNo.のファイルだけ拾う(拡張子mp3/wav混在)', () => {
    const presetNoSet = new Set([204361, 812926]);
    const filenames = [
      'audiostock_204361.mp3',
      'audiostock_812926.wav',
      'audiostock_999999.mp3', // プリセット外
      'readme.txt' // 非対応拡張子
    ];
    const { files, matchedCount, skippedCount } = selectPresetFiles(filenames, presetNoSet);
    expect(files).toEqual({
      as_204361: 'audiostock_204361.mp3',
      as_812926: 'audiostock_812926.wav'
    });
    expect(matchedCount).toBe(2);
    expect(skippedCount).toBe(1); // audiostock_999999.mp3(readme.txtは拡張子非対応で数えない)
  });

  it('ファイル名がaudiostock_パターンにマッチしない場合はスキップする', () => {
    const presetNoSet = new Set([204361]);
    const filenames = ['random-file.mp3', 'audiostock_204361.mp3'];
    const { files, matchedCount } = selectPresetFiles(filenames, presetNoSet);
    expect(files).toEqual({ as_204361: 'audiostock_204361.mp3' });
    expect(matchedCount).toBe(1);
  });

  it('同一idの重複(拡張子違い)は最初の1件だけ採用する', () => {
    const presetNoSet = new Set([204361]);
    const filenames = ['audiostock_204361.mp3', 'audiostock_204361.wav'];
    const { files, matchedCount } = selectPresetFiles(filenames, presetNoSet);
    expect(Object.keys(files)).toHaveLength(1);
    expect(matchedCount).toBe(1);
  });

  it('空のソース一覧では空を返す', () => {
    const { files, matchedCount, skippedCount } = selectPresetFiles([], new Set([1]));
    expect(files).toEqual({});
    expect(matchedCount).toBe(0);
    expect(skippedCount).toBe(0);
  });
});

describe('buildManifest', () => {
  it('files/count/generatedAtを組み立てる', () => {
    const files = { as_1: 'a.mp3', as_2: 'b.wav' };
    const manifest = buildManifest(files, 12345);
    expect(manifest).toEqual({ files, count: 2, generatedAt: 12345 });
  });

  it('空files→count:0', () => {
    expect(buildManifest({}, 1)).toEqual({ files: {}, count: 0, generatedAt: 1 });
  });
});

describe('install-local-sounds.mjs 実行(D:\\download 相当が無くても落ちない)', () => {
  const tmpDirs = [];
  afterEach(() => {
    for (const d of tmpDirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* no-op */ }
    }
    tmpDirs.length = 0;
  });

  function mkTmp(prefix) {
    const d = mkdtempSync(join(tmpdir(), prefix));
    tmpDirs.push(d);
    return d;
  }

  it('ソースディレクトリが存在しない場合、エラーにならず終了する(exit 0)', () => {
    const missingSrc = join(mkTmp('nl-sound-src-'), 'does-not-exist');
    const extDest = mkTmp('nl-ext-dest-');
    const result = execFileSync(process.execPath, [SCRIPT_PATH], {
      env: { ...process.env, NL_SOUND_SRC_DIR: missingSrc, NL_EXT_DEST: extDest },
      encoding: 'utf8'
    });
    expect(result).toMatch(/スキップします/);
    expect(existsSync(join(extDest, 'sound', 'custom', 'manifest.json'))).toBe(false);
  });

  it('拡張の展開先が存在しない場合も、エラーにならず終了する(先にcopy:extが必要という案内)', () => {
    const srcDir = mkTmp('nl-sound-src-');
    const missingExtDest = join(mkTmp('nl-ext-dest-'), 'does-not-exist');
    const result = execFileSync(process.execPath, [SCRIPT_PATH], {
      env: { ...process.env, NL_SOUND_SRC_DIR: srcDir, NL_EXT_DEST: missingExtDest },
      encoding: 'utf8'
    });
    expect(result).toMatch(/展開先が見つからない/);
  });

  it('プリセット該当ファイルを実際にコピーし、manifest.jsonを生成する', () => {
    const srcDir = mkTmp('nl-sound-src-');
    const extDest = mkTmp('nl-ext-dest-');
    // プリセットに実在するNo.を1件使う(customSoundPreset.js の gift_medium 先頭)。
    const sampleAsset = CUSTOM_SOUND_PRESET.gift_medium[0];
    const filename = `audiostock_${sampleAsset.no}.mp3`;
    writeFileSync(join(srcDir, filename), 'dummy-audio-bytes');
    writeFileSync(join(srcDir, 'audiostock_999999999.mp3'), 'not-in-preset'); // プリセット外

    execFileSync(process.execPath, [SCRIPT_PATH], {
      env: { ...process.env, NL_SOUND_SRC_DIR: srcDir, NL_EXT_DEST: extDest },
      encoding: 'utf8'
    });

    const outDir = join(extDest, 'sound', 'custom');
    expect(existsSync(join(outDir, filename))).toBe(true);
    expect(existsSync(join(outDir, 'audiostock_999999999.mp3'))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
    expect(manifest.files[sampleAsset.id]).toBe(filename);
    expect(manifest.count).toBe(1);
    expect(typeof manifest.generatedAt).toBe('number');
  });

  it('プリセット該当ファイルが1件も無い場合はmanifestを生成しない', () => {
    const srcDir = mkTmp('nl-sound-src-');
    const extDest = mkTmp('nl-ext-dest-');
    writeFileSync(join(srcDir, 'audiostock_999999999.mp3'), 'not-in-preset');
    mkdirSync(join(extDest, 'sound'), { recursive: true });

    execFileSync(process.execPath, [SCRIPT_PATH], {
      env: { ...process.env, NL_SOUND_SRC_DIR: srcDir, NL_EXT_DEST: extDest },
      encoding: 'utf8'
    });

    expect(existsSync(join(extDest, 'sound', 'custom', 'manifest.json'))).toBe(false);
  });
});
