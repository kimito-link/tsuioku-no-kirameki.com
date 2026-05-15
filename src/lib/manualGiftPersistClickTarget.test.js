/** @vitest-environment happy-dom */

import { describe, expect, it } from 'vitest';
import { isManualGiftPersistClickTarget } from './manualGiftPersistClickTarget.js';

describe('isManualGiftPersistClickTarget', () => {
  it('returns false for targets inside extension inline host', () => {
    const host = document.createElement('div');
    host.id = 'nls-inline-popup-host';
    const inner = document.createElement('button');
    inner.className = '___gift-button___abc';
    host.appendChild(inner);
    document.body.appendChild(host);
    try {
      expect(
        isManualGiftPersistClickTarget(inner, 'nls-inline-popup-host')
      ).toBe(false);
    } finally {
      host.remove();
    }
  });

  it('returns true for gift-button outside extension host', () => {
    const wrap = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = '___gift-button___xyz';
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    try {
      expect(isManualGiftPersistClickTarget(btn, 'nls-inline-popup-host')).toBe(
        true
      );
    } finally {
      wrap.remove();
    }
  });
});
