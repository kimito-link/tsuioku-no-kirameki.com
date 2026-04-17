import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CUSTOM_FRAME,
  DEFAULT_FRAME_ID,
  FRAME_PRESETS,
  LEGACY_FRAME_ALIAS,
  darkenHexColor,
  frameLabel,
  getFramePreset,
  hasFramePreset,
  normalizeFrameId,
  normalizeHexColor,
  resolveFrameVars,
  sanitizeCustomFrame
} from './popupFramePresets.js';

describe('popupFramePresets: 定数と凍結', () => {
  it('DEFAULT_FRAME_ID は light', () => {
    expect(DEFAULT_FRAME_ID).toBe('light');
  });

  it('FRAME_PRESETS は 4 種（light/dark/midnight/sunset）', () => {
    expect(Object.keys(FRAME_PRESETS).sort()).toEqual(
      ['dark', 'light', 'midnight', 'sunset'].sort()
    );
  });

  it('FRAME_PRESETS は凍結されている', () => {
    expect(Object.isFrozen(FRAME_PRESETS)).toBe(true);
    expect(Object.isFrozen(FRAME_PRESETS.light)).toBe(true);
    expect(Object.isFrozen(FRAME_PRESETS.light.vars)).toBe(true);
  });

  it('LEGACY_FRAME_ALIAS は旧 ID を現行 ID に向ける', () => {
    expect(LEGACY_FRAME_ALIAS.trio).toBe('light');
    expect(LEGACY_FRAME_ALIAS.link).toBe('light');
    expect(LEGACY_FRAME_ALIAS.konta).toBe('sunset');
    expect(LEGACY_FRAME_ALIAS.tanunee).toBe('midnight');
  });

  it('DEFAULT_CUSTOM_FRAME は 3 色すべて正規化済 hex', () => {
    expect(DEFAULT_CUSTOM_FRAME.headerStart).toMatch(/^#[0-9a-f]{6}$/);
    expect(DEFAULT_CUSTOM_FRAME.headerEnd).toMatch(/^#[0-9a-f]{6}$/);
    expect(DEFAULT_CUSTOM_FRAME.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.isFrozen(DEFAULT_CUSTOM_FRAME)).toBe(true);
  });
});

describe('hasFramePreset', () => {
  it('存在する ID で true', () => {
    expect(hasFramePreset('light')).toBe(true);
    expect(hasFramePreset('dark')).toBe(true);
    expect(hasFramePreset('midnight')).toBe(true);
    expect(hasFramePreset('sunset')).toBe(true);
  });

  it('存在しない ID で false', () => {
    expect(hasFramePreset('custom')).toBe(false);
    expect(hasFramePreset('unknown')).toBe(false);
    expect(hasFramePreset('')).toBe(false);
  });

  it('プロトタイプ汚染は拾わない', () => {
    expect(hasFramePreset('toString')).toBe(false);
    expect(hasFramePreset('hasOwnProperty')).toBe(false);
  });
});

describe('normalizeFrameId', () => {
  it('小文字化・trim する', () => {
    expect(normalizeFrameId(' Light ')).toBe('light');
    expect(normalizeFrameId('DARK')).toBe('dark');
  });

  it('legacy alias は現行 ID に置換', () => {
    expect(normalizeFrameId('trio')).toBe('light');
    expect(normalizeFrameId('link')).toBe('light');
    expect(normalizeFrameId('konta')).toBe('sunset');
    expect(normalizeFrameId('tanunee')).toBe('midnight');
  });

  it('未知 ID はそのまま返す（呼び出し側で再検証前提）', () => {
    expect(normalizeFrameId('nope')).toBe('nope');
    expect(normalizeFrameId('custom')).toBe('custom');
  });

  it('null/undefined/空は空文字', () => {
    expect(normalizeFrameId(null)).toBe('');
    expect(normalizeFrameId(undefined)).toBe('');
    expect(normalizeFrameId('')).toBe('');
    expect(normalizeFrameId('   ')).toBe('');
  });

  it('非文字列は stringify してから処理', () => {
    expect(normalizeFrameId(123)).toBe('123');
    expect(normalizeFrameId({})).toBe('[object object]');
  });
});

describe('getFramePreset', () => {
  it('存在すればプリセットオブジェクトを返す', () => {
    const p = getFramePreset('light');
    expect(p).not.toBeNull();
    expect(p?.label).toBe('ライト');
    expect(p?.vars['--nl-accent']).toBe('#0f8fd8');
  });

  it('存在しなければ null', () => {
    expect(getFramePreset('custom')).toBeNull();
    expect(getFramePreset('unknown')).toBeNull();
  });
});

describe('frameLabel', () => {
  it('各プリセットのラベルを返す', () => {
    expect(frameLabel('light')).toBe('ライト');
    expect(frameLabel('dark')).toBe('ダーク');
    expect(frameLabel('midnight')).toBe('ミッドナイト');
    expect(frameLabel('sunset')).toBe('サンセット');
  });

  it('custom は「カスタム」', () => {
    expect(frameLabel('custom')).toBe('カスタム');
  });

  it('未知 ID は DEFAULT のラベル', () => {
    expect(frameLabel('unknown')).toBe('ライト');
    expect(frameLabel('')).toBe('ライト');
  });
});

describe('normalizeHexColor', () => {
  it('正しい #rrggbb はそのまま（小文字化）', () => {
    expect(normalizeHexColor('#AABBCC', '#000000')).toBe('#aabbcc');
    expect(normalizeHexColor('#0f8fd8', '#000000')).toBe('#0f8fd8');
  });

  it('前後空白は trim', () => {
    expect(normalizeHexColor('  #abcdef  ', '#000000')).toBe('#abcdef');
  });

  it('フォーマット違反は fallback', () => {
    expect(normalizeHexColor('', '#ffffff')).toBe('#ffffff');
    expect(normalizeHexColor('#abc', '#ffffff')).toBe('#ffffff');
    expect(normalizeHexColor('red', '#ffffff')).toBe('#ffffff');
    expect(normalizeHexColor(null, '#ffffff')).toBe('#ffffff');
    expect(normalizeHexColor(undefined, '#ffffff')).toBe('#ffffff');
    expect(normalizeHexColor(123, '#ffffff')).toBe('#ffffff');
    expect(normalizeHexColor('#gghhii', '#ffffff')).toBe('#ffffff');
  });
});

describe('darkenHexColor', () => {
  it('ratio=0 なら色変化なし（小文字化のみ）', () => {
    expect(darkenHexColor('#AABBCC', 0)).toBe('#aabbcc');
  });

  it('ratio=1 で完全黒', () => {
    expect(darkenHexColor('#ffffff', 1)).toBe('#000000');
  });

  it('ratio=0.5 で各チャンネル半分（小数四捨五入）', () => {
    // 0xFF=255 * 0.5 = 127.5 → round → 128 = 0x80
    expect(darkenHexColor('#ffffff', 0.5)).toBe('#808080');
  });

  it('既定の fallback（不正値）は #0f8fd8 基準', () => {
    // 不正値は fallback #0f8fd8 として扱い ratio=0 → そのまま
    expect(darkenHexColor('invalid', 0)).toBe('#0f8fd8');
  });

  it('黒を暗くしても黒（clamp で負にならない）', () => {
    expect(darkenHexColor('#000000', 0.5)).toBe('#000000');
  });
});

describe('sanitizeCustomFrame', () => {
  it('正しい 3 色はそのまま', () => {
    const out = sanitizeCustomFrame({
      headerStart: '#112233',
      headerEnd: '#445566',
      accent: '#778899'
    });
    expect(out).toEqual({
      headerStart: '#112233',
      headerEnd: '#445566',
      accent: '#778899'
    });
  });

  it('欠損／不正なフィールドは DEFAULT_CUSTOM_FRAME 値で埋める', () => {
    const out = sanitizeCustomFrame({ headerStart: 'invalid' });
    expect(out.headerStart).toBe(DEFAULT_CUSTOM_FRAME.headerStart);
    expect(out.headerEnd).toBe(DEFAULT_CUSTOM_FRAME.headerEnd);
    expect(out.accent).toBe(DEFAULT_CUSTOM_FRAME.accent);
  });

  it('非オブジェクト（null, undefined, 文字列）でも落ちずに DEFAULT', () => {
    expect(sanitizeCustomFrame(null)).toEqual(DEFAULT_CUSTOM_FRAME);
    expect(sanitizeCustomFrame(undefined)).toEqual(DEFAULT_CUSTOM_FRAME);
    expect(sanitizeCustomFrame('nope')).toEqual(DEFAULT_CUSTOM_FRAME);
    expect(sanitizeCustomFrame(42)).toEqual(DEFAULT_CUSTOM_FRAME);
  });
});

describe('resolveFrameVars', () => {
  it('既定プリセットは FRAME_PRESETS の vars を返す', () => {
    expect(resolveFrameVars('light', DEFAULT_CUSTOM_FRAME)).toEqual(
      FRAME_PRESETS.light.vars
    );
    expect(resolveFrameVars('dark', DEFAULT_CUSTOM_FRAME)).toEqual(
      FRAME_PRESETS.dark.vars
    );
  });

  it('未知 ID は DEFAULT（light）の vars にフォールバック', () => {
    expect(resolveFrameVars('nope', DEFAULT_CUSTOM_FRAME)).toEqual(
      FRAME_PRESETS.light.vars
    );
  });

  it('custom は 3 色を light 基調に合成し accent-hover は自動', () => {
    const vars = resolveFrameVars('custom', {
      headerStart: '#112233',
      headerEnd: '#445566',
      accent: '#0f8fd8'
    });
    expect(vars['--nl-header-start']).toBe('#112233');
    expect(vars['--nl-header-end']).toBe('#445566');
    expect(vars['--nl-accent']).toBe('#0f8fd8');
    // accent-hover は darken 20% 相当（自動生成されていればよい）
    expect(vars['--nl-accent-hover']).toMatch(/^#[0-9a-f]{6}$/);
    expect(vars['--nl-accent-hover']).not.toBe('#0f8fd8');
    // light 基調の固定値も入っている
    expect(vars['--nl-text']).toBe('#1f2937');
    expect(vars['--nl-surface']).toBe('#ffffff');
  });

  it('custom で不正値が来ても sanitize されてから合成される', () => {
    const vars = resolveFrameVars('custom', {
      // @ts-expect-error 意図的に不正値
      headerStart: 'nope',
      // @ts-expect-error
      headerEnd: null,
      // @ts-expect-error
      accent: 42
    });
    expect(vars['--nl-header-start']).toBe(DEFAULT_CUSTOM_FRAME.headerStart);
    expect(vars['--nl-header-end']).toBe(DEFAULT_CUSTOM_FRAME.headerEnd);
    expect(vars['--nl-accent']).toBe(DEFAULT_CUSTOM_FRAME.accent);
  });
});
