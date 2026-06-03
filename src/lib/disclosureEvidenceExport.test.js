import { describe, it, expect } from 'vitest';
import {
  buildDisclosureEvidenceCsvWithDigests,
  buildDisclosureEvidenceManifest,
  buildDisclosureEvidenceReadme,
  buildDisclosureEvidenceStatement,
  buildDisclosureEvidenceBundle,
  formatDisclosureTimestampJst,
  buildNiconicoWatchUrl,
  DISCLOSURE_EVIDENCE_CSV_BOM,
  DISCLOSURE_EVIDENCE_PURPOSE
} from './disclosureEvidenceExport.js';

describe('disclosureEvidenceExport', () => {
  it('JST タイムスタンプ', () => {
    const s = formatDisclosureTimestampJst(Date.UTC(2026, 5, 2, 13, 15, 3));
    expect(s).toMatch(/2026-06-02T22:15:03\+09:00/);
  });

  it('watch URL', () => {
    expect(buildNiconicoWatchUrl('lv123')).toBe('https://live.nicovideo.jp/watch/lv123');
  });

  it('CSV に BOM・rowSha256・主要列', async () => {
    const { csv } = await buildDisclosureEvidenceCsvWithDigests(
      [
        {
          id: 'x1',
          commentNo: '42',
          userId: '1001',
          nickname: 'テスト',
          text: 'うざい',
          capturedAt: Date.UTC(2026, 5, 2, 13, 0, 0),
          disclosureFlag: { ruleId: 'harsh-insult', level: 'mild', matchedText: 'うざい' }
        }
      ],
      { liveId: 'lv999' }
    );
    expect(csv.startsWith(DISCLOSURE_EVIDENCE_CSV_BOM)).toBe(true);
    expect(csv).toContain('commentNo');
    expect(csv).toContain('rowSha256');
    expect(csv).toContain('lv999');
    expect(csv).toContain('1001');
    expect(csv).toContain('うざい');
  });

  it('manifest / readme / statement が開示請求向け文言を含む', () => {
    const manifest = buildDisclosureEvidenceManifest({
      liveId: 'lv1',
      flaggedCommentCount: 2,
      fileHashes: { csv: 'abc' }
    });
    expect(manifest).toContain('evidencePurpose');
    expect(manifest).toContain('lv1');
    expect(manifest).toContain('schemaVersion');
    const readme = buildDisclosureEvidenceReadme({ liveId: 'lv1', flaggedCommentCount: 2 });
    expect(readme).toMatch(/開示請求/);
    expect(readme).toMatch(/十分使えます/);
    const statement = buildDisclosureEvidenceStatement(
      [{ commentNo: '1', userId: '9', text: 'うざい', capturedAt: 1_700_000_000_000 }],
      { liveId: 'lv1', exportedAtJst: '2026-06-02T12:00:00+09:00' }
    );
    expect(statement).toContain('特定発信者情報');
    expect(statement).toContain('コメント番号: 1');
  });

  it('DISCLOSURE_EVIDENCE_PURPOSE', () => {
    expect(DISCLOSURE_EVIDENCE_PURPOSE).toMatch(/開示請求/);
  });

  it('bundle が SHA-256 付き manifest と statement を返す', async () => {
    const bundle = await buildDisclosureEvidenceBundle(
      [{ id: 'a', commentNo: '1', text: 'うざい', userId: '9', capturedAt: 1_700_000_000_000 }],
      { liveId: 'lv55', extensionVersion: '0.1.564' }
    );
    expect(bundle.flaggedCount).toBe(1);
    expect(bundle.statementTxt).toContain('コメント番号: 1');
    expect(bundle.rowsJson).toContain('"rowSha256"');
    expect(bundle.manifestJson).toMatch(/[a-f0-9]{64}/);
    expect(bundle.readme).toContain('lv55');
    expect(bundle.fileHashes.csv).toMatch(/[a-f0-9]{64}/);
  });
});
