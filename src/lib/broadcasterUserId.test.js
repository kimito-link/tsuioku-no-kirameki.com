/**
 * broadcasterUserId 抽出ロジックのテスト。
 *
 * 0.1.38 (T): 配信者 UID 取り違え事件（lv350420992 / 刑事桃 vs Nasu）の再発防止。
 *   ニコ生 watch ページには `/user/{id}/live_programs` リンクが複数含まれる
 *   ことがある（例: 過去配信者リンク + 本配信者リンク）。streamLink ピッカは
 *   先頭 hit を採るため、本配信者でない UID を取ってしまう事例があった。
 *   embedded-data の `program.supplier.programProviderId` は配信者本人を
 *   指す authoritative なソースなので、これを最優先にする。
 */

import { describe, it, expect } from 'vitest';
import { extractBroadcasterUserId } from './broadcasterUserId.js';

describe('extractBroadcasterUserId - embedded-data 最優先', () => {
  it('supplier.programProviderId が数値なら streamLink より優先する（lv350420992 case）', () => {
    // 実例: streamLink は最初に Nasu (45300945) を拾うが、
    // embedded supplier.programProviderId は本配信者 刑事桃 (115713314)
    const uid = extractBroadcasterUserId({
      embeddedSupplierProgramProviderId: '115713314',
      embeddedSupplierId: null,
      embeddedSupplierPageUrl: 'https://www.nicovideo.jp/user/115713314',
      streamLinkHref: 'https://www.nicovideo.jp/user/45300945/live_programs'
    });
    expect(uid).toBe('115713314');
  });

  it('supplier.id（programProviderId なし）も採用', () => {
    const uid = extractBroadcasterUserId({
      embeddedSupplierProgramProviderId: null,
      embeddedSupplierId: '134268998',
      embeddedSupplierPageUrl: '',
      streamLinkHref: ''
    });
    expect(uid).toBe('134268998');
  });

  it('数値文字列ではない supplier.id（チャンネル handle 等）は無視', () => {
    const uid = extractBroadcasterUserId({
      embeddedSupplierProgramProviderId: 'nicokeiba',
      embeddedSupplierId: 'ch1234',
      embeddedSupplierPageUrl: '',
      streamLinkHref: ''
    });
    expect(uid).toBe('');
  });
});

describe('extractBroadcasterUserId - フォールバック順', () => {
  it('embedded 取得失敗 → supplier.pageUrl から /user/{id}/ を取る', () => {
    const uid = extractBroadcasterUserId({
      embeddedSupplierProgramProviderId: null,
      embeddedSupplierId: null,
      embeddedSupplierPageUrl: 'https://www.nicovideo.jp/user/77777777',
      streamLinkHref: ''
    });
    expect(uid).toBe('77777777');
  });

  it('embedded 全滅 → streamLink href から /user/{id}/ を取る', () => {
    const uid = extractBroadcasterUserId({
      embeddedSupplierProgramProviderId: null,
      embeddedSupplierId: null,
      embeddedSupplierPageUrl: '',
      streamLinkHref: 'https://www.nicovideo.jp/user/45300945/live_programs'
    });
    expect(uid).toBe('45300945');
  });

  it('全部空 → 空文字列', () => {
    const uid = extractBroadcasterUserId({
      embeddedSupplierProgramProviderId: null,
      embeddedSupplierId: null,
      embeddedSupplierPageUrl: '',
      streamLinkHref: ''
    });
    expect(uid).toBe('');
  });

  it('null 入力（snapshot.embedded が null）でも throw しない', () => {
    const uid = extractBroadcasterUserId({
      embeddedSupplierProgramProviderId: null,
      embeddedSupplierId: null,
      embeddedSupplierPageUrl: null,
      streamLinkHref: null
    });
    expect(uid).toBe('');
  });

  it('undefined 入力でも throw しない', () => {
    const uid = extractBroadcasterUserId({});
    expect(uid).toBe('');
  });

  it('引数自体が undefined でも throw しない', () => {
    expect(extractBroadcasterUserId()).toBe('');
  });
});

describe('extractBroadcasterUserId - チャンネル放送', () => {
  it('supplier.pageUrl が ch.nicovideo.jp/<handle> 形式なら uid は取れない（空）', () => {
    const uid = extractBroadcasterUserId({
      embeddedSupplierProgramProviderId: null,
      embeddedSupplierId: null,
      embeddedSupplierPageUrl: 'https://ch.nicovideo.jp/nicokeiba',
      streamLinkHref: ''
    });
    expect(uid).toBe('');
  });
});

describe('extractBroadcasterUserId - エッジケース', () => {
  it('streamLinkHref が相対パスでも /user/{id}/ を抜ける', () => {
    const uid = extractBroadcasterUserId({
      embeddedSupplierProgramProviderId: null,
      embeddedSupplierId: null,
      embeddedSupplierPageUrl: '',
      streamLinkHref: '/user/12345/live_programs'
    });
    expect(uid).toBe('12345');
  });

  it('数値文字列の前後に空白があっても trim する', () => {
    const uid = extractBroadcasterUserId({
      embeddedSupplierProgramProviderId: '  115713314  ',
      embeddedSupplierId: null,
      embeddedSupplierPageUrl: '',
      streamLinkHref: ''
    });
    expect(uid).toBe('115713314');
  });

  it('embedded supplier id が number 型でも文字列化して採用', () => {
    const uid = extractBroadcasterUserId({
      embeddedSupplierProgramProviderId: 115713314,
      embeddedSupplierId: null,
      embeddedSupplierPageUrl: '',
      streamLinkHref: ''
    });
    expect(uid).toBe('115713314');
  });
});
