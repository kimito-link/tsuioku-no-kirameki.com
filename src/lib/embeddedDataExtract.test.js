/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  extractEmbeddedDataProps,
  pickViewerCountFromEmbeddedData,
  pickWsUrlFromEmbeddedData,
  pickProgramBeginAt,
  pickPlanningEventId,
  pickIsEventParticipating
} from './embeddedDataExtract.js';

const SAMPLE_PROPS = JSON.stringify({
  site: {
    relive: {
      webSocketUrl:
        'wss://a.live2.nicovideo.jp/wsapi/v2/watch/lv345581403/timeshift?audience_token=abc'
    }
  },
  program: {
    statistics: { watchCount: 5200, commentCount: 310 },
    status: 'ON_AIR'
  },
  user: { isLoggedIn: true, isBroadcaster: false }
});

describe('extractEmbeddedDataProps', () => {
  it('#embedded-data の data-props から JSON を取得', () => {
    document.body.innerHTML = `<script id="embedded-data" data-props='${SAMPLE_PROPS}'></script>`;
    const obj = extractEmbeddedDataProps(document);
    expect(obj).not.toBeNull();
    expect(obj.site.relive.webSocketUrl).toContain('wss://');
  });

  it('&quot; エスケープされた data-props を処理', () => {
    const escaped = SAMPLE_PROPS.replace(/"/g, '&quot;');
    document.body.innerHTML = `<script id="embedded-data" data-props="${escaped}"></script>`;
    const obj = extractEmbeddedDataProps(document);
    expect(obj).not.toBeNull();
    expect(obj.program.status).toBe('ON_AIR');
  });

  it('要素が無い場合は null', () => {
    document.body.innerHTML = '<div>no data</div>';
    expect(extractEmbeddedDataProps(document)).toBeNull();
  });

  it('data-props が空の場合は null', () => {
    document.body.innerHTML = '<script id="embedded-data" data-props=""></script>';
    expect(extractEmbeddedDataProps(document)).toBeNull();
  });
});

describe('pickViewerCountFromEmbeddedData', () => {
  it('program.statistics.watchCount を返す', () => {
    const props = JSON.parse(SAMPLE_PROPS);
    expect(pickViewerCountFromEmbeddedData(props)).toBe(5200);
  });

  it('watchCount がなければ null', () => {
    expect(pickViewerCountFromEmbeddedData({})).toBeNull();
    expect(pickViewerCountFromEmbeddedData({ program: {} })).toBeNull();
    expect(
      pickViewerCountFromEmbeddedData({ program: { statistics: {} } })
    ).toBeNull();
  });

  it('負値は null', () => {
    const props = { program: { statistics: { watchCount: -1 } } };
    expect(pickViewerCountFromEmbeddedData(props)).toBeNull();
  });
});

describe('pickWsUrlFromEmbeddedData', () => {
  it('site.relive.webSocketUrl を返す', () => {
    const props = JSON.parse(SAMPLE_PROPS);
    expect(pickWsUrlFromEmbeddedData(props)).toContain('wss://');
  });

  it('パスが無ければ null', () => {
    expect(pickWsUrlFromEmbeddedData({})).toBeNull();
    expect(pickWsUrlFromEmbeddedData({ site: {} })).toBeNull();
  });
});

describe('pickProgramBeginAt', () => {
  it('ISO 8601 文字列を epoch ms に変換', () => {
    const props = { program: { beginAt: '2024-08-18T12:28:17+09:00' } };
    const ms = pickProgramBeginAt(props);
    expect(ms).toBeTypeOf('number');
    expect(ms).toBeGreaterThan(0);
    expect(new Date(ms).getUTCFullYear()).toBe(2024);
  });

  it('Unix 秒 (< 1e12) を ms に変換', () => {
    const props = { program: { beginTime: 1723951697 } };
    const ms = pickProgramBeginAt(props);
    expect(ms).toBe(1723951697000);
  });

  it('epoch ms (>= 1e12) はそのまま', () => {
    const props = { program: { beginTime: 1723951697000 } };
    expect(pickProgramBeginAt(props)).toBe(1723951697000);
  });

  it('program.openTime にフォールバック', () => {
    const props = { program: { openTime: '2024-08-18T12:00:00+09:00' } };
    expect(pickProgramBeginAt(props)).toBeGreaterThan(0);
  });

  it('program.schedule.begin にフォールバック', () => {
    const props = { program: { schedule: { begin: '2024-08-18T12:00:00+09:00' } } };
    expect(pickProgramBeginAt(props)).toBeGreaterThan(0);
  });

  it('値が無ければ null', () => {
    expect(pickProgramBeginAt({})).toBeNull();
    expect(pickProgramBeginAt({ program: {} })).toBeNull();
    expect(pickProgramBeginAt(null)).toBeNull();
  });
});

describe('pickPlanningEventId', () => {
  it('planningEvent.id（正の整数）を数値文字列で返す', () => {
    expect(pickPlanningEventId({ planningEvent: { id: 472 } })).toBe('472');
    expect(pickPlanningEventId({ planningEvent: { id: '472' } })).toBe('472');
  });
  it('参加していない/不正 id は null', () => {
    expect(pickPlanningEventId({})).toBeNull();
    expect(pickPlanningEventId({ planningEvent: {} })).toBeNull();
    expect(pickPlanningEventId({ planningEvent: { id: 0 } })).toBeNull();
    expect(pickPlanningEventId({ planningEvent: { id: '0' } })).toBeNull();
    expect(pickPlanningEventId({ planningEvent: { id: 'abc' } })).toBeNull();
    expect(pickPlanningEventId(null)).toBeNull();
  });
});

describe('pickIsEventParticipating', () => {
  it('programAudition.isEnabled===true のときだけ true', () => {
    expect(pickIsEventParticipating({ programAudition: { isEnabled: true } })).toBe(true);
    expect(pickIsEventParticipating({ programAudition: { isEnabled: false } })).toBe(false);
    expect(pickIsEventParticipating({ programAudition: {} })).toBe(false);
    expect(pickIsEventParticipating({})).toBe(false);
    expect(pickIsEventParticipating(null)).toBe(false);
  });
});
