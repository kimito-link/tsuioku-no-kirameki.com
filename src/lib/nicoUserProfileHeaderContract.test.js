import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 公式プロフィール API(nvapi)は X-Frontend-Id ヘッダが無いと HTTP 400(INVALID_PARAMETER)を返す(実測 2026-10-18・拡張の SW 内でも同じ)。
 * ヘッダ無しで取っていたため、配信者の名前・アイコン・自己紹介が取れず「ユーザー 144967552」になっていた。
 * SW(background.js)に手で書かれているので、外れたら赤くする。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sw = readFileSync(path.join(root, 'extension/background.js'), 'utf8').replace(/\r\n/g, '\n');
const i = sw.indexOf('async function fetchNicoUserProfileJson');
const block = sw.slice(i, sw.indexOf('chrome.runtime.onMessage.addListener', i));
const entry = readFileSync(path.join(root, 'src/extension/marketing-export-entry.js'), 'utf8').replace(/\r\n/g, '\n');

describe('公式プロフィールの取得(SW)', () => {
  it('★X-Frontend-Id を付けて取る(無いと400)', () => {
    expect(i).toBeGreaterThan(0);
    expect(block).toContain("'X-Frontend-Id'");
    expect(block).toContain("'X-Frontend-Version'");
  });
  it('★force 指定のときは10分の間引きを飛ばす(レポートの書き出しは最新を取る)', () => {
    expect(block).toContain('force');
  });
});

describe('マーケの書き出しは配信者の公式プロフィールを取りに行く', () => {
  it('★書き出し時に NICO_USER_PROFILE を force で要求し、結果をモデルに重ねる', () => {
    expect(entry).toContain('NICO_USER_PROFILE_FETCH_MESSAGE_TYPE');
    expect(entry).toContain('force: true');
    expect(entry).toContain('normalizeNicoUserProfileResponse');
  });
});
