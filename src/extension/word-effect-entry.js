/**
 * word-effect-entry.js — 言葉の演出の設定と、OBS 用の透明な別窓。
 * ?obs=1 のときは操作欄を隠して背景を透かす(ウィンドウキャプチャ向け)。
 */
import '../lib/extDocBusyCensusBoot.js';
import { mountWordEffectOverlay } from './wordEffectOverlay.js';
import {
  KEY_WORD_EFFECT,
  WORD_EFFECT_COOLDOWN_MAX_MS,
  WORD_EFFECT_COOLDOWN_MIN_MS,
  WORD_EFFECT_FALL_MIN,
  WORD_EFFECT_MAX_RULES,
  readWordEffectSettings,
  writeWordEffectSettings
} from '../lib/wordEffect.js';

const obs = new URLSearchParams(location.search).get('obs') === '1';
if (obs) document.body.classList.add('is-obs');

const layer = document.getElementById('nl-word-effect-layer');
const panel = document.getElementById('nl-word-effect-panel');
const overlay = layer instanceof HTMLElement
  ? mountWordEffectOverlay(layer, { canPaint: () => true })
  : { preview() {}, destroy() {} };

if (panel) {
  const list = panel.querySelector('#nl-word-effect-rules');
  const status = panel.querySelector('#nl-word-effect-status');
  const enabled = panel.querySelector('#nl-word-effect-enabled');
  const maxConcurrent = panel.querySelector('#nl-word-effect-max');
  const obsUrl = panel.querySelector('#nl-word-effect-obs-url');
  let seq = 0;
  /** @type {boolean} */
  let locked = false;

  const storage = (() => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return chrome.storage.local;
    } catch {
      /* プレビュー */
    }
    return null;
  })();

  if (obsUrl instanceof HTMLInputElement) {
    try {
      obsUrl.value = chrome.runtime.getURL('word-effect.html?obs=1');
    } catch {
      obsUrl.value = 'word-effect.html?obs=1';
    }
  }

  /**
   * @param {string} text
   */
  const setStatus = (text) => {
    if (status) status.textContent = text;
  };

  /**
   * @param {import('../lib/wordEffect.js').WordEffectSettings} settings
   */
  const render = (settings) => {
    if (!(enabled instanceof HTMLInputElement) || !(maxConcurrent instanceof HTMLInputElement) || !(list instanceof HTMLElement)) return;
    enabled.checked = settings.enabled === true;
    enabled.disabled = locked;
    maxConcurrent.value = String(settings.maxConcurrent);
    maxConcurrent.disabled = locked;
    list.replaceChildren();
    for (const rule of settings.rules) list.appendChild(renderRule(rule));
    const addButtons = panel.querySelectorAll('[data-action="add"]');
    addButtons.forEach((btn) => {
      if (btn instanceof HTMLButtonElement) btn.disabled = locked || settings.rules.length >= WORD_EFFECT_MAX_RULES;
    });
    const save = panel.querySelector('[data-action="save"]');
    if (save instanceof HTMLButtonElement) save.disabled = locked;
  };

  /**
   * @param {Partial<import('../lib/wordEffect.js').WordEffectRule>} rule
   * @returns {HTMLElement}
   */
  const renderRule = (rule) => {
    const box = document.createElement('fieldset');
    box.className = 'rule';
    box.dataset.id = String(rule.id || '');
    const legend = document.createElement('legend');
    legend.textContent = rule.trigger === 'gift' ? 'ギフト' : '言葉';
    box.appendChild(legend);

    box.append(
      field('きっかけ', selectEl('trigger', [
        ['word', 'コメントの言葉'],
        ['gift', 'ギフト']
      ], rule.trigger === 'gift' ? 'gift' : 'word')),
      field('言葉（ギフトは空欄なら全部）', textEl('word', rule.word || '', '例: 888')),
      field('動き', selectEl('effect', [
        ['pop', '1つポンと出る'],
        ['fall', 'いくつか落ちる']
      ], rule.effect === 'fall' ? 'fall' : 'pop')),
      field('絵文字', textEl('emoji', rule.emoji || '✨', '✨')),
      field('画像の URL（空でよい・https のみ）', textEl('imageUrl', rule.imageUrl || '', 'https://')),
      field('落ちる数', selectEl('count', [
        ['2', '2'],
        ['3', '3'],
        ['4', '4'],
        ['5', '5']
      ], String(rule.count || 4))),
      field('間隔（秒）', numberEl('cooldown', (Number(rule.cooldownMs) || 3000) / 1000))
    );

    const actions = document.createElement('div');
    actions.className = 'rule-actions';
    const tryBtn = document.createElement('button');
    tryBtn.type = 'button';
    tryBtn.textContent = '試す';
    tryBtn.addEventListener('click', () => {
      overlay.preview(readRule(box));
    });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '消す';
    removeBtn.addEventListener('click', () => {
      box.remove();
      setStatus('消しました。残すには保存してください。');
    });
    actions.append(tryBtn, removeBtn);
    box.appendChild(actions);
    return box;
  };

  /**
   * @param {string} label
   * @param {HTMLElement} control
   */
  const field = (label, control) => {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const span = document.createElement('span');
    span.textContent = label;
    wrap.append(span, control);
    return wrap;
  };

  /**
   * @param {string} name
   * @param {Array<[string, string]>} options
   * @param {string} value
   */
  const selectEl = (name, options, value) => {
    const el = document.createElement('select');
    el.dataset.field = name;
    for (const [val, text] of options) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = text;
      if (val === value) opt.selected = true;
      el.appendChild(opt);
    }
    return el;
  };

  /**
   * @param {string} name
   * @param {string} value
   * @param {string} placeholder
   */
  const textEl = (name, value, placeholder) => {
    const el = document.createElement('input');
    el.type = 'text';
    el.dataset.field = name;
    el.value = value;
    el.placeholder = placeholder;
    el.autocomplete = 'off';
    return el;
  };

  /**
   * @param {string} name
   * @param {number} seconds
   */
  const numberEl = (name, seconds) => {
    const el = document.createElement('input');
    el.type = 'number';
    el.dataset.field = name;
    el.min = String(WORD_EFFECT_COOLDOWN_MIN_MS / 1000);
    el.max = String(WORD_EFFECT_COOLDOWN_MAX_MS / 1000);
    el.step = '0.5';
    el.value = String(seconds);
    return el;
  };

  /**
   * @param {HTMLElement} box
   */
  const readRule = (box) => {
    /** @param {string} name */
    const value = (name) => {
      const el = box.querySelector(`[data-field="${name}"]`);
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return el.value;
      return '';
    };
    const seconds = Number(value('cooldown'));
    return {
      id: box.dataset.id || '',
      trigger: value('trigger'),
      word: value('word'),
      effect: value('effect'),
      emoji: value('emoji'),
      imageUrl: value('imageUrl'),
      count: Number(value('count')) || WORD_EFFECT_FALL_MIN,
      cooldownMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : 3000
    };
  };

  const readForm = () => {
    const rules = [];
    if (list instanceof HTMLElement) {
      for (const box of list.querySelectorAll('.rule')) {
        if (box instanceof HTMLElement) rules.push(readRule(box));
      }
    }
    return {
      schemaVersion: 1,
      enabled: enabled instanceof HTMLInputElement && enabled.checked,
      maxConcurrent: maxConcurrent instanceof HTMLInputElement ? Number(maxConcurrent.value) : 4,
      rules
    };
  };

  const nextId = () => {
    seq += 1;
    return `w${(Date.now() + seq).toString(36)}`.slice(0, 16).toLowerCase();
  };

  /**
   * @param {'word'|'gift'} trigger
   */
  const addRule = (trigger) => {
    if (!(list instanceof HTMLElement)) return;
    if (list.querySelectorAll('.rule').length >= WORD_EFFECT_MAX_RULES) {
      setStatus(`登録は${WORD_EFFECT_MAX_RULES}件までです。`);
      return;
    }
    list.appendChild(renderRule({
      id: nextId(),
      trigger,
      word: '',
      effect: trigger === 'gift' ? 'fall' : 'pop',
      emoji: trigger === 'gift' ? '🎁' : '✨',
      imageUrl: '',
      count: 4,
      cooldownMs: 3000
    }));
    setStatus('追加しました。残すには保存してください。');
  };

  panel.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (action === 'add-word') addRule('word');
    if (action === 'add-gift') addRule('gift');
    if (action === 'save') void save();
    if (action === 'copy-obs') void copyObs();
  });

  const save = async () => {
    if (!storage) {
      setStatus('この画面では保存できません。拡張の画面から開いてください。');
      return;
    }
    try {
      const bag = await storage.get(KEY_WORD_EFFECT);
      const result = writeWordEffectSettings(bag?.[KEY_WORD_EFFECT], readForm());
      if (!result.ok) {
        locked = true;
        setStatus('この設定は新しい版なので、ここでは上書きしません。');
        return;
      }
      await storage.set({ [KEY_WORD_EFFECT]: result.value });
      const saved = readWordEffectSettings(result.value).settings;
      render(saved);
      setStatus(saved.enabled ? '保存しました。次のコメントから動きます。' : '保存しました。演出はオフのままです。');
    } catch {
      setStatus('保存できませんでした。もう一度押してください。');
    }
  };

  const copyObs = async () => {
    const text = obsUrl instanceof HTMLInputElement ? obsUrl.value : '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('透過のアドレスをコピーしました。OBS のウィンドウキャプチャで、その画面を重ねてください。');
    } catch {
      if (obsUrl instanceof HTMLInputElement) obsUrl.select();
      setStatus('コピーできなかったので、アドレスを選択しました。');
    }
  };

  const boot = async () => {
    if (!storage) {
      render(readWordEffectSettings(null).settings);
      setStatus('登録した言葉は、拡張の中で保存されます。');
      return;
    }
    try {
      const bag = await storage.get(KEY_WORD_EFFECT);
      const read = readWordEffectSettings(bag?.[KEY_WORD_EFFECT]);
      locked = read.locked;
      render(read.settings);
      setStatus(read.locked
        ? 'この設定は新しい版なので、見るだけにしています。'
        : '最初はオフです。言葉を追加して、オンにして保存してください。');
    } catch {
      render(readWordEffectSettings(null).settings);
      setStatus('設定を読めませんでした。');
    }
  };
  void boot();
}
