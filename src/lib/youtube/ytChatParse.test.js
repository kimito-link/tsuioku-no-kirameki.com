// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  parseYtChatElement,
  parsePurchaseAmount,
  extractChannelIdFromContextMenuParams,
  extractYtWatchConcurrentViewersFromText
} from './ytChatParse.js';

/**
 * 実ページ (YouTube Live popout chat) から採取し、個人情報を伏せた renderer HTML 断片。
 * params 内の base64 は以下の2段構造 (実機確認済み):
 *   outer base64 -> URL-encoded inner base64 -> protobuf bytes (配信者UC... + 動画ID + 投稿者UC...)
 */
function makeContextMenuParams(broadcasterChannelId, videoId, authorChannelId) {
  const innerRaw = `\x0a\x18${broadcasterChannelId}\x12\x0b${videoId} (\x042\x1a\x0a\x18${authorChannelId}`;
  const innerB64 = encodeURIComponent(Buffer.from(innerRaw, 'utf8').toString('base64'));
  return Buffer.from(innerB64, 'utf8').toString('base64');
}

const SAMPLE_AUTHOR_UC = 'UC1111111111111111111111';
const SAMPLE_BROADCASTER_UC = 'UC9999999999999999999999';
const SAMPLE_PARAMS = makeContextMenuParams(SAMPLE_BROADCASTER_UC, 'sDvfg_jDIqE', SAMPLE_AUTHOR_UC);

const FIXTURE_TEXT_MESSAGE = `
<yt-live-chat-text-message-renderer class="style-scope yt-live-chat-item-list-renderer" modern="" id="ChwKGkNPYjVrOTNXNnBjREZUM2c1d01kc0o0R0hn" whole-message-clickable="{&quot;liveChatItemContextMenuEndpoint&quot;:{&quot;params&quot;:&quot;${SAMPLE_PARAMS}&quot;}}" author-type="">
  <yt-img-shadow id="author-photo" class="no-transition style-scope yt-live-chat-text-message-renderer" height="24" width="24" loaded="">
    <img id="img" draggable="false" class="style-scope yt-img-shadow" alt="" height="24" width="24" src="https://yt4.ggpht.com/sample-user-icon-1=s32-c-k-c0x00ffffff-no-rj">
  </yt-img-shadow>
  <div id="content" class="style-scope yt-live-chat-text-message-renderer">
    <span id="timestamp" class="style-scope yt-live-chat-text-message-renderer">10:45 AM</span>
    <yt-live-chat-author-chip class="style-scope yt-live-chat-text-message-renderer">
      <span id="prepend-chat-badges" class="style-scope yt-live-chat-author-chip"></span>
      <span id="author-name" dir="auto" class="style-scope yt-live-chat-author-chip">@sample_listener<span id="chip-badges" class="style-scope yt-live-chat-author-chip"></span></span>
      <span id="chat-badges" class="style-scope yt-live-chat-author-chip"></span>
    </yt-live-chat-author-chip>
    <span id="message-container" class="style-scope yt-live-chat-text-message-renderer">
      <span id="message" dir="auto" class="style-scope yt-live-chat-text-message-renderer">おはようございます!<img class="small-emoji emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer" src="https://fonts.gstatic.com/s/e/notoemoji/15.1/1f64f/72.png" alt="🙏" shared-tooltip-text=":folded_hands:" id="emoji-7"></span>
    </span>
  </div>
</yt-live-chat-text-message-renderer>
`;

