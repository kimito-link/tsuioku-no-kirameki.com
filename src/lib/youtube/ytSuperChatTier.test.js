import { describe, it, expect } from 'vitest';
import { ytSuperChatTierColor, ytSuperChatFromRowText } from './ytSuperChatTier.js';

describe('ytSuperChatTierColor', () => {
  it('金額で色が変わる', () => {
    expect(ytSuperChatTierColor(100)).toBe('#1e88e5');
    expect(ytSuperChatTierColor(200)).toBe('#00e5ff');
    expect(ytSuperChatTierColor(500)).toBe('#1de9b6');
    expect(ytSuperChatTierColor(1000)).toBe('#ffca28');
    expect(ytSuperChatTierColor(2000)).toBe('#f57c00');
    expect(ytSuperChatTierColor(5000)).toBe('#e91e63');
    expect(ytSuperChatTierColor(50000)).toBe('#e62117');
    expect(ytSuperChatTierColor('x')).toBe('#1e88e5');
  });
});

describe('ytSuperChatFromRowText', () => {
  it('pt を優先して読む', () => {
    expect(ytSuperChatFromRowText('1 0:03:51 スーパーチャット NT$300.00 1,410 pt youtube')).toEqual({ yen: 1410 });
  });
  it('pt が無ければ ¥ を読む', () => {
    expect(ytSuperChatFromRowText('スーパーチャット ¥1,000')).toEqual({ yen: 1000 });
  });
  it('スーパーチャット以外は null', () => {
    expect(ytSuperChatFromRowText('ギフト 100 pt')).toBeNull();
  });
});
