import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { describe, expect, it } from 'vitest';
import { isDevMarketingUnlock, manifestHasUpdateUrl } from './devMarketingUnlock.js';

describe('isDevMarketingUnlock', () => {
  it('ビルド旗も試験の上書きも無いときは通さない(Node の単体試験=ストアと同じ関所)', () => {
    expect(isDevMarketingUnlock()).toBe(false);
  });

  it('ストア提出ビルド(NL_STORE_BUILD=true)は、ほかの条件に関わらず通さない', () => {
    expect(isDevMarketingUnlock({ storeBuildDefined: true, storeBuild: true })).toBe(false);
    expect(
      isDevMarketingUnlock({ storeBuildDefined: true, storeBuild: true, devHotReload: true })
    ).toBe(false);
    expect(
      isDevMarketingUnlock({ storeBuildDefined: true, storeBuild: true, hasUpdateUrl: false })
    ).toBe(false);
  });

  it('既定の開発ビルド(旗は焼き込み済み・ストア提出ではない)は通す', () => {
    expect(isDevMarketingUnlock({ storeBuildDefined: true, storeBuild: false })).toBe(true);
  });

  it('manifest に update_url があるインストール(ストアから入れた版)は通さない', () => {
    expect(
      isDevMarketingUnlock({ storeBuildDefined: true, storeBuild: false, hasUpdateUrl: true })
    ).toBe(false);
  });

  it('ビルド旗が無くても dev watch(NL_DEV_HOTRELOAD)なら通す', () => {
    expect(isDevMarketingUnlock({ devHotReload: true })).toBe(true);
    expect(isDevMarketingUnlock({ devHotReload: false })).toBe(false);
  });

  it('chrome.runtime.getManifest の update_url を読む(management 権限は使わない)', () => {
    const prev = globalThis.chrome;
    try {
      globalThis.chrome = { runtime: { getManifest: () => ({ update_url: 'https://clients2.google.com/service/update2/crx' }) } };
      expect(manifestHasUpdateUrl()).toBe(true);
      expect(isDevMarketingUnlock({ storeBuildDefined: true, storeBuild: false })).toBe(false);
      globalThis.chrome = { runtime: { getManifest: () => ({ name: 'dev', key: 'x' }) } };
      expect(manifestHasUpdateUrl()).toBe(false);
      expect(isDevMarketingUnlock({ storeBuildDefined: true, storeBuild: false })).toBe(true);
    } finally {
      if (prev === undefined) delete globalThis.chrome;
      else globalThis.chrome = prev;
    }
  });
});

describe('isDevMarketingUnlock: ストア提出ビルドの焼き込み', () => {
  /**
   * esbuild の define で NL_STORE_BUILD を焼き込んだ束を実際に読み、
   * 提出用(true)では通さず、開発用(false)では通すことを確かめる。
   * @param {boolean} storeBuild
   */
  async function loadBundledUnlock(storeBuild) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'nl-dev-unlock-'));
    const outfile = path.join(dir, `unlock-${storeBuild ? 'store' : 'dev'}.mjs`);
    try {
      await esbuild.build({
        absWorkingDir: path.resolve(import.meta.dirname, '../..'),
        entryPoints: ['src/lib/devMarketingUnlock.js'],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        write: true,
        outfile,
        define: {
          NL_STORE_BUILD: storeBuild ? 'true' : 'false',
          NL_DEV_HOTRELOAD: 'false'
        }
      });
      const mod = await import(pathToFileURL(outfile).href);
      return mod.isDevMarketingUnlock();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('NL_STORE_BUILD=true の束(提出用)では関所を通さない', async () => {
    expect(await loadBundledUnlock(true)).toBe(false);
  });

  it('NL_STORE_BUILD=false の束(開発用)では関所を通す', async () => {
    expect(await loadBundledUnlock(false)).toBe(true);
  });
});
