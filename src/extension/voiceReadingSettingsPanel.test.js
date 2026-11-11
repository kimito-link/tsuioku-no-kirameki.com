// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { KEY_VOICE_READING_SCRIPT } from '../lib/voiceKeys.js';
import { mountVoiceReadingSettingsButton } from './voiceReadingSettingsPanel.js';

function memoryStorage() {
  /** @type {Record<string, unknown>} */
  const data = {};
  return {
    data,
    local: {
      get: async (keys) => {
        /** @type {Record<string, unknown>} */
        const out = {};
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) out[key] = data[key];
        return out;
      },
      set: async (obj) => {
        Object.assign(data, obj);
      }
    }
  };
}

function dialog() {
  const host = document.getElementById('nl-voice-reading-host');
  return host && host.shadowRoot ? host.shadowRoot : null;
}

function byText(root, tag, text) {
  return [...root.querySelectorAll(tag)].find((node) => node.textContent === text) || null;
}

afterEach(() => {
  document.body.textContent = '';
});

describe('読み方の画面', () => {
  it('追加・編集・削除・書き出し・読み込み・型・読まない人', async () => {
    const storage = memoryStorage();
    const anchor = document.createElement('button');
    anchor.textContent = '読み上げ';
    document.body.append(anchor);
    const open = mountVoiceReadingSettingsButton({ anchor, storage });
    expect(open?.textContent).toBe('読み方');
    open?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    const root = dialog();
    expect(root).toBeTruthy();
    expect(root?.textContent || '').not.toMatch(/LINE|有料|課金/);

    const word = root.querySelector('[aria-label="追加する単語"]');
    const reading = root.querySelector('[aria-label="追加する読み"]');
    expect(word).toBeInstanceOf(HTMLInputElement);
    expect(reading).toBeInstanceOf(HTMLInputElement);
    word.value = '草';
    reading.value = 'くさ';
    byText(root, 'button', '追加')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    const saved = storage.data[KEY_VOICE_READING_SCRIPT];
    expect(saved.schemaVersion).toBe(1);
    expect(saved.dictionary).toEqual([{ word: '草', reading: 'くさ' }]);
    expect(saved.commentTemplate).toContain('{comment}');
    expect(saved.giftTemplate).toContain('{gift}');

    const root2 = dialog();
    const edit = root2.querySelector('[data-reading]');
    expect(edit).toBeInstanceOf(HTMLInputElement);
    edit.value = 'くさくさ';
    edit.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    expect(storage.data[KEY_VOICE_READING_SCRIPT].dictionary[0].reading).toBe('くさくさ');

    const comment = root2.querySelector('[data-comment-template]');
    comment.value = '{name}さん {comment}';
    comment.dispatchEvent(new Event('input', { bubbles: true }));
    const gift = root2.querySelector('[data-gift-template]');
    gift.value = '{name}さん {gift} ありがとう';
    gift.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    expect(storage.data[KEY_VOICE_READING_SCRIPT].commentTemplate).toBe('{name}さん {comment}');
    expect(storage.data[KEY_VOICE_READING_SCRIPT].giftTemplate).toBe('{name}さん {gift} ありがとう');
    expect(root2.querySelector('[data-preview]')?.textContent).toContain('くさくさ');
    expect(root2.querySelector('[data-preview]')?.textContent).toContain('ありがとう');

    byText(root2, 'button', '削除')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(storage.data[KEY_VOICE_READING_SCRIPT].dictionary).toEqual([]);

    const ex = dialog().querySelector('[aria-label="読まない人"]');
    ex.value = '12';
    const adders = [...dialog().querySelectorAll('button')].filter((b) => b.textContent === '追加');
    adders[adders.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(storage.data[KEY_VOICE_READING_SCRIPT].exclude[0].key).toBe('u:12');

    const blobUrl = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      blobUrl.push(blob);
      return 'blob:voice-reading';
    };
    byText(dialog(), 'button', '書き出す')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(blobUrl.length).toBe(1);
    URL.createObjectURL = orig;

    const fileInput = dialog().querySelector('input[type="file"]');
    const file = new File(['草\tくさ\n888\tぱちぱち\n'], 'voice-reading.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fileInput.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 20));
    expect(storage.data[KEY_VOICE_READING_SCRIPT].dictionary).toEqual([
      { word: '草', reading: 'くさ' },
      { word: '888', reading: 'ぱちぱち' }
    ]);
    expect(storage.data[KEY_VOICE_READING_SCRIPT].giftTemplate).toBe('{name}さん {gift} ありがとう');
    expect(dialog().textContent).toContain('2件の辞書を読み込みました');
  });
});