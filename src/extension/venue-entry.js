// venue-entry.js — 会場モード(standalone)のエントリ。venueBar をページに mount するだけの薄い起動点。
// v0.1.1580: 拡張プロセスの忙しさ台帳(文書別・ページを開かなくても犯人を名指しする)。import するだけで起動。
import '../lib/extDocBusyCensusBoot.js';
import { mountVenueStandalone } from './venueBar.js';

function main() {
  const searchParams = new URLSearchParams(location.search);
  const liveId = searchParams.get('lv');
  if (liveId) {
    mountVenueStandalone(liveId);
  }
}

main();
