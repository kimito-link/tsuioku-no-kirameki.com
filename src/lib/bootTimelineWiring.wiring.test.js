import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 黒い幕の年表の配線(v0.1.1687): popup(子)が自分の節目・長い処理・段階を session に書く → サイドパネル(親)が自分の起点に直して読む → 状態速報の1行。
 *   どれか1か所が切れると、縞の間に子が何をしていたかが実機で読めなくなる。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('黒い幕の年表の配線', () => {
  it('★popup が起動時に bootTimelineBoot を読み込む(import するだけで起動)', () => {
    expect(strip(read('src/extension/popup-entry.js'))).toContain("import '../lib/bootTimelineBoot.js';");
  });

  it('★起動はサイドパネルの popup(dock=sidepanel)だけ・書き込みは2回だけ・DOM を書き換えない', () => {
    const b = strip(read('src/lib/bootTimelineBoot.js'));
    expect(b).toMatch(/dock=sidepanel/);
    expect(b).toMatch(/\[6000, 16000\]/);
    expect(b).not.toMatch(/innerHTML|appendChild|setAttribute|classList\.|\.style\./);
    expect(b).not.toContain('storage.local');
  });

  it('★段階の年表: markWatchPopupLoadPhase が段階名と時刻を残す', () => {
    const d = strip(read('src/lib/watchPopupLoadDiagnostics.js'));
    expect(d).toMatch(/_phaseLog\.push\(\[_lastPhase, Math\.round\(_lastPhaseAt\)\]\)/);
    expect(d).toContain('export function snapshotWatchPopupPhaseLog');
  });

  it('★サイドパネル(親)が自分の起点(timeOrigin)と最初の描画に直して読み、bootTimelineLine に載せる', () => {
    const p = strip(read('src/extension/sidepanel-entry.js'));
    expect(p).toMatch(/refreshFlickerLine\(\);\s*refreshBootTimelineLine\(\);/);
    expect(p).toMatch(/timeOrigin: performance\.timeOrigin, firstPaintMs:/);
    expect(p).toMatch(/bootTimelineLine:\s*_bootTimelineLine/);
  });

  it('★状態速報: bootTimelineLine を行にする', () => {
    const t = strip(read('src/lib/aiShareFullText.js'));
    const i = t.indexOf('sidepanelSelfDiag?.bootTimelineLine');
    expect(i).toBeGreaterThan(-1);
    expect(t.slice(i, i + 170)).toContain('lines.push(timelineLine)');
  });
});
