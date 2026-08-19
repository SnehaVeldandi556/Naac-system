// lib/naac/documents/cleanText.ts

/**
 * Cleans raw extracted text before chunking.
 * Operates on the FULL document text at once (batch, not line-by-line)
 * so repeated-pattern detection (headers/footers) actually works.
 */
export function cleanText(rawText: string): string {
  if (!rawText || rawText.trim().length === 0) {
    return '';
  }

  let text = rawText;

  text = removeRepeatedLines(text);   // headers/footers repeating across pages
  text = fixLineWraps(text);           // rejoin hyphenated/broken words
  text = removePageNumbers(text);      // standalone page-number lines
  text = markTableRows(text);          // MUST run before normalizeWhitespace —
                                        // marks column-aligned rows with ' | '
                                        // before their multi-space gaps get collapsed
  text = normalizeWhitespace(text);    // collapse excess blank lines/spaces

  return text.trim();
}

/**
 * Detects lines that repeat identically many times across the document
 * (classic header/footer pattern — same text on every page) and removes them.
 */
function removeRepeatedLines(text: string): string {
  const lines = text.split('\n');
  const lineCounts = new Map<string, number>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > 100) continue; // headers/footers are rarely full paragraphs
    lineCounts.set(trimmed, (lineCounts.get(trimmed) ?? 0) + 1);
  }

  const repeatedLines = new Set(
    [...lineCounts.entries()]
      .filter(([, count]) => count >= 3)
      .map(([line]) => line)
  );

  return lines
    .filter((line) => !repeatedLines.has(line.trim()))
    .join('\n');
}

/**
 * Rejoins words broken across lines by hyphenation, e.g.:
 * "accredita-\ntion" -> "accreditation"
 */
function fixLineWraps(text: string): string {
  return text.replace(/(\w+)-\n(\w+)/g, '$1$2');
}

/**
 * Removes lines that are ONLY a page number (e.g. "12", "- 12 -", "Page 12")
 */
function removePageNumbers(text: string): string {
  const lines = text.split('\n');
  const pageNumberPattern = /^(page\s*)?[-–]?\s*\d{1,4}\s*[-–]?$/i;

  return lines
    .filter((line) => !pageNumberPattern.test(line.trim()))
    .join('\n');
}

/**
 * pdf-parse rarely preserves real multi-space column gaps — for this doc's
 * PDF it collapsed tables to one "Label<space>Number" pair per line (e.g.
 * "Textbooks 48,650"), no delimiter left at all. So detection needs two
 * patterns: (A) genuine multi-space/tab gaps, for PDFs that do preserve
 * them, and (B) a short label immediately followed by one or more trailing
 * numbers, for PDFs that don't (including multi-column rows that lost all
 * their gaps, e.g. "Books 100 120 150").
 *
 * Pattern B alone is too loose in isolation — front-matter lines like
 * "Document Date: 15 April 2025" also end in a number and would false-
 * positive. The guard is REQUIRING A STREAK: only lines that are part of
 * 3+ consecutive matching lines get rewritten with a ' | ' delimiter. An
 * isolated one-off match (like the date line) never gets touched, so its
 * original text is never corrupted with a stray pipe.
 *
 * Once a real streak is found, the line immediately above it is checked
 * as a possible header row (see tryMarkHeaderRow) and pulled into the
 * marked block too — otherwise a header like "Item  Amount" (which never
 * matches Pattern A/B on its own, since it has no trailing number) would
 * be left behind as an orphaned prose line right before the table, and
 * the table's numbers would lose their column meaning downstream.
 *
 * chunkText.ts then just checks for ' | ' — by the time it runs, that
 * marker is the only place table structure survives, since
 * normalizeWhitespace() below would otherwise erase any real column gaps.
 */
const MIN_TABLE_ROW_STREAK = 3;

