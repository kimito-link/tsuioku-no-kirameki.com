import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** v0.1.1729 スマホ化 第1段: 送る側(status)と見る側(③WEB)の配線が外れていないこと。 */
const status = readFileSync(new URL('./status-entry.js', import.meta.url), 'utf8');
const liveView = readFileSync(new URL('../../app/live-view.js', import.meta.url), 'utf8');

describe('スマホの WEB版を早く新しくする配線', () => {
  it('自動送信の判定に「中身が前回の送信から変わったか」を渡し、送ったらその中身を覚える', () => {
    expect(status).toMatch(/changed:\s*Boolean\(sig\)\s*&&\s*sig\s*!==\s*_autoPublishLastSentSig/);
    expect(status).toMatch(/_autoPublishLastLaunchAtMs = Date\.now\(\);\s*_autoPublishLastSentSig = sig;/);
  });
  it('③WEB は前回の ETag を If-None-Match に載せ、304 なら塗り直さずバナーだけ進める', () => {
    expect(liveView).toMatch(/'If-None-Match': _lastEtag/);
    expect(liveView).toMatch(/res\.status === 304\) return SNAPSHOT_NOT_MODIFIED/);
    expect(liveView).toMatch(/jsonBlob === SNAPSHOT_NOT_MODIFIED\) \{\s*\/\/[^\n]*\n\s*refreshStaleBanner\(_latestSnapshot\);/);
    expect(liveView).toMatch(/const POLL_INTERVAL_MS = 15_000;/);
  });
  it('③WEB は画面が表に戻ったら即1回取る(裏にある間は周期が取らない)', () => {
    expect(liveView).toMatch(/addEventListener\('visibilitychange', \(\) => \{\s*if \(!document\.hidden\) refresh\(token\)/);
    expect(liveView).toMatch(/if \(typeof document !== 'undefined' && document\.hidden\) return;\s*refresh\(token\)/);
  });
  it('送信の成否で失敗の連続回数を数え、判定に渡す', () => {
    expect(status).toMatch(/failStreak: _autoPublishFailStreak/);
    expect(status).toMatch(/_autoPublishFailStreak = r && r\.ok \? 0 : _autoPublishFailStreak \+ 1;/);
  });
});