const FIXTURE_MEMBER_TEXT_MESSAGE = `
<yt-live-chat-text-message-renderer class="style-scope yt-live-chat-item-list-renderer" modern="" id="ChwKGkNNcU1xZWJXNnBjREZmZms1d01kMWJnbDJR" whole-message-clickable="{&quot;liveChatItemContextMenuEndpoint&quot;:{&quot;params&quot;:&quot;${SAMPLE_PARAMS}&quot;}}" author-type="member">
  <yt-img-shadow id="author-photo" class="no-transition style-scope yt-live-chat-text-message-renderer" height="24" width="24" loaded="">
    <img id="img" draggable="false" class="style-scope yt-img-shadow" alt="" height="24" width="24" src="https://yt4.ggpht.com/sample-member-icon=s32-c-k-c0x00ffffff-no-rj">
  </yt-img-shadow>
  <div id="content" class="style-scope yt-live-chat-text-message-renderer">
    <span id="timestamp" class="style-scope yt-live-chat-text-message-renderer">10:46 AM</span>
    <yt-live-chat-author-chip class="style-scope yt-live-chat-text-message-renderer">
      <span id="author-name" dir="auto" class="member style-scope yt-live-chat-author-chip">@member_user<span id="chip-badges" class="style-scope yt-live-chat-author-chip"></span></span>
      <span id="chat-badges" class="style-scope yt-live-chat-author-chip">
        <yt-live-chat-author-badge-renderer class="style-scope yt-live-chat-author-chip" aria-label="メンバー（6 か月）" type="member" shared-tooltip-text="メンバー（6 か月）">
          <div id="image" class="style-scope yt-live-chat-author-badge-renderer"><img src="https://yt3.ggpht.com/sample-badge=s16-c-k" alt="メンバー（6 か月）"></div>
        </yt-live-chat-author-badge-renderer>
      </span>
    </yt-live-chat-author-chip>
    <span id="message-container" class="style-scope yt-live-chat-text-message-renderer">
      <span id="message" dir="auto" class="style-scope yt-live-chat-text-message-renderer">いつも応援してます</span>
    </span>
  </div>
</yt-live-chat-text-message-renderer>
`;

const FIXTURE_PAID_MESSAGE = `
<yt-live-chat-paid-message-renderer class="style-scope yt-live-chat-item-list-renderer" modern="" id="ChwKGkNNYVEwTVRhNnBjREZUOGRyUVlkYkY0QUdn" whole-message-clickable="{&quot;liveChatItemContextMenuEndpoint&quot;:{&quot;params&quot;:&quot;${SAMPLE_PARAMS}&quot;}}">
  <div id="card" class="style-scope yt-live-chat-paid-message-renderer">
    <div id="header" class="style-scope yt-live-chat-paid-message-renderer">
      <yt-img-shadow id="author-photo" class="style-scope yt-live-chat-paid-message-renderer no-transition" loaded="">
        <img id="img" draggable="false" class="style-scope yt-img-shadow" alt="" width="32" height="32" src="https://yt4.ggpht.com/sample-superchat-icon=s32-c-k-c0x00ffffff-no-rj">
      </yt-img-shadow>
      <div id="header-content" class="style-scope yt-live-chat-paid-message-renderer">
        <div id="header-content-primary-column" class="style-scope yt-live-chat-paid-message-renderer">
          <div id="single-line" class="style-scope yt-live-chat-paid-message-renderer">
            <div id="author-name-chip" class="style-scope yt-live-chat-paid-message-renderer">
              <yt-live-chat-author-chip class="style-scope yt-live-chat-paid-message-renderer">
                <span id="author-name" dir="auto" class="single-line style-scope yt-live-chat-author-chip">@supporter_one<span id="chip-badges" class="style-scope yt-live-chat-author-chip"></span></span>
                <span id="chat-badges" class="style-scope yt-live-chat-author-chip"></span>
              </yt-live-chat-author-chip>
            </div>
            <div id="purchase-amount-column" class="style-scope yt-live-chat-paid-message-renderer">
              <div id="purchase-amount" class="style-scope yt-live-chat-paid-message-renderer">
                <yt-formatted-string class="style-scope yt-live-chat-paid-message-renderer">￥1,500</yt-formatted-string>
              </div>
            </div>
          </div>
        </div>
        <span id="timestamp" class="style-scope yt-live-chat-paid-message-renderer">11:02 AM</span>
      </div>
    </div>
    <div id="content" class="style-scope yt-live-chat-paid-message-renderer">
      <div id="message" dir="auto" class="style-scope yt-live-chat-paid-message-renderer">スパチャ応援です！</div>
    </div>
  </div>
</yt-live-chat-paid-message-renderer>
`;

