import { boot } from './lib.mjs';
const [ext, label, port, vid] = process.argv.slice(2);
const B = await boot(ext, label, port, 'vgrid'); const { page } = B;
await page.goto(`https://www.youtube.com/watch?v=${vid}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await B.consent(); await page.waitForTimeout(8000);
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(2500); }
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(2000);
B.log('kind', JSON.stringify(await B.kind()));
B.log('card', JSON.stringify(await B.card()));
await page.locator('.nlsb-toggle').first().click({ timeout: 15000 }).catch((e) => B.log('toggle fail', e.message.slice(0, 80)));
await page.waitForTimeout(14000);
const scan = () => page.evaluate(() => {
  const root = document.getElementById('nlsb-venue-root'); if (!root) return { noroot: true };
  const g = root.querySelector('.nlsb-vgrid');
  const units = [...root.querySelectorAll('.nlsb-vgrid-unit')];
  const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none';
  const sent = {}; for (const u of units) { const s = u.querySelector('.nlsb-vgrid-bubble')?.dataset.sentiment || '?'; sent[s] = (sent[s] || 0) + 1; }
  const bubbles = units.map((u) => u.querySelector('.nlsb-vgrid-bubble'));
  const borderColors = [...new Set(bubbles.map((b) => b && getComputedStyle(b).borderTopColor + ' ' + getComputedStyle(b).borderTopWidth))];
  return {
    on: root.classList.contains('nlsb-vgrid-on'), gridVisible: vis(g), laneStackVisible: vis(root.querySelector('.nlsb-seats > .nlsb-venue-lane-stack:not(.nlsb-vgrid)')),
    units: units.length, bands: [...root.querySelectorAll('.nlsb-vgrid .nl-story-userlane-tier-hint')].map((h) => h.textContent),
    caption: root.querySelector('.nlsb-vgrid-caption')?.textContent || '', sent, borderColors,
    likes: units.map((u) => u.querySelector('.nl-story-userlane-meta__id')?.textContent || '').filter((t) => /👍/.test(t)).slice(0, 8),
    metas: units.slice(0, 10).map((u) => [u.dataset.vgridName, u.querySelector('.nl-story-userlane-meta__id')?.textContent || '', (u.querySelector('.nlsb-vgrid-text')?.textContent || '').slice(0, 30)]),
    order: units.map((u) => u.dataset.vgridKey),
    topbar: root.querySelectorAll('.nlsb-topbar-cell').length, thumbsDown: /👎/.test(g?.textContent || ''),
  };
});
const s1 = await scan(); B.log('scan', JSON.stringify(s1));
const boardOrder = await B.sw.evaluate(async (vid) => { const c = (await chrome.storage.local.get(['yt_video_watch_card_v1', 'nls_vod_video_watch_card_v1'])); const w = [c.yt_video_watch_card_v1, c.nls_vod_video_watch_card_v1].find((x) => x && x.videoId === vid); return (w?.card?.behavior?.rows || []).filter((r) => !r.isAnonymous && (r.comments || []).some((x) => (x.text || '').trim())).map((r) => 'u:' + r.id); }, vid).catch((e) => ['err ' + e.message]);
B.log('orderMatchesBoard', JSON.stringify(boardOrder.slice(0, s1.order?.length || 0)) === JSON.stringify(s1.order), 'board', boardOrder.length);
B.grab('grid');
// face tap → jump
const cells = page.locator('#nlsb-venue-root .nlsb-topbar-cell');
const nCells = await cells.count(); B.log('topbar cells', nCells);
let jumped = null;
for (let i = Math.min(nCells - 1, 5); i >= 0 && !jumped; i--) {
  await cells.nth(i).click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
  jumped = await page.evaluate(() => { const u = document.querySelector('#nlsb-venue-root .nlsb-vgrid-unit.nlsb-vgrid-jump'); if (!u) return null; const r = u.getBoundingClientRect(); const host = u.closest('.nlsb-seats').getBoundingClientRect(); const b = u.querySelector('.nlsb-vgrid-bubble'); return { name: u.dataset.vgridName, inView: r.top >= host.top - 2 && r.bottom <= host.bottom + 2, shadow: getComputedStyle(b).boxShadow, caption: document.querySelector('#nlsb-venue-root .nlsb-vgrid-caption')?.textContent, speechOpen: [...document.querySelectorAll('#nlsb-venue-root [class*="speech-panel"]')].some((e) => !e.hidden && e.getClientRects().length > 0) }; });
  B.log('tap cell', i, JSON.stringify(jumped));
}
B.grab('jump');
// tap a grid tile → detail panel
const tile = page.locator('#nlsb-venue-root .nlsb-vgrid-unit .nl-story-userlane-cell').nth(1);
await tile.click({ timeout: 5000 }).catch((e) => B.log('tile click fail', e.message.slice(0, 80)));
await page.waitForTimeout(2500);
B.log('tileTap', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#nlsb-venue-root [class*="speech-panel"]')].filter((e) => !e.hidden && e.getClientRects().length > 0).map((e) => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 240)).slice(0, 1))));
B.log('pages', JSON.stringify(B.ctx.pages().map((p) => p.url().slice(0, 60))));
B.grab('tap');
await B.ctx.close();
