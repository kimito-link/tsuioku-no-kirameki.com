import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 会場が他配信の鏡で良い鏡を上書きしない配線の固定(2026-10-09)。2配信同時記録で「会場が出たり消えたり」した。 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const venue = readFileSync(path.join(root, 'extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');

describe('venueBar: 鏡の採用は現配信のものだけ', () => {
  it('★onChanged 経路は adoptVenueMirrorGuarded(accepted, liveId)(=現配信+縮小ガード)を通ってから laneMirrorSnap を更新する', () => {
    expect(venue).toMatch(/if \(accepted && adoptVenueMirrorGuarded\(accepted, liveId\)\) \{\n\s+laneMirrorSnap = accepted;/);
  });
  it('★開時 catch-up 経路も同じ関所を通る', () => {
    expect(venue).toMatch(/if \(open && snap && adoptVenueMirrorGuarded\(snap, _catchUpLiveId\)\) \{\n\s+laneMirrorSnap = snap;/);
  });
  it('★採用口は decideVenueMirrorAdoption(現配信判定+縮小ガード)を通り、縮小拒否を人数計器に数える', () => {
    expect(venue).toMatch(/const d = decideVenueMirrorAdoption\(laneMirrorSnap, incoming, liveIdNow, Date\.now\(\)\);/);
    expect(venue).toMatch(/if \(!d\.adopt && d\.shrunk\) noteVenueMirrorShrinkRefused\(_tileCountCensus\);/);
  });
  it('★laneMirrorSnap への代入はこの2箇所だけ(関所を通らない代入が増えたら赤)', () => {
    const assigns = venue.match(/laneMirrorSnap = (?!null)[a-zA-Z_]+;/g) || [];
    expect(assigns.length).toBe(2);
  });
});
