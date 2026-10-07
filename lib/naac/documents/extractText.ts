import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

export type ExtractionResult = {
  raw_text: string | null;
  page_count: number | null;
  status: 'extracted' | 'failed';
  error?: string;
  warnings?: unknown[];
};

/**
 * Extracts raw text from a PDF, DOCX, or Excel file buffer.
 * No OCR — assumes text-based documents only.
 */
export async function extractText(
  fileBuffer: Buffer,
  fileType: 'pdf' | 'docx' | 'xlsx' | 'xls'
): Promise<ExtractionResult> {
  if (fileType === 'pdf') {
    return extractFromPdf(fileBuffer);
  } else if (fileType === 'docx') {
    return extractFromDocx(fileBuffer);
  } else if (fileType === 'xlsx' || fileType === 'xls') {
    return extractFromExcel(fileBuffer);
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * IMPORTANT: requires pdf-parse v2+ (`npm install pdf-parse@latest`).
 * The old v1 API (`import pdfParse from 'pdf-parse'; pdfParse(buffer)`)
 * extracted text with NO space characters between table cells positioned
 * via coordinates rather than literal space glyphs — common in PDFs
 * exported from Word/HTML, where "1Tata Consultancy Services (TCS)IT
 * ServicesCampus Drive" is exactly what the content stream contains, with
 * no space codepoint between fields. No text-level heuristic can recover
 * a boundary that was never in the string.
 *
 * v2's PDFParse class fixes this two ways:
 * - getText() is coordinate-aware and inserts spaces based on visual gaps,
 *   so narrative prose extracts cleanly even where v1 glued things together.
 * - getTable() detects real tables from the PDF's own gridlines and returns
 *   actual per-cell arrays — not a text-heuristic guess. This is what we
 *   use for tables, since even correctly-spaced prose-ified table rows
 *   (e.g. "1 Tata Consultancy Services (TCS) IT Services Campus Drive")
 *   are indistinguishable from a real sentence by whitespace alone, and
 *   would misfire the heading/prose heuristics in cleanText/chunkText.
 *
 * mergePageTextWithTables then strips each table's raw jumbled text back
 * out of the page's narrative text (matched by normalized character
 * content) and replaces it with the clean ' | '-delimited rows, once,
 * in the position it first appears — so nothing is duplicated and
 * document order is preserved.
 */
async function extractFromPdf(fileBuffer: Buffer): Promise<ExtractionResult> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: fileBuffer });

    const textResult = await parser.getText();
    const tableResult = await parser.getTable();

    const pageTexts: string[] = [];
    for (let i = 0; i < textResult.pages.length; i++) {
      const pageText = textResult.pages[i]?.text ?? '';
      const tables = tableResult.pages[i]?.tables ?? [];
      pageTexts.push(mergePageTextWithTables(pageText, tables));
    }

    return {
      raw_text: pageTexts.join('\n\n'),
      page_count: textResult.total ?? textResult.pages.length ?? null,
      status: 'extracted'
    };
  } catch (err) {
    return {
      raw_text: null,
      page_count: null,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err)
    };
  } finally {
    if (parser) await parser.destroy();
  }
}

/**
 * Strips PDF-noise characters down to bare lowercase alphanumerics so a
 * table cell's text and its (possibly re-flowed / re-spaced) appearance
 * in getText()'s output can be compared on raw character content alone,
 * ignoring whitespace/line-break differences between the two extraction
 * methods.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Replaces each table's raw, jumbled appearance inside a page's narrative
 * text with its clean ' | '-delimited rows (from getTable()'s real
 * cell-boundary detection), inserted once at the position it first
 * appears. Lines recognized as belonging to a table are dropped from the
 * narrative so the table's content isn't duplicated.
 *
 * Matching is by normalized substring: a line is considered part of a
 * table if its alphanumeric content (spaces/punctuation stripped) appears
 * as a contiguous substring of that table's cells concatenated in row
 * order — both extractions read the same underlying characters, just
 * re-flowed differently, so this holds even when getText() re-wraps a
 * cell's content across a different set of line breaks than getTable()
 * did. Cells that wrap awkwardly across a table's own boundary (a header
 * word bleeding into the next row's text, for example) can occasionally
 * leave a stray raw line behind — check output on real documents and
 * flag any doc where that happens so the matching can be tightened.
 */
