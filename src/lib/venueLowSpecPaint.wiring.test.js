import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// v0.1.2212(低スペックで固まらない): 会場の配線。純関数の振る舞いは venueSpeechPollGate.test.js / venueHeatPaint.test.js。
const source = fs.readFileSync(path.resolve('src/extension/venueBar.js'), 'utf8');

/** @param {string} from @param {string} to */
const slice = (from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe('会場: テールが直接届いている間は0.8秒の読み直しを省く', () => {
  it('pollSpeech は storage を読む前に判定し、省いたら読まずに抜ける', () => {
    const body = slice('const pollSpeech = async () => {', 'const handleStorageChange =');
    const gate = body.indexOf('shouldSkipVenueSpeechPollRead({');
    const read = body.indexOf('chrome.storage.local.get(');
    expect(gate).toBeGreaterThan(0);
    expect(read).toBeGreaterThan(gate);
    // 配信の切り替え・数字の見回りは省く判定より前(毎回走る)
    expect(body.indexOf('switchVenueLive(liveId)')).toBeLessThan(gate);
    expect(body.indexOf('paintStatStrip();')).toBeLessThan(gate);
    expect(body.indexOf('resetSpeechTracking(liveId)')).toBeLessThan(gate);
    // 自己修復読みが要るときは省かない
    expect(body.slice(gate, read)).toContain('panelRefreshDue: needsPanelSummaryRefresh');
    // 省いても speechInFlight を立てたままにしない(立てる前に return)
    expect(body.indexOf('speechInFlight = true')).toBeGreaterThan(gate);
  });

  it('テールの onChanged を処理するときに届いた時刻を覚える', () => {
    const body = slice('const handleStorageChange =', 'const stopSpeechPolling =');
    const mark = body.indexOf('_speechTailPushAt = Date.now();');
    const proc = body.indexOf("processSpeechRows(/** @type {Array<Record<string, any>>} */ (changes[tailKey].newValue), 'tail')");
    expect(mark).toBeGreaterThan(0);
    expect(proc).toBeGreaterThan(mark);
  });

  it('開いた直後と配信の切り替えでは必ず1回読む(届いた時刻を 0 に戻す)', () => {
    const start = slice('const startSpeechPolling = () => {', 'speechTimer = window.setInterval(');
    expect(start.indexOf('_speechTailPushAt = 0;')).toBeGreaterThan(0);
    expect(start.indexOf('_speechTailPushAt = 0;')).toBeLessThan(start.indexOf('void pollSpeech();'));
    const reset = slice('const resetSpeechTracking = (', 'speechLiveId = nextLiveId;');
    expect(reset).toContain('_speechTailPushAt = 0;');
  });

  it('新しいタイマーは足していない(読みの間隔は共有の 800ms のまま)', () => {
    expect(source).toContain('const SPEECH_INTERVAL_MS = VENUE_SPEECH_POLL_INTERVAL_MS;');
    expect((source.match(/SPEECH_INTERVAL_MS\)/g) || []).length).toBe(1);
  });
});

describe('会場: 熱量の照明は見た目が変わるときだけ stage に書く', () => {
  it('applyVenueHeat は sig を比べてから setProperty する・群衆は丸めない値のまま', () => {
    const body = slice('const applyVenueHeat = (commentRows) => {', 'const nowMs = () =>');
    const crowd = body.indexOf('crowdHeatLevel = level;');
    const cmp = body.indexOf('paint.sig === _venueHeatPaintSig');
    const write = body.indexOf("stage.style.setProperty('--nlsb-heat-color'");
    expect(crowd).toBeGreaterThan(0);
    expect(crowd).toBeLessThan(cmp);
    expect(cmp).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(cmp);
    expect(body).toContain('buildVenueHeatPaint(level)');
  });
});
