import { ParserFactory } from '../ParserFactory';
import { MarkdownParser } from '../MarkdownParser';
import { TXTParser } from '../TXTParser';
import { CSVParser } from '../CSVParser';
import { PDFParser } from '../PDFParser';
import { WordParser } from '../WordParser';
import { EmptyParseError, UnsupportedFileTypeError } from '../type';

describe('ParserFactory', () => {
  it('selects markdown strategy', async () => {
    const parser = ParserFactory.create('readme.md');
    const result = await parser.parse({
      data: Buffer.from('# 标题\n\n正文内容', 'utf8'),
      filename: 'readme.md',
    });
    expect(result.suggestedTitle).toBe('标题');
    expect(result.text).toContain('正文内容');
  });

  it('selects txt strategy', async () => {
    const parser = ParserFactory.create('note.txt');
    const result = await parser.parse({
      data: Buffer.from('hello txt', 'utf8'),
      filename: 'note.txt',
    });
    expect(result.text).toBe('hello txt');
  });

  it('selects csv strategy and formats rows', async () => {
    const parser = ParserFactory.create('data.csv');
    const result = await parser.parse({
      data: Buffer.from('name,age\nAda,30\nBob,25', 'utf8'),
      filename: 'data.csv',
    });
    expect(result.text).toContain('表头: name | age');
    expect(result.text).toContain('name: Ada');
  });

  it('throws on unsupported type', () => {
    expect(() => ParserFactory.create('photo.png')).toThrow(
      UnsupportedFileTypeError,
    );
  });

  it('throws EmptyParseError on blank txt', async () => {
    const parser = ParserFactory.create('empty.txt');
    await expect(
      parser.parse({
        data: Buffer.from('   \n  ', 'utf8'),
        filename: 'empty.txt',
      }),
    ).rejects.toBeInstanceOf(EmptyParseError);
  });
});

describe('strategy supports()', () => {
  it('matches extensions', () => {
    expect(new PDFParser().supports('a.PDF')).toBe(true);
    expect(new MarkdownParser().supports('x.markdown')).toBe(true);
    expect(new TXTParser().supports('a.txt')).toBe(true);
    expect(new CSVParser().supports('a.csv')).toBe(true);
    expect(new WordParser().supports('a.docx')).toBe(true);
    expect(new WordParser().supports('a.doc')).toBe(false);
  });
});
