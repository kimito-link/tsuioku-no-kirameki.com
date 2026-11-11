import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultObsOverlayStyle, encodeObsOverlayStyle } from './obsOverlayStyle.js';
import {
  OBS_APP_ORIGIN,
  buildObsBrowserSourceUrl,
  obsBrowserSourceOrDefault,
  parseObsBrowserSource,
  readObsBrowserSourceQuery,
  shouldSendObsComments,
  toObsBrowserSourceRecord,
  wantedWritePlan
} from './obsBrowserSource.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('OBSのブラウザへ送る', () => {
  it('読めない記録と、版が違う記録はオフ', () => {
    expect(obsBrowserSourceOrDefault(null)).toEqual({ v: 1, enabled: false });
    expect(parseObsBrowserSource({ v: 2, enabled: true })).toBeNull();
    expect(obsBrowserSourceOrDefault({ v: 2, enabled: true }).enabled).toBe(false);
    expect(toObsBrowserSourceRecord(true)).toEqual({ v: 1, enabled: true });
    expect(parseObsBrowserSource({ v: 1, enabled: true, extra: 1 })).toEqual({ v: 1, enabled: true });
  });

  it('オフ、または誰も見ていない、または中継が無いときは送らない', () => {
    const on = { enabled: true, viewerActive: true, realtime: true };
    expect(shouldSendObsComments(on)).toBe(true);
    expect(shouldSendObsComments({ ...on, enabled: false })).toBe(false);
    expect(shouldSendObsComments({ ...on, viewerActive: false })).toBe(false);
    expect(shouldSendObsComments({ ...on, realtime: false })).toBe(false);
    expect(shouldSendObsComments({ ...on, publisherAlive: true })).toBe(false);
  });

  it('貼るURLは https の /obs で、トークンと見た目が乗る。www と短いトークンは出さない', () => {
    const token = 'abcdEFGH1234';
    const style = defaultObsOverlayStyle();
    const url = buildObsBrowserSourceUrl({ token, style });
    expect(url.startsWith(`${OBS_APP_ORIGIN}/obs?`)).toBe(true);
    expect(url).not.toContain('www.');
    expect(url).not.toContain('index.html');
    const q = new URL(url).searchParams;
    expect(q.get('t')).toBe(token);
    expect(q.get('s')).toBe(encodeObsOverlayStyle(style));
    expect(buildObsBrowserSourceUrl({ origin: 'http://app.tsuioku-no-kirameki.com', token })).toMatch(/^https:\/\/app\.tsuioku-no-kirameki\.com\/obs\?t=/);
    expect(buildObsBrowserSourceUrl({ origin: 'https://www.tsuioku-no-kirameki.com', token })).toBe('');
    expect(buildObsBrowserSourceUrl({ token: 'short' })).toBe('');
  });

  it('ページはトークンと見た目を読む。壊れた見た目は null', () => {
    const token = 'abcdEFGH1234';
    const s = encodeObsOverlayStyle(defaultObsOverlayStyle());
    const ok = readObsBrowserSourceQuery(`?t=${token}&s=${s}`);
    expect(ok.token).toBe(token);
    expect(ok.style?.v).toBe(1);
    expect(readObsBrowserSourceQuery('?t=nope').token).toBe('');
    expect(readObsBrowserSourceQuery(`?t=${token}&s=%%%`).style).toBeNull();
  });

  it('期限は延ばすだけ。スマホ側の長い期限は消さず、自分で書いた期限だけ手放す', () => {
    expect(wantedWritePlan({ nowMs: 1_000, enabled: true, sending: true, currentUntil: 0, lastWritten: 0 }).write).toBe(41_000);
    expect(wantedWritePlan({ nowMs: 1_000, enabled: true, sending: true, currentUntil: 200_000, lastWritten: 0 }).write).toBeNull();
    expect(wantedWritePlan({ nowMs: 50_000, enabled: false, sending: false, currentUntil: 41_000, lastWritten: 41_000 }).write).toBe(0);
    expect(wantedWritePlan({ nowMs: 50_000, enabled: false, sending: false, currentUntil: 200_000, lastWritten: 41_000 }).write).toBeNull();
  });

  it('プライバシーの3点と、貼るURLの書き換えが同じ機能を指す', () => {
    const phrase = 'OBSのブラウザへ送る';
    expect(read('tsuioku-no-kirameki/privacy.html')).toContain(phrase);
    expect(read('docs/releases/description-ja.txt')).toContain(phrase);
    expect(read('docs/releases/privacy-justifications-ja.txt')).toContain(phrase);
    const vercel = JSON.parse(read('vercel.json'));
    const rewrite = vercel.rewrites.find((x) => x.source === '/obs');
    expect(rewrite.destination).toBe('/app/obs.html');
    expect(rewrite.has).toEqual([{ type: 'host', value: 'app.tsuioku-no-kirameki.com' }]);
    const page = read('app/obs.html');
    expect(page).toContain('background: transparent');
    expect(page).not.toContain('index.html');
    const boot = read('src/extension/obsBrowserSourceBoot.js');
    const content = read('src/extension/content-entry.js');
    expect(content).toContain('startObsBrowserSource()');
    expect(content).not.toContain('nls_obs_browser_source_v1');
    expect(boot).toContain('action=events');
    expect(boot).toContain('action=viewer');
    expect(read('api/status.js')).toContain("req.query?.action === 'viewer'");
    expect(read('extension/obs-style.html')).toContain('localhost');
    expect(read('extension/obs-style.html')).toContain('id="obsSend"');
    expect(read('extension/obs-style.html')).not.toMatch(/id="obsSend"[^>]*checked/);
  });
});
