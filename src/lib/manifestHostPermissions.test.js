import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** @returns {string} */
function masterManifestText() {
  const show = () => execFileSync('git', ['show', 'origin/master:extension/manifest.json'], { encoding: 'utf8' });
  try {
    return show();
  } catch {
    execFileSync('git', ['fetch', '--depth=1', 'origin', 'master'], { encoding: 'utf8' });
    return show();
  }
}

describe('manifest の権限は master と同じ', () => {
  it('permissions と host_permissions は master と一致する', () => {
    const here = JSON.parse(readFileSync(new URL('../../extension/manifest.json', import.meta.url), 'utf8'));
    const master = JSON.parse(masterManifestText());
    for (const key of ['permissions', 'host_permissions', 'optional_permissions', 'optional_host_permissions']) {
      expect(here[key] ?? [], key).toEqual(master[key] ?? []);
    }
    const hosts = /** @type {string[]} */ (here.host_permissions || []);
    expect(hosts).toContain('https://www.showroom-live.com/*');
    expect(hosts).toContain('https://api.whowatch.tv/*');
    expect(hosts.join('\n')).not.toContain('gql.twitch.tv');
  });
});
