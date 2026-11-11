import { beforeEach, describe, expect, it } from 'vitest';
import {
  listCoeiroStyleIds,
  parseCoeiroSpeakers,
  probeCoeiroink,
  resetCoeiroStyleCache,
  synthesizeCoeiroink
} from './coeiroinkClient.js';

const speakers = [
  {
    speakerName: 'つくよみ',
    speakerUuid: 'aaa',
    styles: [
      { styleName: 'れいせい', styleId: 0 },
      { styleName: 'ささやき', styleId: 1 }
    ]
  },
  {
    speakerName: 'まんじゅう',
    speakerUuid: 'bbb',
    styles: [{ styleName: 'あまあま', styleId: 0 }]
  }
];

describe('coeiroinkClient', () => {
  beforeEach(() => resetCoeiroStyleCache());

  it('話者ごとに振り直される styleId を、声ごとに別の印へする。ささやきは除く', () => {
    const rows = parseCoeiroSpeakers(speakers);
    expect(rows).toHaveLength(2);
    expect(rows[0].nativeStyleId).toBe(0);
    expect(rows[1].nativeStyleId).toBe(0);
    expect(rows[0].token).not.toBe(rows[1].token);
    expect(parseCoeiroSpeakers({ speakers })).toEqual([]);
  });

  it('一覧が壊れていても、前に取れた声を消さない', async () => {
    const fetchFn = async (url) => {
      if (String(url).includes('/v1/speakers')) {
        return { ok: true, json: async () => speakers };
      }
      return { ok: false, status: 404, json: async () => null };
    };
    const first = await listCoeiroStyleIds({ fetchFn });
    expect(first).toHaveLength(2);
    const second = await listCoeiroStyleIds({
      fetchFn: async () => { throw new Error('down'); }
    });
    expect(second).toEqual(first);
  });

  it('合成は uuid と本来の styleId を 24000Hz で送る', async () => {
    let body = null;
    const fetchFn = async (url, init) => {
      if (String(url).includes('/v1/speakers')) return { ok: true, json: async () => speakers };
      body = JSON.parse(init.body);
      const bytes = new Uint8Array(80);
      return { ok: true, arrayBuffer: async () => bytes.buffer };
    };
    await probeCoeiroink({ fetchFn });
    const ids = await listCoeiroStyleIds({ fetchFn });
    const wav = await synthesizeCoeiroink('やあ', { styleId: ids[1], pitchOffset: 0.03, speedOffset: 0.1 }, {
      fetchFn,
      volumePercent: 100
    });
    expect(wav).toBeInstanceOf(ArrayBuffer);
    expect(body.speakerUuid).toBe('bbb');
    expect(body.styleId).toBe(0);
    expect(body.outputSamplingRate).toBe(24000);
    expect(body.speedScale).toBeCloseTo(1.1);
  });
});
