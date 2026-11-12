import { describe, it, expect } from 'vitest';
import { kickChatHistoryUrl, parseKickChatHistory } from './kickApi.js';
import { parseKickEvent } from './kickChatParse.js';

// 2026-11-12 PC 実測の形(web.kick.com/api/v1/chat/<channel.id>/history・新しい順・metadata は JSON 文字列)
const sample = {
  data: {
    messages: [
      {
        id: '8b0c-new', content: 'こんばんは', type: 'message', created_at: '2026-11-12T08:00:05Z', metadata: '{"message_ref":"x"}',
        sender: { id: 22, slug: 'fan-b', username: 'Fan_B', identity: { color: '#00AAFF', badges: [] } },
      },
      {
        id: '8b0c-old', content: 'わこつ', type: 'message', created_at: '2026-11-12T08:00:01Z', metadata: '{}',
        sender: { id: 11, slug: 'fan_a', username: 'fan_a', identity: { color: '#FF00AA', badges: [{ type: 'subscriber' }] } },
      },
      { id: '', content: '壊れた行', sender: { id: 1 } },
      'こわれた',
      {
        id: '8b0c-cel', content: '', type: 'celebration', created_at: '2026-11-12T08:00:03Z',
        metadata: '{"celebration":{"type":"subscription_renewed","total_months":5}}',
        sender: { id: 33, slug: 'fan-c', username: 'Fan_C', identity: {} },
      },
    ],
    cursor: '123',
  },
};

describe('Kick の過去ログ', () => {
  it('URL はチャンネルの数字 id だけ', () => {
    expect(kickChatHistoryUrl('97542698')).toBe('https://web.kick.com/api/v1/chat/97542698/history');
    expect(kickChatHistoryUrl('abc')).toBe('');
    expect(kickChatHistoryUrl('')).toBe('');
  });

  it('古い順に並べ、壊れた行だけ捨てる', () => {
    const frames = parseKickChatHistory(sample);
    expect(frames.map((f) => f.data.id)).toEqual(['8b0c-old', '8b0c-cel', '8b0c-new']);
    expect(frames.every((f) => f.event === 'ChatMessageEvent')).toBe(true);
  });

  it('リアルタイムと同じ読み方で記録の1件になる(id もリアルタイムと同じ kk-<id>)', () => {
    const rows = parseKickChatHistory(sample).map((f) => parseKickEvent(f, { chatroomId: '777' }));
    expect(rows[0]).toMatchObject({ id: 'kk-8b0c-old', channelId: 'kk:11', login: 'fan_a', text: 'わこつ', kind: 'text', badges: ['subscriber'] });
    expect(rows[1]).toMatchObject({ id: 'kk-8b0c-cel', kind: 'membership', subMonths: 5 });
    expect(rows[2]).toMatchObject({ id: 'kk-8b0c-new', postedAtMs: Date.parse('2026-11-12T08:00:05Z'), color: '#00AAFF' });
  });

  it('形が違えば空', () => {
    expect(parseKickChatHistory(null)).toEqual([]);
    expect(parseKickChatHistory({ data: { messages: 'x' } })).toEqual([]);
    expect(parseKickChatHistory({ error: 'x' })).toEqual([]);
  });
});