const FIXTURE_PAID_STICKER = `
<yt-live-chat-paid-sticker-renderer class="style-scope yt-live-chat-item-list-renderer" id="ChwKGkNStickerSampleId1234567890" author-type="member" data-author-external-channel-id="UC2222222222222222222222">
  <div id="card">
    <yt-img-shadow id="author-photo"><img id="img" src="https://yt4.ggpht.com/sample-sticker-user=s32"></yt-img-shadow>
    <div id="author-info">
      <yt-live-chat-author-chip>
        <span id="author-name">@sticker_fan</span>
      </yt-live-chat-author-chip>
      <span id="timestamp">11:05 AM</span>
      <div id="purchase-amount-chip">$5.00</div>
    </div>
    <div id="sticker"><img id="img" alt="拍手ステッカー"></div>
  </div>
</yt-live-chat-paid-sticker-renderer>
`;

const FIXTURE_MEMBERSHIP_ITEM = `
<yt-live-chat-membership-item-renderer class="style-scope yt-live-chat-item-list-renderer" id="ChwKGkNMembershipSampleId12345" data-author-external-channel-id="UC3333333333333333333333" author-type="member">
  <div id="card">
    <div id="header">
      <yt-img-shadow id="author-photo"><img id="img" src="https://yt4.ggpht.com/sample-new-member=s32"></yt-img-shadow>
      <div id="header-content">
        <div id="header-content-primary-column">
          <div id="header-content-inner-column">
            <yt-live-chat-author-chip>
              <span id="author-name" class="member">@new_member_user</span>
            </yt-live-chat-author-chip>
          </div>
          <div id="header-subtext">メンバーへようこそ！</div>
        </div>
        <span id="timestamp">11:10 AM</span>
      </div>
    </div>
    <div id="content">
      <div id="message">メンバー入りました！よろしくです</div>
    </div>
  </div>
</yt-live-chat-membership-item-renderer>
`;

const FIXTURE_MEMBERSHIP_GIFT = `
<ytd-sponsorships-live-chat-gift-purchase-announcement-renderer class="style-scope yt-live-chat-item-list-renderer" id="ChwKGkNGiftPurchaseSampleId12345" data-author-external-channel-id="UC4444444444444444444444">
  <ytd-sponsorships-live-chat-header-renderer id="header">
    <yt-img-shadow id="author-photo"><img id="img" src="https://yt4.ggpht.com/sample-gifter=s32"></yt-img-shadow>
    <div id="content">
      <yt-live-chat-author-chip>
        <span id="author-name" class="member">@gift_sponsor</span>
        <span id="chat-badges">
          <yt-live-chat-author-badge-renderer type="member" aria-label="メンバー"></yt-live-chat-author-badge-renderer>
        </span>
      </yt-live-chat-author-chip>
      <yt-formatted-string id="primary-text">5 件の「りんくちゃんねる」のメンバーシップ ギフトを贈りました</yt-formatted-string>
    </div>
  </ytd-sponsorships-live-chat-header-renderer>
</ytd-sponsorships-live-chat-gift-purchase-announcement-renderer>
`;

const FIXTURE_ENGAGEMENT_IGNORE = `
<yt-live-chat-viewer-engagement-message-renderer id="CjEKL0NPTU1VTklUWV9HVUlERUxJTkVTX1ZFTQ">
  <div id="content">
    <yt-formatted-string id="message">チャットへようこそ！</yt-formatted-string>
  </div>
</yt-live-chat-viewer-engagement-message-renderer>
`;