function markTableRows(text: string): string {
  const lines = text.split('\n');
  const isCandidate = lines.map(isTableRowCandidate);
  const output = [...lines];

  let i = 0;
  while (i < lines.length) {
    if (!isCandidate[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && isCandidate[j]) j++;

    if (j - i >= MIN_TABLE_ROW_STREAK) {
      for (let k = i; k < j; k++) {
        output[k] = markLine(lines[k]);
      }
      // Pull in a header row immediately above the streak. Header rows
      // ("Item  Amount") rarely end in a number, so they never satisfy
      // isTableRowCandidate on their own and would otherwise be left
      // behind as an orphaned prose line right before the table.
      const headerIdx = i - 1;
      if (headerIdx >= 0 && !isCandidate[headerIdx] && output[headerIdx] === lines[headerIdx]) {
        const marked = tryMarkHeaderRow(lines[headerIdx]);
        if (marked) output[headerIdx] = marked;
      }
    }
    i = j;
  }

  return output.join('\n');
}

/**
 * Best-effort header detection for the line directly above a confirmed
 * table streak. Sitting immediately above 3+ real data rows is itself
 * strong evidence it's a header — only fires on short, non-sentence lines
 * so it doesn't misfire on ordinary prose.
 */
function tryMarkHeaderRow(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return null;
  if (/[.!?:]$/.test(trimmed)) return null;

  const multiSpaceCells = trimmed.split(/ {2,}|\t+/).filter((c) => c.trim().length > 0);
  if (multiSpaceCells.length >= 2) {
    return multiSpaceCells.join(' | ');
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 6) {
    return words.join(' | ');
  }

  return null;
}

function isTableRowCandidate(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;

  // Pattern C: already ' | '-delimited, e.g. from extractText.ts's docx
  // table extraction, which preserves real table rows this way. No length
  // cap here — a real table row, unlike a guessed one, is trustworthy as-is.
  const delimitedCells = trimmed.split(' | ').filter((c) => c.trim().length > 0);
  if (delimitedCells.length >= 2 && trimmed.includes(' | ')) return true;

  if (trimmed.length > 60) return false;

  // Pattern A: genuine multi-space/tab column gaps
  const multiSpaceCells = trimmed.split(/ {2,}|\t+/).filter((c) => c.trim().length > 0);
  if (multiSpaceCells.length >= 2) {
    const avgCellLen = trimmed.length / multiSpaceCells.length;
    if (avgCellLen <= 40) return true;
  }

  // Pattern B: "Label <num> [num num ...]" — one or more trailing numbers.
  // Handles both "Textbooks 48,650" and "Books 100 120 150" (multi-column
  // rows that lost their gaps entirely). Label must start with a letter and
  // not end in sentence punctuation (excludes prose that happens to end in
  // a number, like "...during 2024–2025.").
  const match = trimmed.match(/^(.+?)\s+((?:[\d,]+(?:\.\d+)?)(?:\s+[\d,]+(?:\.\d+)?)*)$/);
  if (match) {
    const label = match[1].trim();
    if (/^[A-Za-z]/.test(label) && !/[.!?:]$/.test(label) && label.length <= 50) {
      return true;
    }
  }

  return false;
}

function markLine(line: string): string {
  const trimmed = line.trim();

  // Pattern C: already delimited — just normalize spacing around pipes.
  if (trimmed.includes(' | ')) {
    const cells = trimmed.split(' | ').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length >= 2) return cells.join(' | ');
  }

  const multiSpaceCells = trimmed.split(/ {2,}|\t+/).filter((c) => c.trim().length > 0);
  if (multiSpaceCells.length >= 2) {
    return trimmed.replace(/ {2,}|\t+/g, ' | ');
  }

  const match = trimmed.match(/^(.+?)\s+((?:[\d,]+(?:\.\d+)?)(?:\s+[\d,]+(?:\.\d+)?)*)$/);
  if (match) {
    const label = match[1].trim();
    const nums = match[2].trim().split(/\s+/);
    return [label, ...nums].join(' | ');
  }

  return line;
}

/**
 * Collapses multiple blank lines into one, trims trailing spaces per line.
 * Runs AFTER markTableRows so table gaps (now ' | ') are preserved.
 */
function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').replace(/[ \t]+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}