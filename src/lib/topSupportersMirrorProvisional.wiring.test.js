import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1710: popup が応援者ランキング鏡に「暫定」の印を載せる(診断の値の突き合わせが、開いた直後の暫定順位を全件のレポートと比べて偽の🔴を出さないため)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const popup = readFileSync(path.join(repoRoot, 'src/extension/popup-entry.js'), 'utf8').replace(/\r\n/g, '\n');

describe('★応援者ランキング鏡の暫定フラグ', () => {
  it('publishTopSupportersMirror は provisional を受け取り、鏡の中身に載せる', () => {
    expect(popup).toMatch(/function publishTopSupportersMirror\(liveId, rooms, provisional = false\)/);
    expect(popup).toContain("{ liveId: lid, capturedAt: now, rooms: cells, provisional: provisional === true }");
  });

  it('暫定→確定に戻った瞬間を、差分判定のキーで検出する(鏡の暫定の印が残り続けない)', () => {
    expect(popup).toContain("(rankingProvisional ? '::prov' : '')");
  });

  it('renderUserRooms は、暫定供給(rankingProvisional)のときに暫定として publish する', () => {
    expect(popup).toContain('publishTopSupportersMirror(liveId, stripSlice, rankingProvisional);');
  });
});
