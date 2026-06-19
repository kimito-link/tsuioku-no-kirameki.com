// venue-entry.js — 会場モード(standalone)のエントリ。venueBar をページに mount するだけの薄い起動点。
import { mountVenueStandalone } from './venueBar.js';

function main() {
  const searchParams = new URLSearchParams(location.search);
  const liveId = searchParams.get('lv');
  if (liveId) {
    mountVenueStandalone(liveId);
  }
}

main();
