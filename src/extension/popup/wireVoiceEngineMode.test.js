import { describe, it, expect, vi } from 'vitest';
import { wireVoiceEngineMode } from './wireVoiceEngineMode.js';

function fakeRoot() {
  const el = { dataset: {}, hidden: true, textContent: '', style: {}, classList: { toggle: vi.fn() } };
  const select = { dataset: {}, value: 'cpu', addEventListener: vi.fn() };
  return {
    el,
    select,
    root: {
      getElementById: (id) => (id === 'voiceEngineMode' ? el : id === 'voiceEnginePref' ? select : null)
    }
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('wireVoiceEngineMode', () => {
  it('読み上げ OFF では出さず、エンジンにも聞かない', async () => {
    const { el, root } = fakeRoot();
    const probeAlive = vi.fn();
    const probeDevices = vi.fn();
    wireVoiceEngineMode(root, {
      isReadingOn: async () => false,
      getPref: async () => null,
      probeAlive,
      probeDevices,
      retryMs: 0
    });
    await tick();
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe('');
    expect(probeAlive).not.toHaveBeenCalled();
    expect(probeDevices).not.toHaveBeenCalled();
  });

  it('CPU の希望と CPU だけのエンジンは CPU で接続中。警告色にはしない', async () => {
    const { el, select, root } = fakeRoot();
    wireVoiceEngineMode(root, {
      isReadingOn: async () => true,
      getPref: async () => 'cpu',
      probeAlive: async () => ({ ok: true }),
      probeDevices: async () => ({ mode: 'cpu', gpuCapable: false }),
      retryMs: 0
    });
    await tick();
    await tick();
    expect(select.value).toBe('cpu');
    expect(el.textContent).toBe('VOICEVOX：CPUで接続中');
    expect(el.hidden).toBe(false);
    expect(el.style.color).toBe('#7a828e');
    expect(el.textContent).not.toContain('速く');
  });

  it('使えるだけでは希望だけ出して、GPU で接続中とは出さない', async () => {
    const { el, root } = fakeRoot();
    const probeDevices = vi.fn().mockResolvedValue({ mode: 'unknown', gpuCapable: true });
    wireVoiceEngineMode(root, {
      isReadingOn: async () => true,
      getPref: async () => 'gpu',
      probeAlive: async () => true,
      probeDevices,
      retryMs: 0
    });
    await tick();
    await tick();
    expect(el.textContent).toBe('VOICEVOX：GPUを選択中（今のモードは不明）');
    expect(el.textContent).not.toContain('GPUで接続中');
    expect(el.textContent).not.toContain('エンジンモード');
    expect(el.style.color).toBe('#7a828e');
    expect(probeDevices).toHaveBeenCalledTimes(1);
  });

  it('希望が GPU でエンジンが CPU だけのときは、中立に違いを出す', async () => {
    const { el, root } = fakeRoot();
    wireVoiceEngineMode(root, {
      isReadingOn: async () => true,
      getPref: async () => 'gpu',
      probeAlive: async () => true,
      probeDevices: async () => ({ mode: 'cpu', gpuCapable: false }),
      retryMs: 0
    });
    await tick();
    await tick();
    expect(el.textContent).toContain('CPUで接続中（選択はGPU）');
    expect(el.textContent).toContain('エンジンモード');
    expect(el.textContent).not.toContain('速く');
    expect(el.style.color).toBe('#7a828e');
  });

  it('つながっていないときは既存の文言。つながったらモードに変わる', async () => {
    const { el, root } = fakeRoot();
    let alive = false;
    const scheduled = [];
    wireVoiceEngineMode(root, {
      isReadingOn: async () => true,
      getPref: async () => 'cpu',
      probeAlive: async () => ({ ok: alive, reason: 'refused' }),
      probeDevices: async () => ({ mode: 'cpu', gpuCapable: false }),
      retryMs: 8000,
      schedule: (fn) => { scheduled.push(fn); return scheduled.length; },
      clear: () => {}
    });
    await tick();
    await tick();
    expect(el.textContent).toBe('VOICEVOXにつながっていません');
    expect(el.style.color).toBe('#ffb4a2');
    alive = true;
    scheduled[0]();
    await tick();
    await tick();
    await tick();
    expect(el.textContent).toBe('VOICEVOX：CPUで接続中');
    expect(el.style.color).toBe('#7a828e');
  });

  it('OFF にしたら接続中の表示を消す。未保存の ON では CPU を保存しない', async () => {
    const { el, select, root } = fakeRoot();
    let onChanged = () => {};
    /** @type {(event: string, fn: () => void) => void} */
    let onSelect = () => {};
    select.addEventListener = (event, fn) => { onSelect = fn; };
    const setPref = vi.fn();
    wireVoiceEngineMode(root, {
      isReadingOn: async () => true,
      onReadingChanged: (fn) => { onChanged = fn; },
      getPref: async () => null,
      setPref,
      probeAlive: async () => true,
      probeDevices: async () => ({ mode: 'cpu', gpuCapable: false }),
      retryMs: 0
    });
    await tick();
    await tick();
    expect(el.textContent).toBe('VOICEVOX：CPUで接続中');
    expect(select.value).toBe('cpu');
    expect(setPref).not.toHaveBeenCalled();
    select.value = 'gpu';
    onSelect();
    expect(setPref).toHaveBeenCalledTimes(1);
    expect(setPref).toHaveBeenCalledWith('gpu');
    onChanged(false);
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe('');
  });
});