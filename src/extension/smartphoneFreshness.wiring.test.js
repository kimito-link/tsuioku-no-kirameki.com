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

describe('スマホは1配信だけ映す配線(2026-10-21)', () => {
  it('配信者カードは映している配信の lives を使う(lives[0] 固定ではない)', () => {
    expect(liveView).toMatch(/paintBroadcasterCard\(pickLiveForCard\(jsonBlob\)\)/);
    expect(liveView).not.toMatch(/paintBroadcasterCard\(Array\.isArray\(jsonBlob\.lives\) \? jsonBlob\.lives\[0\]/);
  });
  it('映す配信が変わったら lv を差し替えて起動し直す', () => {
    expect(liveView).toMatch(/isLiveSwitched\(_shownLiveId, nextLiveId\) \|\| \(!_shownLiveId && nextLiveId\)\) \{\s*switchToLive\(nextLiveId\);\s*return;/);
    expect(liveView).toMatch(/u\.searchParams\.set\('lv', lv\);\s*location\.replace\(u\.href\);/);
  });
});

describe('配線: スマホ版の利用者ごとの鍵(v0.1.1731)', () => {
  const src = readFileSync(new URL('./status-entry.js', import.meta.url), 'utf8');
  it('送信は getPublishCredentials の鍵とヘッダで送る(共有キーのヘッダを直書きしない)', () => {
    expect(src).toContain('headers: creds.headers');
    expect(src).toContain('buildPublishBody(creds, jsonBlob)');
    expect(src).not.toMatch(/'x-share-key': ingestKey/);
  });
  it('同意 OFF でサーバーの利用者データを消す・401 で鍵を捨てる・同意 ON で鍵をもらう', () => {
    expect(src).toMatch(/if \(!value\) await deleteDeviceOnServer\(/);
    expect(src).toMatch(/shouldForgetDeviceCred\(creds\.mode, res\.status\)\) void forgetDeviceCred\(\)/);
    expect(src).toMatch(/maybeRegisterDevice\(\{ optedIn: _webPublishOptIn === true/);
    expect(src).toContain('hasKeys: Boolean(getPublishCredentials(getUploadConfig()))');
  });
});

describe('配線: 📱 スマホで見る(v0.1.1732)', () => {
  const src = readFileSync(new URL('./status-entry.js', import.meta.url), 'utf8');
  it('同意スイッチは共有キーが無くても出す(null を返さない)・発行と作り直しを渡す', () => {
    const at = src.indexOf('function buildAutoPublishConsentToggle() {');
    const body = src.slice(at, src.indexOf('function buildWebUrlButton() {'));
    expect(body).toContain('return buildSmartphoneCard({');
    expect(body).not.toMatch(/return null/);
    expect(body).toContain('setOptIn: (next) => setWebPublishOptIn(next)');
    expect(body).toContain('rotate: rotateDeviceViewToken');
  });
  it('手動の共有ボタンも利用者の鍵で出る', () => {
    expect(src).toContain('if (!getPublishCredentials(getUploadConfig())) return null;');
  });
});
