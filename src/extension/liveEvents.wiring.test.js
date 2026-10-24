import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const statusEntry = readFileSync(new URL('./status-entry.js', import.meta.url), 'utf8');
const contentEntry = readFileSync(new URL('./content-entry.js', import.meta.url), 'utf8');
const publisher = readFileSync(new URL('./liveEventsPublisher.js', import.meta.url), 'utf8');

describe('配線: スマホのリアルタイム化(v0.1.1757)', () => {
  it('★PC: 送信の返事を新着の係へ渡す(realtime と viewerActive の両方が揃う間だけ動く)', () => {
    expect(statusEntry).toContain('_liveEvents.onAck(ack);');
    expect(publisher).toContain('const until = ack.realtime ? ack.viewingUntilMs : 0;');
    expect(publisher).toContain('enabled: Date.now() < wantedUntilMs');
    expect(publisher).toContain('?action=events');
    expect(publisher).toContain('sender.ingest(changes[KEY_LIVE_EVENTS_TAIL].newValue)');
  });
  it('★視聴ページ: 期限のキーがある間だけ TAIL を書く(鏡の書き込みの前・鏡の8秒の天井とは別)', () => {
    expect(contentEntry).toMatch(/writeLiveEventsTailIfWanted\(snap, sig, nowMs\);\s*if \(_lastTimelineMirrorSigByLive\.get\(lid\) === sig\) return;/);
    expect(contentEntry).toContain('if (!(_liveEventsWantedUntil > nowMs) || sig === _liveTailSig) return;');
    expect(contentEntry).toContain('if (changes[KEY_LIVE_EVENTS_WANTED]) _liveEventsWantedUntil = Number(changes[KEY_LIVE_EVENTS_WANTED].newValue) || 0;');
  });
});
