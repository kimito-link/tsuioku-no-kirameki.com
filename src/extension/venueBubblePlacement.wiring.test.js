import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const venueBar = readFileSync(new URL('./venueBar.js', import.meta.url), 'utf8');
const placer = readFileSync(new URL('./venueBubblePlacer.js', import.meta.url), 'utf8');
const phone = readFileSync(new URL('../../app/live-view-venue.js', import.meta.url), 'utf8');

describe('配線: 吹き出しを大事な表示に被せない(v0.1.1760)', () => {
  it('★PC 会場: PICK UP・見出し・一覧の案内文・他の吹き出しを避ける物として渡す', () => {
    expect(venueBar).toContain('{ el: pickupEls.root, weight: W.pickup }');
    expect(venueBar).toContain('{ el: header, weight: W.header }');
    expect(venueBar).toContain(".nl-story-userlane-guide'), (el) => ({ el, weight: W.guide, clipTo: seatsHost })");
    // ★段の外の案内文が避ける物から消えない(席の枠で切らない・v0.1.1761 実機で被った)
    expect(placer).not.toMatch(/clipToSeats/);
    expect(venueBar).toMatch(/otherBubbles: activeBubbles\.filter/);
  });
  it('★PC 会場: 一覧の外に隠れた席は見えている縁に寄せ、発言者名を添える', () => {
    expect(placer).toContain('resolveVisibleAnchor(');
    // ★段がまるごと一覧の外でも、縁は一覧のスクロール枠(会場の外へ出さない・v0.1.1761)
    expect(placer).toMatch(/clip\.bottom <= clip\.top[\s\S]*outerScroll/);
    expect(placer).toContain("bubbleEl.classList.toggle('nlsb-bubble--away', away)");
    expect(venueBar).toContain(".nlsb-bubble--away .nlsb-bubble-who { display: block; }");
  });
  it('★混んで古い吹き出しを隠したら、読み上げ中以外を先に消す', () => {
    expect(venueBar).toMatch(/coveredBubbleIndexes\(bubble\._box, others\.map/);
    expect(venueBar).toContain("b.voiceState !== 'speaking'");
    expect(phone).toContain('for (const i of coveredBubbleIndexes(box, otherBoxes)) fadeOut(others[i]);');
  });
  it('★スマホ会場: 席の並びが変わったら吹き出しを置き直す(席と一緒に画面の外へはみ出さない)', () => {
    expect(phone).toMatch(/seatsEl\.replaceChildren\(\.\.\.nodes\);\s*relayoutBubbles\(\);/);
    expect(phone).toContain('chooseBubblePlacement({');
  });
});
