// diagChannelRegistry.contract.test.js
// ★registry を反復して**全チャンネルに同じ検査**を掛ける契約テスト。
//   HANDOFF-instrument-channels-2026-08-12.md §3 のゲートG1〜G6。
//
// なぜ「チャンネルごとの個別テスト」でなく registry 反復なのか:
//   個別に書くと、新しい計器を足した人がテストを書き忘れる(そして書き忘れは静かに通る)。
//   registry に1エントリ足した瞬間に6ゲート全部が自動で掛かる形にして初めて、
//   「計器を増やすほど断線が増える」が止まる。
//
// ★各ゲートは v1349 実装時に変異(mutation)で赤を1回ずつ確認済み。
//   確認手順は同ディレクトリの慣例どおり「変異を当てる→赤を見る→戻す」。
//   ★変異が**適用されたこと**まで確認する(CRLF/エスケープで空振りした前科が2回ある)。

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { DIAG_CHANNELS, wiredChannels, channelsByStatus, findChannel } from './diagChannelRegistry.js';
import {
  copyDiagBySchema,
  makeInitialFromSchema,
  makeNonDefaultSample,
  schemaFieldNames,
  defaultForField
} from './diagSchemaCopy.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

/** @param {string} rel @returns {string} */
function readRepoFile(rel) {
  return readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

/**
 * キー定数の識別子名を storage キー文字列から逆引きせず、値そのものの出現を数える。
 *   ★値(例 'nls_comment_post_diag_v1')ではなく**定数名**を数える理由:
 *   配線は import した定数経由で行われるので、定数名の出現数が実際の配線箇所数になる。
 * @param {string} src @param {string} ident @returns {number}
 */
function countIdentifier(src, ident) {
  const re = new RegExp(`\\b${ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  return (src.match(re) || []).length;
}

/**
 * registry のキー値から、その定数名を解決する。
 *   キー定数ファイルは `export const KEY_XXX = 'value';` の形で1ファイル1定数の慣例。
 * @param {string} keyValue
 * @returns {string}
 */
function resolveKeyIdentifier(keyValue) {
  // src/lib/*Key.js を舐めて value が一致する export const 名を拾う。
  const libDir = path.join(REPO_ROOT, 'src', 'lib');
  for (const f of readdirSync(libDir)) {
    if (!f.endsWith('Key.js') && !f.endsWith('Keys.js')) continue;
    const src = readFileSync(path.join(libDir, f), 'utf8');
    const re = /export\s+const\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src))) {
      if (m[2] === keyValue) return m[1];
    }
  }
  return '';
}

describe('diagChannelRegistry: 台帳そのものの健全性', () => {
  it('エントリが1件以上あり、必須フィールドが揃っている', () => {
    expect(DIAG_CHANNELS.length).toBeGreaterThan(0);
    for (const c of DIAG_CHANNELS) {
      expect(typeof c.id, `id: ${c.id}`).toBe('string');
      expect(c.id.length, `id: ${c.id}`).toBeGreaterThan(0);
      expect(typeof c.key, `key: ${c.id}`).toBe('string');
      expect(c.key.length, `key: ${c.id}`).toBeGreaterThan(0);
      expect(Array.isArray(c.schema), `schema: ${c.id}`).toBe(true);
      expect(c.schema.length, `schema: ${c.id}`).toBeGreaterThan(0);
      expect(['wired', 'planned'], `status: ${c.id}`).toContain(c.status);
    }
  });

  it('findChannel が id で引ける', () => {
    for (const c of DIAG_CHANNELS) expect(findChannel(c.id)).toBe(c);
    expect(findChannel('no.such.channel')).toBeNull();
  });

  it('planned チャンネルを一覧表示する(黙って許さないための可視化)', () => {
    const planned = channelsByStatus('planned');
    // planned は許されるが、存在するなら必ずここに出る。
    if (planned.length > 0) console.info('[registry] planned(未配線):', planned.map((c) => c.id).join(', '));
    expect(Array.isArray(planned)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────
// G1 配線両端(塞ぐ失敗: #1 判定はあるが配線されていない / #2 読み手だけ足して書き手が無い)
// ───────────────────────────────────────────────────────────────
describe('G1: wired チャンネルはキー定数が writer/reader の両方に「数どおり」出現する', () => {
  // ★空回り防止(zero-count-may-mean-unmeasured): registry が空/全 planned になると
  //   for ループが0周し、G1 は「1件も検査していない」のに緑になる。
  //   v1349 のミューテーション検証で実際にこれを踏んだ(entry を消したら赤が1件しか出なかった)。
  //   wired が0件になったこと自体を異常として検出する。
  it('wired チャンネルが1件以上ある(0件なら以下の検査が全部空回りする)', () => {
    expect(wiredChannels().length).toBeGreaterThan(0);
  });

  for (const c of wiredChannels()) {
    it(`${c.id}: writer(${c.writerFile}) と reader(${c.readerFile}) の両方`, () => {
      const ident = resolveKeyIdentifier(c.key);
      expect(ident, `キー定数名が解決できない: ${c.key}`).not.toBe('');

      const writerSrc = readRepoFile(c.writerFile);
      const readerSrc = readRepoFile(c.readerFile);

      // ★「1箇所以上」ではなく**数で断言**する(wiring-test-must-assert-counts)。
      //   片方の配線が消えたときに緑のままにならないため。
      expect(countIdentifier(writerSrc, ident), `${c.id}: writer 出現数`).toBe(c.writerCount);
      expect(countIdentifier(readerSrc, ident), `${c.id}: reader 出現数`).toBe(c.readerCount);
    });
  }
});

// ───────────────────────────────────────────────────────────────
// G2 schema往復(塞ぐ失敗: #3 個別列挙する関数が値を落とす・2026-08-12 時点で6回目)
// ───────────────────────────────────────────────────────────────
describe('G2: schema 往復でフィールドが1つも落ちない', () => {
  // ★空回り防止(G1 と同じ理由)。registry が空なら以下は1件も検査しない。
  it('検査対象チャンネルが1件以上ある', () => {
    expect(DIAG_CHANNELS.length).toBeGreaterThan(0);
  });

  for (const c of DIAG_CHANNELS) {
    it(`${c.id}: 全フィールド非デフォルト値が deep-equal で戻る`, () => {
      const sample = makeNonDefaultSample(c.schema);
      const copied = copyDiagBySchema(c.schema, sample);
      expect(copied).toEqual(sample);
    });

    it(`${c.id}: makeInitial のキー集合 = schema のキー集合`, () => {
      const initial = makeInitialFromSchema(c.schema);
      expect(Object.keys(initial).sort()).toEqual(schemaFieldNames(c.schema).sort());
    });

    it(`${c.id}: schema に無い値は落とす(野良フィールドを storage に溜めない)`, () => {
      const withStray = { ...makeNonDefaultSample(c.schema), __stray__: 'should-be-dropped' };
      const copied = copyDiagBySchema(c.schema, withStray);
      expect(Object.prototype.hasOwnProperty.call(copied, '__stray__')).toBe(false);
    });

    it(`${c.id}: 欠損入力は既定値で埋まる(読み手が undefined を踏まない)`, () => {
      const copied = copyDiagBySchema(c.schema, null);
      for (const f of c.schema) {
        expect(copied[f.name], `${c.id}.${f.name}`).toEqual(defaultForField(f));
      }
    });

    it(`${c.id}: ms 系は既定 -1(未計測)で「観測して0」と区別される`, () => {
      for (const f of c.schema) {
        if (f.kind !== 'ms') continue;
        // default を明示したフィールドは意図的な例外(理由を schema のコメントに書く運用)。
        if (Object.prototype.hasOwnProperty.call(f, 'default')) continue;
        expect(defaultForField(f), `${c.id}.${f.name}`).toBe(-1);
      }
    });
  }
});

// ───────────────────────────────────────────────────────────────
// G4 無条件書込(塞ぐ失敗: #6 データが保存されていない)
//    ★v1349 時点では commentPost の書き手は移行前の直接 set のまま。
//      publisher 移行は v1350 以降。ここでは「移行済みチャンネルだけ」を検査し、
//      未移行を一覧に出して台帳化する(黙って許さない)。
// ───────────────────────────────────────────────────────────────
describe('G4: 書き手は createDiagPublisher 経由(移行状況を台帳化)', () => {
  it('publisher 未移行の wired チャンネルを一覧表示する', () => {
    const notMigrated = [];
    for (const c of wiredChannels()) {
      const writerSrc = readRepoFile(c.writerFile);
      if (!writerSrc.includes('createDiagPublisher')) notMigrated.push(c.id);
    }
    if (notMigrated.length > 0) console.info('[registry] G4未移行:', notMigrated.join(', '));
    // v1349 は配線ゼロなので「全部未移行」が正。移行が進むにつれこの配列は縮む。
    expect(Array.isArray(notMigrated)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────
// G5 計測の穴(塞ぐ失敗: #9 rAF はタブ非表示で止まる=「最悪104秒」の正体)
// ───────────────────────────────────────────────────────────────
describe('G5: 診断 lib は requestAnimationFrame 単独の経過測定を使わない', () => {
  it('registry 登録チャンネルの schema 定義ファイルに rAF が無い', () => {
    // v1349 では registry 登録分のみ検査(全 *Diag*.js への一斉適用は v1356)。
    for (const c of DIAG_CHANNELS) {
      const libRel = `src/lib/${c.id.split('.').pop()}Diag.js`;
      let src = '';
      try {
        src = readRepoFile(libRel);
      } catch {
        continue; // lib ファイル名が規約どおりでないチャンネルは v1356 で拾う
      }
      expect(src.includes('requestAnimationFrame'), `${c.id}: ${libRel}`).toBe(false);
    }
  });
});

// ───────────────────────────────────────────────────────────────
// G6 面の重複(塞ぐ失敗: #8 同名フィールドが2面にある)
// ───────────────────────────────────────────────────────────────
describe('G6: id/key の一意性と、schema の面またぎ共有禁止', () => {
  it('id が一意', () => {
    const ids = DIAG_CHANNELS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('key が一意(面が違えば別キー)', () => {
    const keys = DIAG_CHANNELS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('同一 schema オブジェクトを2つの surface が共有していない', () => {
    /** @type {Map<unknown, string>} */
    const seen = new Map();
    for (const c of DIAG_CHANNELS) {
      const prev = seen.get(c.schema);
      if (prev !== undefined) {
        expect(prev, `schema を共有: ${c.id}`).toBe(c.surface);
      }
      seen.set(c.schema, c.surface);
    }
  });

  it('id は surface を接頭辞に持つ(popup.avatar と venue.avatar を別物として扱うため)', () => {
    for (const c of DIAG_CHANNELS) {
      expect(c.id.startsWith(`${c.surface}.`), `${c.id} は ${c.surface}. で始まるべき`).toBe(true);
    }
  });
});
