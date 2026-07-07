import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIVEVIEW_MIRROR_SECTIONS,
  bundleSectionKeysFromRegistry,
  prunableSectionsFromRegistry,
  driftGuardHostIdsFromRegistry
} from './liveviewMirrorSections.js';

/**
 * ③WEB丸写しの「配線忘れ=CI赤」ガード(reference_full_mirror_SYNTHESIS.md C / A-3)。
 *   レジストリ(liveviewMirrorSections.js)に登録された各セクションが、実ソース
 *   (mirrorBundle / status-entry / app/live-view.js / app/live-view.html / prune / popup.html)に
 *   本当に配線されているかを突合する。新パネルを登録したのに配線を忘れたら、この test が赤=verify:cc 赤。
 *
 * ★実行時 DOM 不要・純 Node(fs 読み)。app/live-view.js は popup-entry を dynamic import する
 *   browser モジュールで vitest から直接 import できないため、ソース文字列を正規表現でスキャンする
 *   (辞書/呼び出しを1箇所に固定する規約とセット)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const mirrorBundleSrc = read('src/lib/mirrorBundle.js');
const statusEntrySrc = read('src/extension/status-entry.js');
const liveViewJsSrc = read('app/live-view.js');
const liveViewHtmlSrc = read('app/live-view.html');
const popupHtmlSrc = read('extension/popup.html');
const pruneSrc = read('src/lib/pruneLiveViewPublishBlob.js');

describe('liveviewMirrorSections レジストリ整合(配線忘れ=CI赤)', () => {
  it('レジストリは空でない(全数保存則)', () => {
    expect(LIVEVIEW_MIRROR_SECTIONS.length).toBeGreaterThanOrEqual(8);
  });

  it('key は全件ユニーク', () => {
    const keys = LIVEVIEW_MIRROR_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('(a) inBundle:true の key は mirrorBundle SECTION_KEYS に存在する', () => {
    for (const key of bundleSectionKeysFromRegistry()) {
      // SECTION_KEYS 配列リテラル内に 'key' が現れることを断言(ソーススキャン)。
      const re = new RegExp(`'${key}'`);
      expect(re.test(mirrorBundleSrc), `mirrorBundle SECTION_KEYS に '${key}' が無い=バンドル配線漏れ`).toBe(true);
    }
  });

  it('(b) blobField は status-entry の jsonBlob 組立に現れる', () => {
    for (const s of LIVEVIEW_MIRROR_SECTIONS) {
      expect(
        statusEntrySrc.includes(s.blobField),
        `status-entry.js に blobField '${s.blobField}'(${s.key}) が無い=jsonBlob 相乗り漏れ`
      ).toBe(true);
    }
  });

  it('(c) paintFn は app/live-view.js に定義され paintAllMirrors から呼ばれる', () => {
    for (const s of LIVEVIEW_MIRROR_SECTIONS) {
      expect(
        new RegExp(`function ${s.paintFn}\\b`).test(liveViewJsSrc),
        `app/live-view.js に paint 関数 ${s.paintFn}(${s.key}) の定義が無い`
      ).toBe(true);
      // paintAllMirrors 本体で呼ばれているか(呼び出し忘れ検知)。
      const paintAllBody = liveViewJsSrc.slice(liveViewJsSrc.indexOf('function paintAllMirrors'));
      const callBody = paintAllBody.slice(0, paintAllBody.indexOf('\n}\n'));
      expect(
        callBody.includes(`${s.paintFn}(`),
        `paintAllMirrors が ${s.paintFn}(${s.key}) を呼んでいない=③に描かれない`
      ).toBe(true);
    }
  });

  it('(c2) paint 関数には専用署名ガード(既存sig共用しない)を持つ疑いを弾かない=各paintFnが存在するのみ確認', () => {
    // diff-skip 機構は paint ごと専用 sig。ここでは存在のみ担保(共用検知は静的には難しいので範囲外)。
    expect(LIVEVIEW_MIRROR_SECTIONS.every((s) => typeof s.paintFn === 'string' && s.paintFn.length > 0)).toBe(true);
  });

  it('(d) hostIds は app/live-view.html に id として存在する', () => {
    for (const s of LIVEVIEW_MIRROR_SECTIONS) {
      for (const id of s.hostIds) {
        expect(
          new RegExp(`id="${id}"`).test(liveViewHtmlSrc),
          `app/live-view.html に host id="${id}"(${s.key}) が無い=③に描画先が無い(drift)`
        ).toBe(true);
      }
    }
  });

  it('(d2) drift 検知: driftGuardHost:true の host は popup.html と live-view.html の両方に存在する', () => {
    // ①popup にパネルを足して host を live-view.html に同期し忘れると、ここが赤(466行drift の再発防止)。
    for (const id of driftGuardHostIdsFromRegistry()) {
      expect(new RegExp(`id="${id}"`).test(popupHtmlSrc), `popup.html に host id="${id}" が無い`).toBe(true);
      expect(new RegExp(`id="${id}"`).test(liveViewHtmlSrc), `live-view.html に host id="${id}" が無い=drift`).toBe(true);
    }
  });

  it('(e) prunePolicy 宣言強制: 全 descriptor が prunePolicy を持つ(never も明示)', () => {
    for (const s of LIVEVIEW_MIRROR_SECTIONS) {
      const ok = s.prunePolicy === 'never' || (s.prunePolicy && Array.isArray(s.prunePolicy.sections));
      expect(ok, `${s.key} の prunePolicy が未宣言(never か {sections} を明示せよ・無言デフォルト禁止)`).toBe(true);
    }
  });

  it('(e2) prunePolicy で宣言した section 名は prune はしごに実在する', () => {
    for (const section of prunableSectionsFromRegistry()) {
      expect(
        pruneSrc.includes(`'${section}'`),
        `pruneLiveViewPublishBlob.js に section '${section}' の削り実装が無い=宣言と実装の乖離`
      ).toBe(true);
    }
  });

  it('inBundle/driftGuardHost/prunePolicy は型どおり(壊れた descriptor を弾く)', () => {
    for (const s of LIVEVIEW_MIRROR_SECTIONS) {
      expect(typeof s.inBundle).toBe('boolean');
      expect(typeof s.driftGuardHost).toBe('boolean');
      expect(Array.isArray(s.hostIds)).toBe(true);
    }
  });
});