function mergePageTextWithTables(
  pageText: string,
  tables: string[][][]
): string {
  if (!tables || tables.length === 0) return pageText;

  const lines = pageText.split('\n');
  const outputLines: string[] = [];

  const tableBlobs = tables.map((rows) => normalize(rows.flat().join('')));
  const tableCleanTexts = tables.map((rows) =>
    rows.map((row) => row.map((cell) => cell.trim()).join(' | ')).join('\n')
  );
  const insertedTable = tables.map(() => false);

  for (const line of lines) {
    const normLine = normalize(line);

    if (normLine.length === 0) {
      outputLines.push(line);
      continue;
    }

    let matchedTableIndex = -1;
    if (normLine.length >= 3) {
      for (let t = 0; t < tableBlobs.length; t++) {
        if (tableBlobs[t].length > 0 && tableBlobs[t].includes(normLine)) {
          matchedTableIndex = t;
          break;
        }
      }
    }

    if (matchedTableIndex >= 0) {
      if (!insertedTable[matchedTableIndex]) {
        outputLines.push(tableCleanTexts[matchedTableIndex]);
        insertedTable[matchedTableIndex] = true;
      }
      continue; // drop the raw jumbled line — already represented cleanly
    }

    outputLines.push(line);
  }

  return outputLines.join('\n');
}

async function extractFromDocx(fileBuffer: Buffer): Promise<ExtractionResult> {
  try {
    const result = await mammoth.convertToHtml({ buffer: fileBuffer });
    const text = htmlToStructuredText(result.value);
    return {
      raw_text: text,
      page_count: null,
      status: 'extracted',
      warnings: result.messages
    };
  } catch (err) {
    return {
      raw_text: null,
      page_count: null,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

function htmlToStructuredText(html: string): string {
  const parts: string[] = [];
  let lastIndex = 0;
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(html)) !== null) {
    const before = html.slice(lastIndex, match.index);
    if (before.trim()) parts.push(htmlBlockToText(before));
    const tableText = tableHtmlToDelimitedText(match[0]);
    if (tableText.trim()) parts.push(tableText);
    lastIndex = tableRegex.lastIndex;
  }
  const rest = html.slice(lastIndex);
  if (rest.trim()) parts.push(htmlBlockToText(rest));

  return parts.join('\n\n');
}

function tableHtmlToDelimitedText(tableHtml: string): string {
  const rows: string[] = [];
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowMatch[0])) !== null) {
      const cellText = stripTags(cellMatch[1]).trim();
      cells.push(cellText);
    }
    if (cells.length > 0 && cells.some((c) => c.length > 0)) {
      rows.push(cells.join(' | '));
    }
  }

  return rows.join('\n');
}

function htmlBlockToText(html: string): string {
  const withBreaks = html
    .replace(/<\/(p|h[1-6]|li|div|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');

  return stripTags(withBreaks)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * Extracts structured text and tables from an Excel (.xlsx / .xls) workbook.
 */
async function extractFromExcel(fileBuffer: Buffer): Promise<ExtractionResult> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    const sheetTexts: string[] = [];
    workbook.eachSheet((worksheet) => {
      const sheetName = worksheet.name || 'Sheet';
      const rows: string[] = [];

      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const values = row.values as ExcelJS.CellValue[];
        if (!Array.isArray(values)) return;
        const cells: string[] = [];
        for (let i = 1; i < values.length; i++) {
          const v = values[i];
          cells.push(v == null ? '' : String(v).trim());
        }
        if (cells.some((c) => c.length > 0)) {
          rows.push(cells.join(' | '));
        }
      });

      if (rows.length > 0) {
        sheetTexts.push(`[Sheet: ${sheetName}]\n` + rows.join('\n'));
      }
    });

    return {
      raw_text: sheetTexts.join('\n\n'),
      page_count: sheetTexts.length,
      status: 'extracted',
    };
  } catch (err) {
    return {
      raw_text: null,
      page_count: null,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}