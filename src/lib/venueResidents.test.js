import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVenueResidents, VENUE_RESIDENT_IDS } from './venueResidents.js';

describe('v0.1.1214 3キャラ常駐の廃止(フラグOFF)', () => {
  test('venueBar の renderResidents はフラグOFFで no-op(映像に重ねない)', () => {
    // ユーザー要望(2026-08-01): 左上りんく・左下たぬ姉・右こん太が映像に重なり
    //   「見づらくなる」ため非表示化。額縁フレーム(v0.1.1114)と同じ流儀=復活はフラグ1つ。
    //   ★このモデル自体(buildVenueResidents)は残す=復活時にそのまま使えるようにする。
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const src = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8');
    expect(src).toMatch(/const VENUE_RESIDENTS_ENABLED = false;/);
    expect(src).toMatch(/if \(!VENUE_RESIDENTS_ENABLED\) return;/);
  });
});

/**
 * 会場常駐3キャラ(りんく・こん太・たぬ姉)の描画モデル。
 * 「開いた瞬間に必ず誰かが居る」=ローディング/空っぽに見せない最後の砦。
 * 会場参加者カウントには含めない(誤情報防止)。
 */
const idUrl = (rel) => `chrome-extension://ID/${rel}`;

describe('buildVenueResidents (3キャラ常駐モデル)', () => {
  test('常に3体・順序固定(rinku→konta→tanunee)', () => {
    const r = buildVenueResidents(idUrl);
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.id)).toEqual(['rinku', 'konta', 'tanunee']);
  });

  test('id はユニーク・VENUE_RESIDENT_IDS と一致', () => {
    const r = buildVenueResidents(idUrl);
    const ids = r.map((x) => x.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual([...VENUE_RESIDENT_IDS]);
  });

  test('名前が各キャラに付く(空でない)', () => {
    const r = buildVenueResidents(idUrl);
    for (const x of r) expect(x.name.length).toBeGreaterThan(0);
  });

  test('imgSrc は resolveUrl を通っている(拡張URLに解決)', () => {
    const r = buildVenueResidents(idUrl);
    for (const x of r) {
      expect(x.imgSrc.startsWith('chrome-extension://ID/')).toBe(true);
      expect(x.imgSrc).toContain('yukkuri-charactore-english');
    }
  });

  test('resolveUrl が無い/不正でも例外を投げず相対パスを返す', () => {
    const r = buildVenueResidents(undefined);
    expect(r).toHaveLength(3);
    for (const x of r) expect(x.imgSrc).toContain('yukkuri-charactore-english');
  });

  test('各キャラの画像パスが異なる(同じ顔を3つ出さない)', () => {
    const r = buildVenueResidents(idUrl);
    const srcs = r.map((x) => x.imgSrc);
    expect(new Set(srcs).size).toBe(3);
  });
});
