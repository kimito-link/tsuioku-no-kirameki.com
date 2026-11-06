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
  it('★席が無い人の吹き出しは一覧の中(下の縁)に名前付きで出し、診断の行も避ける(v0.1.1828 実機で会場の外・診断の上に出た)', () => {
    expect(venueBar).toContain('viewport: seatsHost,');
    expect(venueBar).toContain('{ el: storyDiagHost, weight: W.guide, clipTo: seatsHost },');
    expect(placer).toMatch(/else if \(p\.fallback && p\.viewport\)[\s\S]*away = true;\s*edge = 'bottom';/);
    expect(venueBar).toContain('.nlsb-bubble--seatless::after { display: none; }');
  });
  it('★席が無い人の吹き出しは診断の行の上に出し、名前の無い人は「匿名NNN」で出す(v0.1.1832 実配信で診断に15件中14件被り・名前が全部「コメント」)', () => {
    expect(venueBar).toContain('viewportFloor: storyDiagHost,');
    expect(placer).toContain('if (f.bottom > f.top && f.top > v.top + 40 && f.top < floor) floor = f.top;');
    expect(venueBar).toContain('anonymousDisplayLabel(whoUid || speech.speakerKey)');
    expect(venueBar).not.toContain(".trim() || 'コメント';");
  });
});

describe('配線: PICK UP をドラッグで動かす(v0.1.1899)', () => {
  const drag = readFileSync(new URL('./venuePickupDrag.js', import.meta.url), 'utf8');
  it('★会場は placePickup で位置をドラッグ部品に任せる', () => {
    expect(venueBar).toContain('pickupDrag.place(at);');
    expect(venueBar).toContain('attachVenuePickupDrag(pickupEls.root, stageLayout, placePickup');
  });
  it('★窓の中の前の1件を出している間に新着が来たら、少し後に選び直す(v0.1.1901・古い1件が出続ける対策)', () => {
    expect(venueBar).toContain("if (picked.why === 'scored' && picked.entry !== pickupRing[pickupRing.length - 1]) pickupDrag.later(() => updatePickupBanner(null));");
    expect(drag).toContain('later(fn, ms = 15_500) {');
    expect(drag).toContain('if (laterTimer) return;');
  });
  it('★置いた位置を覚え、窓の内側に締め、ダブルクリックで戻す', () => {
    expect(drag).toContain('safeStorageLocalSet({ [KEY_VENUE_PICKUP_POS]: toSave })');
    expect(drag).toContain("root.addEventListener('dblclick'");
    expect(drag).toContain('viewportBounds(L)');
    // 名前リンクから始めてもドラッグでき、動かなければクリック=発言パネル(v0.1.1900)
    expect(drag).toContain("if (!openWho && ev.target instanceof Element && ev.target.closest('a[href]')) return;");
    // 速く動かしても置いていかれない(動き・離しは window で受ける)
    expect(drag).toContain("window.addEventListener('pointerup', endDrag);");
  });
  it('★顔か名前のクリックで発言パネル(ドラッグ直後は開かない・v0.1.1900)', () => {
    expect(venueBar).toContain('attachVenuePickupDrag(pickupEls.root, stageLayout, placePickup, (who) =>');
    expect(venueBar).toMatch(/void openSpeechPanelFor\(who\); \}\);/);
    expect(drag).toContain('if (wasDrag) return;');
    expect(drag).not.toContain("root.title = ");
  });
  it('★「ドラッグで動かせます」が分かる(つまみ+札)', () => {
    expect(drag).toContain("grip.textContent = '⠿';");
    expect(drag).toContain('ドラッグで動かせます');
  });
});
