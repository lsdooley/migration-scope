import { describe, expect, it } from 'vitest';
import { generateSampleCsv, parseCsv, sanitizeCsvCell } from './csvParser';
import { generateSampleMarkdown, parseMarkdown } from './markdownParser';

describe('CSV parser', () => {
  it('13. accepts quoted JSON arrays in cells', async () => {
    const csv = [
      'application_id,application_name,languages,integration_types',
      '"SYN-TEST-A","Quoted Array App","[""Java"",""Go""]","[""API"",""Batch""]"',
    ].join('\n');
    const result = await parseCsv(csv, 'quoted.csv');
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].languages).toEqual(['Java', 'Go']);
    expect(result.accepted[0].integrationTypes).toEqual(['API', 'Batch']);
  });

  it('parses its own generated sample file without rejection', async () => {
    const result = await parseCsv(generateSampleCsv(), 'sample.csv');
    expect(result.rejectedRowCount).toBe(0);
    expect(result.acceptedRowCount).toBe(1);
  });

  it('rejects duplicate application IDs', async () => {
    const csv = [
      'application_id,application_name',
      'DUP-1,First',
      'DUP-1,Second',
    ].join('\n');
    const result = await parseCsv(csv, 'dup.csv');
    expect(result.duplicateIds).toContain('DUP-1');
    expect(result.acceptedRowCount).toBe(1);
  });

  it('20. protects exported cells from spreadsheet-formula injection', () => {
    expect(sanitizeCsvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(sanitizeCsvCell('+1234')).toBe("'+1234");
    expect(sanitizeCsvCell('-1234')).toBe("'-1234");
    expect(sanitizeCsvCell('@mention')).toBe("'@mention");
    expect(sanitizeCsvCell('Normal value')).toBe('Normal value');
  });
});

describe('Markdown parser', () => {
  it('14. accepts YAML front matter and fixed-column tables', async () => {
    const result = await parseMarkdown(generateSampleMarkdown(), 'sample.md');
    expect(result.accepted).toHaveLength(1);
    const app = result.accepted[0];
    expect(app.applicationId).toBe('SAMPLE-APP-002');
    expect(app.dependencies).toHaveLength(2);
    expect(app.integrations).toHaveLength(2);
    expect(app.technologyComponents).toHaveLength(1);
  });

  it('rejects a file with no front matter', async () => {
    const result = await parseMarkdown('# no front matter here', 'bad.md');
    expect(result.accepted).toHaveLength(0);
    expect(result.rejectedRowCount).toBe(1);
  });
});
