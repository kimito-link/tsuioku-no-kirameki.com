import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const comeview = readFileSync(join(root, 'src/extension/comeview-entry.js'), 'utf8');

/**
 * ★守っている実害(2026-08-11 実機・ユーザー報告「コメビュが立ち上がらない」):
 *   過去ログ取り込み(backfill)中は storage が混み、起動経路の【無制限に待つ】
 *   storage read で main() が止まり、画面は cvLiveMeta が「—」・本文
 *   「コメントを待っています…」のまま固着していた(storageが空くと自力回復＝壊れてはいない)。
 *   ★同型は v0.1.784「storage stall でコメビュが凍結する不具合を根治」で一度手当て済みだが、
 *     **起動経路だけ素通しで残っていた**。
 */
describe('コメビュの起動が storage に人質に取られない', () => {
  describe('(1) 起動経路の read が有界化されている', () => {
    it('★起動用のタイムアウト定数がある(full refresh より短い)', () => {
      const boot = comeview.match(/const COMEVIEW_BOOT_READ_TIMEOUT_MS = (\d+);/);
      const full = comeview.match(/const FULL_REFRESH_STORAGE_TIMEOUT_MS = (\d+);/);
      expect(boot, '起動用タイムアウトが定義されていること').toBeTruthy();
      expect(full).toBeTruthy();
      // 設定値は「取れなくても画面は出せる」ので、本体データより短く見切る。
      expect(Number(boot[1])).toBeLessThan(Number(full[1]));
    });

    it('★最終watchURLの取得が有界化されている(liveId解決＝一番最初の await)', () => {
      expect(comeview).toMatch(
        /resolveLiveIdFromStorage[\s\S]{0,600}?runStorageOpWithTimeout\([\s\S]{0,200}?COMEVIEW_BOOT_READ_TIMEOUT_MS/
      );
    });

    it('★読み上げ設定・NGリストの取得も有界化されている', () => {
      expect(comeview).toMatch(
        /initializeVoiceReading[\s\S]{0,900}?runStorageOpWithTimeout[\s\S]{0,300}?COMEVIEW_BOOT_READ_TIMEOUT_MS/
      );
      expect(comeview).toMatch(
        /loadNgList[\s\S]{0,800}?runStorageOpWithTimeout[\s\S]{0,300}?COMEVIEW_BOOT_READ_TIMEOUT_MS/
      );
    });
  });

  describe('(2) 復帰経路(onChanged)が先に張られる', () => {
    it('★wireStorageChanges が liveId 解決より【前】にある', () => {
      // ここが後ろだと、起動時に liveId を取れなかったとき復帰経路すら張られない
      //   ＝永久に立ち上がらない(旧実装の第2の穴)。
      const main = comeview.slice(comeview.indexOf('async function main()'));
      const idxWire = main.indexOf('wireStorageChanges()');
      const idxResolve = main.indexOf('await resolveLiveIdFromStorage()');
      expect(idxWire).toBeGreaterThan(0);
      expect(idxResolve).toBeGreaterThan(0);
      expect(idxWire).toBeLessThan(idxResolve);
    });

    it('★liveId 未確定でも配線を諦めない(早期 return を戻さない)', () => {
      const start = comeview.indexOf('function wireStorageChanges()');
      const fn = comeview.slice(start, start + 1600);
      // ★コメント行を除いてから判定する(経緯の説明文に同じ字面が出るため)。
      const code = fn
        .split('\n')
        .filter((l) => {
          const t = l.trim();
          return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
        })
        .join('\n');
      expect(code, '実コードに早期 return が無いこと').not.toMatch(/if \(!_liveId\) return;/);
      // キーは listener の中で毎回引き直す(closure で固定しない)。
      expect(code).toMatch(/_liveId \? tailStorageKey\(_liveId\) : ''/);
    });

    it('★onChanged は1回だけ張る(二重登録しない)', () => {
      expect(comeview).toMatch(/if \(_storageChangesWired\) return;/);
    });
  });

  describe('(3) 設定の読み込みが画面表示をブロックしない', () => {
    it('★読み上げ設定/NGは await しない(取れなくても画面は出す)', () => {
      const main = comeview.slice(comeview.indexOf('async function main()'));
      expect(main).toMatch(/void initializeVoiceReading\(\);/);
      expect(main).toMatch(/void loadNgList\(\);/);
      expect(main).not.toMatch(/await initializeVoiceReading\(\);/);
      expect(main).not.toMatch(/await loadNgList\(\);/);
    });

    it('★liveId が取れないときは断定しない(まだ来ていないだけのことがある)', () => {
      // 「配信が見つかりません」と断定すると、storage混雑で待てば来る場合に誤情報になる。
      expect(comeview).toMatch(/配信を探しています/);
    });
  });
});
