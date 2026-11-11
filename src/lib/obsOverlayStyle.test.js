import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OBS_PREVIEW_SAMPLES,
  buildObsComeviewUrl,
  buildObsOverlayCss,
  decodeObsOverlayStyle,
  defaultObsOverlayStyle,
  detectObsPreset,
  encodeObsOverlayStyle,
  liveIdFromWatchUrl,
  obsOverlayStyleOrDefault,
  obsRowHiddenFlags,
  parseObsOverlayStyle,
  resolveObsOverlayStyle,
  styleFromPreset,
  toStorageRecord
} from './obsOverlayStyle.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

describe('OBS透過の見た目', () => {
  it('既定は動きなし・アイコンと名前は出す・8行', () => {
    const style = defaultObsOverlayStyle();
    expect(style.v).toBe(1);
    expect(style.animate).toBe(false);
    expect(style.showIcons).toBe(true);
    expect(style.showNames).toBe(true);
    expect(style.maxLines).toBe(8);
    expect(style.preset).toBe('classic');
  });

  it('v が 1 でない記録は読まない', () => {
    expect(parseObsOverlayStyle(null)).toBeNull();
    expect(parseObsOverlayStyle({ textColor: '#ffffff' })).toBeNull();
    expect(parseObsOverlayStyle({ v: 2, textColor: '#ffffff' })).toBeNull();
    expect(parseObsOverlayStyle({ v: '1', textColor: '#ffffff' })).toBeNull();
  });

  it('壊れた色と範囲外の数は既定の範囲へ倒す', () => {
    const style = parseObsOverlayStyle({
      v: 1,
      textColor: '#fff;}</style><script>alert(1)</script>',
      nameColor: 'red',
      cardColor: '#gggggg',
      cardOpacity: 0,
      fontSize: '15px; background:url(https://evil.example)',
      maxLines: 0,
      showIcons: 1,
      showNames: 'no',
      animate: 'yes'
    });
    expect(style).not.toBeNull();
    expect(style?.textColor).toBe('#ffffff');
    expect(style?.nameColor).toBe('#8fd6ff');
    expect(style?.cardColor).toBe('#000000');
    expect(style?.cardOpacity).toBe(15);
    expect(style?.fontSize).toBe(15);
    expect(style?.maxLines).toBe(1);
    expect(style?.showIcons).toBe(true);
    expect(style?.showNames).toBe(true);
    expect(style?.animate).toBe(false);
  });

  it('保存する形は v:1 だけを残す', () => {
    const record = toStorageRecord({
      v: 1,
      textColor: '#112233',
      extra: '捨てる',
      fontSize: 99
    });
    expect(record.v).toBe(1);
    expect(record.fontSize).toBe(32);
    expect(record.textColor).toBe('#112233');
    expect(record).not.toHaveProperty('extra');
  });

  it('型を選ぶと値が揃い、1か所変えると custom になる', () => {
    const night = styleFromPreset('night');
    expect(detectObsPreset(night)).toBe('night');
    expect(night.animate).toBe(false);
    expect(styleFromPreset('nope').preset).toBe('classic');
    const compact = styleFromPreset('compact');
    expect(compact.showIcons).toBe(false);
    expect(detectObsPreset({ ...compact, fontSize: 20 })).toBe('custom');
  });

  it('URL の見た目が優先され、壊れた s は保存へ倒れる', () => {
    const custom = toStorageRecord({ ...defaultObsOverlayStyle(), fontSize: 22, preset: 'custom' });
    const token = encodeObsOverlayStyle(custom);
    const fromUrl = resolveObsOverlayStyle({
      queryParam: token,
      stored: toStorageRecord({ ...defaultObsOverlayStyle(), fontSize: 13 })
    });
    expect(fromUrl.source).toBe('url');
    expect(fromUrl.style.fontSize).toBe(22);
    expect(decodeObsOverlayStyle(token)?.fontSize).toBe(22);

    const stored = resolveObsOverlayStyle({
      queryParam: '%%%',
      stored: toStorageRecord({ ...defaultObsOverlayStyle(), fontSize: 20 })
    });
    expect(stored.source).toBe('storage');
    expect(stored.style.fontSize).toBe(20);

    expect(resolveObsOverlayStyle({ queryParam: '', stored: { v: 9 } }).source).toBe('default');
  });

  it('CSS に利用者の生文字や url( を入れない', () => {
    const evil = obsOverlayStyleOrDefault({
      v: 1,
      textColor: '#abcdef; } body { background: url(https://evil.example) }',
      fontSize: 21
    });
    const css = buildObsOverlayCss(evil, 'body.is-obs; background: url(https://evil.example)');
    expect(css).toContain('font-size: 21px');
    expect(css).toContain('color: #ffffff');
    expect(css).toContain('animation: none');
    expect(css).not.toMatch(/url\(|expression|@import|<\/|script/i);
    expect(css).not.toContain('evil.example');
    expect(css.startsWith('body.is-obs .nl-tl-row')).toBe(true);
  });

  it('動きをオンにした規則は obs-animate の中だけ', () => {
    const css = buildObsOverlayCss({ ...defaultObsOverlayStyle(), animate: true }, '#obsPreview.is-obs');
    expect(css).toContain('#obsPreview.is-obs.obs-animate .nl-tl-row.cv-row-in');
    expect(css).toContain('animation: obsRowIn 220ms ease-out');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('最大行数は新しい行を残して古い行を隠す', () => {
    expect(obsRowHiddenFlags(5, 2)).toEqual([true, true, true, false, false]);
    expect(obsRowHiddenFlags(2, 8)).toEqual([false, false]);
    expect(obsRowHiddenFlags(0, 3)).toEqual([]);
  });

  it('コピー用 URL は obs=1 と見た目を持ち、開く URL は見た目を埋めない', () => {
    const page = 'chrome-extension://abc/comeview.html';
    const style = { ...defaultObsOverlayStyle(), fontSize: 19 };
    const copied = buildObsComeviewUrl({
      pageUrl: page,
      liveId: 'lv12',
      includeLiveId: true,
      embedStyle: true,
      style
    });
    const opened = new URL(copied);
    expect(opened.searchParams.get('obs')).toBe('1');
    expect(opened.searchParams.get('lv')).toBe('lv12');
    expect(decodeObsOverlayStyle(opened.searchParams.get('s'))?.fontSize).toBe(19);

    const live = buildObsComeviewUrl({
      pageUrl: page,
      liveId: 'lv12',
      includeLiveId: false,
      embedStyle: false,
      style
    });
    const liveUrl = new URL(live);
    expect(liveUrl.searchParams.get('obs')).toBe('1');
    expect(liveUrl.searchParams.get('lv')).toBeNull();
    expect(liveUrl.searchParams.get('s')).toBeNull();
    expect(buildObsComeviewUrl({ pageUrl: 'not a url' })).toBe('');
  });

  it('配信 URL から lv だけ取る', () => {
    expect(liveIdFromWatchUrl('https://live.nicovideo.jp/watch/lv349100001?ref=x')).toBe('lv349100001');
    expect(liveIdFromWatchUrl('https://www.youtube.com/watch?v=abc')).toBe('');
  });

  it('見本の名前は匿名番号だけ', () => {
    expect(OBS_PREVIEW_SAMPLES.map((row) => row.name)).toEqual([
      '匿名001',
      '匿名002',
      '匿名003',
      '匿名004'
    ]);
  });

  it('コメビュは見た目画面を開き、OBS では動きを既定で止める', () => {
    const html = readFileSync(join(root, 'extension/comeview.html'), 'utf8');
    const entry = readFileSync(join(root, 'src/extension/comeview-entry.js'), 'utf8');
    expect(html).toContain('id="cvBtnObsStyle"');
    expect(html).toContain('body.is-obs .nl-tl-row.cv-row-in');
    expect(html).toContain('animation: none');
    expect(entry).toContain("getURL('obs-style.html')");
    expect(entry).toContain('mountObsOverlayStyle');
    expect(entry).toContain('KEY_OBS_OVERLAY_STYLE');
    expect(entry).not.toContain("'nls_obs_overlay_style_v1'");
  });
});
