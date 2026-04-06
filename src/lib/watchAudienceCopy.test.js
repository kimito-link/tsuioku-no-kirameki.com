import { describe, it, expect } from 'vitest';
import { buildWatchAudienceNote } from './watchAudienceCopy.js';

describe('buildWatchAudienceNote', () => {
  it('本文に [DEBUG] / FIBER / POLL / FETCH 等を含まない（_debug 付きでも）', () => {
    const { body, title } = buildWatchAudienceNote({
      snapshot: {
        _debug: {
          wsViewerCount: 570,
          wsCommentCount: 111,
          wsAge: 7370,
          intercept: 111,
          embeddedVC: 551,
          poll: { ran: 3, ok: 3, status: 200, htmlLen: 48789, wcMatch: '"watchCount":565', err: '-' },
          pi: '1',
          piEnq: '111',
          dom: { tblRow: 12 },
          tblRows: [{ tag: 'DIV', cls: 'table-row', ch: 1, role: 'row', style: '', txt: 'test' }],
          fetchLog: '/api/view/v4/...',
          ndgr: 's=69 c=111 d=413'
        }
      }
    });
    const combined = `${body}\n${title}`;
    expect(combined).not.toMatch(/\[DEBUG\]/i);
    expect(combined).not.toMatch(/FIBER/i);
    expect(combined).not.toMatch(/\[POLL\]/);
    expect(combined).not.toMatch(/\[FETCH/);
    expect(combined).not.toMatch(/\[NDGR\]/);
    expect(combined).not.toMatch(/wsVC=/);
    expect(combined).not.toMatch(/intcpt=/);
  });

  it('本文は短め（目安 220 文字以内）', () => {
    const { body } = buildWatchAudienceNote({ snapshot: {} });
    expect(body.length).toBeLessThanOrEqual(220);
  });

  it('来場者数と NicoDB・ガイド定義の区別を含む', () => {
    const { body } = buildWatchAudienceNote({ snapshot: {} });
    expect(body).toContain('https://nicodb.net/');
    expect(body).toMatch(/来場者数|累計視聴/);
    expect(body).toMatch(/別定義|応援コメント/);
  });

  it('空スナップショットでも落ちず、説明文を返す', () => {
    const { body, title } = buildWatchAudienceNote({ snapshot: null });
    expect(body.length).toBeGreaterThan(10);
    expect(title.length).toBeGreaterThan(10);
  });
});
