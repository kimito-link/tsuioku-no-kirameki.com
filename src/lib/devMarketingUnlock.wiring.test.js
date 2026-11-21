import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

describe('開発ビルドのマーケ HTML 関所: 配線', () => {
  it('checkMarketingAccess が開発用の通し判定を使い、画面の関所もそこを通る', () => {
    const access = read('src/lib/supporterAccess.js');
    expect(access).toContain("from './devMarketingUnlock.js'");
    expect(access).toContain('isDevMarketingUnlock');
    expect(access).toContain("reason: 'dev_build'");

    const entry = read('src/extension/marketing-export-entry.js');
    expect(entry).toContain('checkMarketingAccess');
    expect(entry).toMatch(/async function passSupporterGate[\s\S]*checkMarketingAccess\(\{ storage: chrome\.storage\.local \}\)/);
  });

  it('提出用ビルドは NL_STORE_BUILD=1 を焼き込み、既定と watch は false', () => {
    const build = read('scripts/build.mjs');
    expect(build).toMatch(
      /const IS_STORE_BUILD = process\.env\.NL_STORE_BUILD === '1' \|\| process\.env\.NL_STORE_BUILD === 'true';/
    );
    expect(build).toContain("NL_STORE_BUILD: IS_STORE_BUILD ? 'true' : 'false'");
    expect(build.split("NL_STORE_BUILD: IS_STORE_BUILD ? 'true' : 'false'").length - 1).toBeGreaterThanOrEqual(2);

    const watch = read('scripts/build-watch.mjs');
    expect(watch).toContain("NL_STORE_BUILD: 'false'");

    const yt = read('scripts/build-youtube-ext.mjs');
    expect(yt).toMatch(/NL_STORE_BUILD:\s*IS_STORE_BUILD \? 'true' : 'false'|NL_STORE_BUILD:/);

    const stageNote = read('AGENTS.md');
    expect(stageNote).toContain('NL_STORE_BUILD=1 npm run build');
  });
});