function htmlToElement(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

describe('ytChatParse', () => {
  it('extracts author channelId from whole-message-clickable context menu params', () => {
    expect(extractChannelIdFromContextMenuParams(SAMPLE_PARAMS)).toBe(SAMPLE_AUTHOR_UC);
    expect(extractChannelIdFromContextMenuParams('')).toBe('');
    expect(extractChannelIdFromContextMenuParams('invalid-base64')).toBe('');
  });

  it('parses standard text message renderer with emoji alt text', () => {
    const el = htmlToElement(FIXTURE_TEXT_MESSAGE);
    const parsed = parseYtChatElement(el);
    expect(parsed).toEqual({
      id: 'ChwKGkNPYjVrOTNXNnBjREZUM2c1d01kc0o0R0hn',
      channelId: SAMPLE_AUTHOR_UC,
      name: '@sample_listener',
      iconUrl: 'https://yt4.ggpht.com/sample-user-icon-1=s32-c-k-c0x00ffffff-no-rj',
      text: 'おはようございます!🙏',
      kind: 'text',
      amount: 0,
      currency: '',
      badges: [],
      ts: '10:45 AM'
    });
  });

  it('parses member text message renderer and extracts member badge', () => {
    const el = htmlToElement(FIXTURE_MEMBER_TEXT_MESSAGE);
    const parsed = parseYtChatElement(el);
    expect(parsed).not.toBeNull();
    expect(parsed.kind).toBe('text');
    expect(parsed.name).toBe('@member_user');
    expect(parsed.badges).toContain('member');
    expect(parsed.text).toBe('いつも応援してます');
  });

  it('parses paid message (Super Chat) with JPY amount and currency', () => {
    const el = htmlToElement(FIXTURE_PAID_MESSAGE);
    const parsed = parseYtChatElement(el);
    expect(parsed).toEqual({
      id: 'ChwKGkNNYVEwTVRhNnBjREZUOGRyUVlkYkY0QUdn',
      channelId: SAMPLE_AUTHOR_UC,
      name: '@supporter_one',
      iconUrl: 'https://yt4.ggpht.com/sample-superchat-icon=s32-c-k-c0x00ffffff-no-rj',
      text: 'スパチャ応援です！',
      kind: 'superchat',
      amount: 1500,
      currency: 'JPY',
      badges: [],
      ts: '11:02 AM'
    });
  });

  it('parses paid sticker with USD amount and sticker alt text', () => {
    const el = htmlToElement(FIXTURE_PAID_STICKER);
    const parsed = parseYtChatElement(el);
    expect(parsed).toEqual({
      id: 'ChwKGkNStickerSampleId1234567890',
      channelId: 'UC2222222222222222222222',
      name: '@sticker_fan',
      iconUrl: 'https://yt4.ggpht.com/sample-sticker-user=s32',
      text: '拍手ステッカー',
      kind: 'sticker',
      amount: 5,
      currency: 'USD',
      badges: ['member'],
      ts: '11:05 AM'
    });
  });

  it('parses membership item renderer', () => {
    const el = htmlToElement(FIXTURE_MEMBERSHIP_ITEM);
    const parsed = parseYtChatElement(el);
    expect(parsed).not.toBeNull();
    expect(parsed.kind).toBe('membership');
    expect(parsed.channelId).toBe('UC3333333333333333333333');
    expect(parsed.name).toBe('@new_member_user');
    expect(parsed.text).toBe('メンバー入りました！よろしくです');
    expect(parsed.badges).toContain('member');
  });

  it('parses membership gift purchase announcement renderer', () => {
    const el = htmlToElement(FIXTURE_MEMBERSHIP_GIFT);
    const parsed = parseYtChatElement(el);
    expect(parsed).not.toBeNull();
    expect(parsed.kind).toBe('membership_gift');
    expect(parsed.channelId).toBe('UC4444444444444444444444');
    expect(parsed.name).toBe('@gift_sponsor');
    expect(parsed.text).toContain('5 件の');
    expect(parsed.badges).toContain('member');
  });

  it('returns null for engagement / system messages or invalid elements without throwing', () => {
    const engagementEl = htmlToElement(FIXTURE_ENGAGEMENT_IGNORE);
    expect(parseYtChatElement(engagementEl)).toBeNull();
    expect(parseYtChatElement(null)).toBeNull();
    expect(parseYtChatElement(undefined)).toBeNull();
    expect(parseYtChatElement({})).toBeNull();
    const missingIdEl = htmlToElement('<yt-live-chat-text-message-renderer><span id="message">hi</span></yt-live-chat-text-message-renderer>');
    expect(parseYtChatElement(missingIdEl)).toBeNull();
  });

  it('parses various currency formats accurately without converting', () => {
    expect(parsePurchaseAmount('￥500')).toEqual({ amount: 500, currency: 'JPY' });
    expect(parsePurchaseAmount('¥10,000')).toEqual({ amount: 10000, currency: 'JPY' });
    expect(parsePurchaseAmount('$5.00')).toEqual({ amount: 5, currency: 'USD' });
    expect(parsePurchaseAmount('US$19.99')).toEqual({ amount: 19.99, currency: 'USD' });
    expect(parsePurchaseAmount('NT$150.00')).toEqual({ amount: 150, currency: 'TWD' });
    expect(parsePurchaseAmount('HK$50.00')).toEqual({ amount: 50, currency: 'HKD' });
    expect(parsePurchaseAmount('€10.50')).toEqual({ amount: 10.5, currency: 'EUR' });
    expect(parsePurchaseAmount('£20.00')).toEqual({ amount: 20, currency: 'GBP' });
    expect(parsePurchaseAmount('₩5,000')).toEqual({ amount: 5000, currency: 'KRW' });
    expect(parsePurchaseAmount('')).toEqual({ amount: 0, currency: '' });
  });

  it('parses yt-gift-message-view-model and extracts author avatar instead of gift box illustration', () => {
    const giftVmEl = htmlToElement(`
      <yt-gift-message-view-model id="ChwKGkNGiftViewModelSample999">
        <div class="yt-spec-avatar-shape" id="author-photo">
          <img class="yt-core-image" src="//yt4.ggpht.com/gift-vm-author-avatar=s64-c-k-c0x00ffffff-no-rj" alt="">
        </div>
        <div id="content">
          <span id="author-name-v2">@gift_vm_sender</span>
          <span id="message-v2">10 件の「りんくちゃんねる」のメンバーシップ ギフトを贈りました</span>
          <img src="https://www.gstatic.com/youtube/img/pdg/gift/gift_box_v2.png" alt="">
        </div>
      </yt-gift-message-view-model>
    `);
    const parsed = parseYtChatElement(giftVmEl);
    expect(parsed).not.toBeNull();
    expect(parsed.kind).toBe('membership_gift');
    expect(parsed.name).toBe('@gift_vm_sender');
    expect(parsed.iconUrl).toBe('https://yt4.ggpht.com/gift-vm-author-avatar=s64-c-k-c0x00ffffff-no-rj');
  });

  it('tells a YouTube jewel gift apart from a membership gift', () => {
    const el = htmlToElement(`
      <yt-gift-message-view-model id="ChwKGkNGiftJewel1">
        <div id="author-photo"><img src="https://yt4.ggpht.com/sender=s64" alt=""></div>
        <div id="content">
          <span id="author-name-v2">@冬川雪音サブ垢</span>
          <span id="message-v2">ハイ を送信しました</span>
          <img src="https://www.gstatic.com/youtube/img/pdg/gift/assets/yes_jp.png" alt="">
        </div>
      </yt-gift-message-view-model>
    `);
    const parsed = parseYtChatElement(el);
    expect(parsed.kind).toBe('yt_gift');
    expect(parsed.giftName).toBe('ハイ');
    expect(parsed.giftImageUrl).toBe('https://www.gstatic.com/youtube/img/pdg/gift/assets/yes_jp.png');
  });

  it('extracts concurrent viewer count from watch page strings', () => {
    expect(extractYtWatchConcurrentViewersFromText('1,234 人が視聴中')).toBe(1234);
    // 数字の連なり・あり得ない桁は読まない(2026-11-03 実機)
    expect(extractYtWatchConcurrentViewersFromText('12345678901234567890 人が視聴中')).toBe(null);
    expect(extractYtWatchConcurrentViewersFromText('12,345,678,901,234 人が視聴中')).toBe(null);
    expect(extractYtWatchConcurrentViewersFromText('SEKAI NO OWARI「ラフレシア」22,932 人が視聴中 ライブ配信開始')).toBe(22932);
    expect(extractYtWatchConcurrentViewersFromText('現在 5.2万 人が視聴中')).toBe(52000);
    expect(extractYtWatchConcurrentViewersFromText('48人が視聴中')).toBe(48);
    expect(extractYtWatchConcurrentViewersFromText('3,456 watching now')).toBe(3456);
    expect(extractYtWatchConcurrentViewersFromText('12.5K watching now')).toBe(12500);
    expect(extractYtWatchConcurrentViewersFromText('1,234 回視聴')).toBeNull();
    expect(extractYtWatchConcurrentViewersFromText('')).toBeNull();
  });
});
