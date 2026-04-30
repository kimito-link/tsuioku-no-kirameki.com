import { describe, it, expect } from 'vitest';
import { buildReportCommentsCsv, csvEscapeField } from './reportCommentsCsv.js';

describe('csvEscapeField', () => {
  it('普通の文字列はそのまま', () => {
    expect(csvEscapeField('hello')).toBe('hello');
  });

  it('カンマ含むはダブルクォートで囲む', () => {
    expect(csvEscapeField('a,b')).toBe('"a,b"');
  });

  it('ダブルクォート含むは "" にエスケープしてから囲む', () => {
    expect(csvEscapeField('a"b')).toBe('"a""b"');
  });

  it('改行 (LF/CR/CRLF) を含むは囲む', () => {
    expect(csvEscapeField('a\nb')).toBe('"a\nb"');
    expect(csvEscapeField('a\r\nb')).toBe('"a\r\nb"');
    expect(csvEscapeField('a\rb')).toBe('"a\rb"');
  });

  it('null/undefined は空文字', () => {
    expect(csvEscapeField(null)).toBe('');
    expect(csvEscapeField(undefined)).toBe('');
  });

  it('数値は文字列化', () => {
    expect(csvEscapeField(42)).toBe('42');
  });

  it('CSV インジェクション対策: =+@-tab で始まる場合は単引用符でプレフィックス', () => {
    // Excel/LibreOffice で関数として実行されないように
    expect(csvEscapeField('=SUM(A1)')).toBe(`"'=SUM(A1)"`);
    expect(csvEscapeField('+CMD')).toBe(`"'+CMD"`);
    expect(csvEscapeField('-1+1')).toBe(`"'-1+1"`);
    expect(csvEscapeField('@import')).toBe(`"'@import"`);
    expect(csvEscapeField('\tTAB')).toBe(`"'\tTAB"`);
  });
});

describe('buildReportCommentsCsv', () => {
  it('空配列 → ヘッダ行のみ', () => {
    const csv = buildReportCommentsCsv([]);
    expect(csv).toBe(
      '#,commentNo,userId,nickname,text,vpos,is184,selfPosted,capturedAtIso\r\n'
    );
  });

  it('1 件 → ヘッダ + 1 行', () => {
    const csv = buildReportCommentsCsv([
      {
        commentNo: '42',
        userId: '12345',
        nickname: 'taro',
        text: 'hello',
        vpos: 100,
        capturedAt: Date.UTC(2026, 3, 30, 10, 0, 0)
      }
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('#,commentNo,userId,nickname,text,vpos,is184,selfPosted,capturedAtIso');
    // index=1, commentNo=42, userId=12345, nickname=taro, text=hello, vpos=100, is184=false, selfPosted=false, ISO
    expect(lines[1]).toBe(
      '1,42,12345,taro,hello,100,false,false,2026-04-30T10:00:00.000Z'
    );
  });

  it('184 (a:...) 検出', () => {
    const csv = buildReportCommentsCsv([
      { commentNo: '1', userId: 'a:abc', text: 'x', capturedAt: 0 }
    ]);
    expect(csv).toContain(',true,false,');
  });

  it('selfPosted=true', () => {
    const csv = buildReportCommentsCsv([
      { commentNo: '1', userId: '1', text: 'x', selfPosted: true, capturedAt: 0 }
    ]);
    expect(csv).toContain(',false,true,');
  });

  it('カンマ・引用符・改行を含む本文がエスケープされる', () => {
    const csv = buildReportCommentsCsv([
      { commentNo: '1', userId: '1', text: 'a, "b"\nc', capturedAt: 0 }
    ]);
    // text 列だけ抜粋
    expect(csv).toContain('"a, ""b""\nc"');
  });

  it('複数件の順序は引数の順序を保持', () => {
    const csv = buildReportCommentsCsv([
      { commentNo: '10', userId: '1', text: 'A', capturedAt: 0 },
      { commentNo: '20', userId: '2', text: 'B', capturedAt: 0 }
    ]);
    const lines = csv.split('\r\n').filter((l) => l);
    expect(lines.length).toBe(3); // header + 2 rows
    expect(lines[1]).toContain(',10,1,,A,');
    expect(lines[2]).toContain(',20,2,,B,');
  });

  it('capturedAt が無効値 → ISO 列は空', () => {
    const csv = buildReportCommentsCsv([
      { commentNo: '1', userId: '1', text: 'x', capturedAt: 0 },
      { commentNo: '2', userId: '1', text: 'y', capturedAt: NaN },
      { commentNo: '3', userId: '1', text: 'z' }
    ]);
    const lines = csv.split('\r\n').filter((l) => l);
    // 末尾が空文字 → trailing 区切り後に空
    expect(lines[1].endsWith(',')).toBe(true);
    expect(lines[2].endsWith(',')).toBe(true);
    expect(lines[3].endsWith(',')).toBe(true);
  });

  it('CSV インジェクション対策で text が = で始まると単引用符プレフィックス', () => {
    const csv = buildReportCommentsCsv([
      { commentNo: '1', userId: '1', text: '=cmd|"/c calc"!A1', capturedAt: 0 }
    ]);
    expect(csv).toContain(`"'=cmd|""/c calc""!A1"`);
  });

  it('vpos が無いときは空欄', () => {
    const csv = buildReportCommentsCsv([
      { commentNo: '1', userId: '1', text: 'x', capturedAt: 0 }
    ]);
    const lines = csv.split('\r\n').filter((l) => l);
    // vpos 列は 6 番目（0-index で 5）→ 空文字
    const cols = lines[1].split(',');
    expect(cols[5]).toBe('');
  });
});
