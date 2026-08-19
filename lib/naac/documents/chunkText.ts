// lib/naac/documents/chunkText.ts

export type TextChunk = {
  chunk_text: string;
  chunk_index: number;
  section_heading: string | null;
  chunk_type: 'text' | 'table';
};

const CHUNK_SIZE = 800;      // approx chars per prose chunk
const CHUNK_OVERLAP = 150;   // chars of overlap between consecutive prose chunks
const MIN_TABLE_ROW_STREAK = 3; // need 3+ consecutive column-spaced lines to call it a table
const MAX_TABLE_CHUNK_CHARS = 1200; // cap on a single table chunk before it gets split

/**
 * Splits cleaned text into chunks, tagging each with the nearest heading
 * above it.
 *
 * Two boundary fixes vs. the previous version:
 *
 * 1. HEADINGS ARE HARD BOUNDARIES. Previously splitWithOverlap ran over the
 *    entire reconstructed doc as one string, so an 800-char window could
 *    start under one heading and end under the next — section_heading was
 *    just "whichever heading was most recent," not a real boundary. Now we
 *    split into per-heading sections FIRST, and splitWithOverlap only ever
 *    runs inside a single section's text.
 *
 * 2. TABLES ARE DETECTED AND KEPT ATOMIC. pdf-parse preserves tabular data
 *    as whitespace/column-aligned lines (e.g. "Textbooks        48,650").
 *    A streak of 3+ such lines is treated as one table block and never
 *    passed through the char-window/sentence splitter, so a row never gets
 *    cut in half across two chunks. Oversized tables are still split, but
 *    only at row boundaries, with the header row repeated in each piece.
 */
export function chunkText(cleanedText: string): TextChunk[] {
  if (!cleanedText || cleanedText.trim().length === 0) {
    return [];
  }

  const sections = splitIntoSections(cleanedText);
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const blocks = splitIntoBlocks(section.bodyLines);

    for (const block of blocks) {
      if (block.type === 'table') {
        const tableChunks = splitTableBlock(block.lines, MAX_TABLE_CHUNK_CHARS);
        for (const tc of tableChunks) {
          if (tc.trim().length === 0) continue;
          chunks.push({
            chunk_text: tc,
            chunk_index: chunkIndex++,
            section_heading: section.heading,
            chunk_type: 'table'
          });
        }
        continue;
      }

      // prose block — recursively split only within this block's text
      const blockText = block.lines.join('\n');
      const rawChunks = splitWithOverlap(blockText, CHUNK_SIZE, CHUNK_OVERLAP);
      for (const rc of rawChunks) {
        const text = rc.text.trim();
        if (text.length === 0) continue;
        chunks.push({
          chunk_text: text,
          chunk_index: chunkIndex++,
          section_heading: section.heading,
          chunk_type: 'text'
        });
      }
    }
  }

  return chunks;
}

// ---------- Pass 1: hard split on headings ----------

type SectionBlock = { heading: string | null; bodyLines: string[] };

function splitIntoSections(cleanedText: string): SectionBlock[] {
  const lines = cleanedText.split('\n');
  const sections: SectionBlock[] = [];
  let currentHeading: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (buf.length > 0) {
      sections.push({ heading: currentHeading, bodyLines: buf });
    }
    buf = [];
  };

  for (const line of lines) {
    if (isLikelyHeading(line)) {
      flush();
      currentHeading = line.trim();
      continue; // heading line itself is not content
    }
    buf.push(line);
  }
  flush();

  return sections;
}

/**
 * Heuristic heading detector:
 * - short line (< 80 chars)
 * - AND (all-caps OR numbered pattern like "3.2"/"A." OR Title Case heading)
 */
function isLikelyHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return false;

  const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);

  const isNumberedHeading =
    /^(\d+(\.\d+)*|[A-Z])[.)]\s+\S/.test(trimmed) && !trimmed.endsWith('.');

  return isAllCaps || isNumberedHeading || isLikelyTitleCaseHeading(trimmed);
}

/**
 * Catches headers like "Library and Learning Resources" — neither ALL CAPS
 * nor numbered. All must hold:
 * - short (<= 60 chars), doesn't end in sentence punctuation
 * - at least 2 words
 * - every "significant" word (4+ letters) is capitalized; short connector
 *   words (and, of, for...) are allowed to stay lowercase
 */
function isLikelyTitleCaseHeading(trimmed: string): boolean {
  if (trimmed.length > 60) return false;
  if (/[.!?,:;]$/.test(trimmed)) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;

  const connectors = new Set(['and', 'or', 'of', 'for', 'the', 'in', 'to', 'a', 'an', '&']);
  const significantWords = words.filter((w) => w.replace(/[^A-Za-z]/g, '').length >= 4);
  if (significantWords.length === 0) return false;

  const allSignificantCapitalized = significantWords.every((w) => /^[A-Z]/.test(w));
  const shortWordsOk = words.every(
    (w) => /^[A-Z]/.test(w) || connectors.has(w.toLowerCase()) || w.replace(/[^A-Za-z]/g, '').length < 4
  );

  return allSignificantCapitalized && shortWordsOk;
}

// ---------- Pass 2: within a section, split into table vs. prose blocks ----------

type ContentBlock = { type: 'table' | 'text'; lines: string[] };

function splitIntoBlocks(lines: string[]): ContentBlock[] {
  const isTableFlags = lines.map(isLikelyTableRow);
  const blocks: ContentBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    if (isTableFlags[i]) {
      // find the full streak of table-like lines
      let j = i;
      while (j < lines.length && isTableFlags[j]) j++;
      const streakLen = j - i;

      if (streakLen >= MIN_TABLE_ROW_STREAK) {
        blocks.push({ type: 'table', lines: lines.slice(i, j) });
        i = j;
        continue;
      }
      // streak too short to be a real table — treat as normal prose lines
    }

    // accumulate consecutive non-table (or short-streak) lines as one prose block
    let j = i;
    while (j < lines.length) {
      if (isTableFlags[j]) {
        let k = j;
        while (k < lines.length && isTableFlags[k]) k++;
        if (k - j >= MIN_TABLE_ROW_STREAK) break; // real table starts here, stop prose block
        j = k; // short streak, absorb into prose and keep going
        continue;
      }
      j++;
    }
    blocks.push({ type: 'text', lines: lines.slice(i, j) });
    i = j;
  }

  return blocks;
}

/**
 * cleanText.ts detects column-aligned rows and marks them with ' | ' BEFORE
 * whitespace normalization collapses the original multi-space column gaps.
 * By the time chunkText runs, those gaps are gone — so this checks for the
 * ' | ' marker instead of re-deriving column structure that no longer exists.
 */
function isLikelyTableRow(line: string): boolean {
  const cells = line.trim().split(' | ').filter((c) => c.trim().length > 0);
  return cells.length >= 2;
}

/**
 * Splits an oversized table block into multiple chunks capped near
 * maxChars. Assumes lines[0] is the header row (per cleanText's header
 * capture) and repeats it at the top of every sub-chunk, so column
 * meaning survives even when a table gets split across chunks.
 */
function splitTableBlock(lines: string[], maxChars: number): string[] {
  const fullText = lines.join('\n').trim();
  if (fullText.length <= maxChars || lines.length <= 1) {
    return [fullText];
  }

  const header = lines[0];
  const dataRows = lines.slice(1);
  const result: string[] = [];
  let current: string[] = [header];
  let currentLen = header.length;

  for (const row of dataRows) {
    if (currentLen + row.length + 1 > maxChars && current.length > 1) {
      result.push(current.join('\n'));
      current = [header];
      currentLen = header.length;
    }
    current.push(row);
    currentLen += row.length + 1;
  }
  if (current.length > 1) result.push(current.join('\n'));

  return result;
}

// ---------- Pass 3: overlap split for a single prose block (unchanged logic, now section-scoped) ----------

function splitWithOverlap(
  text: string,
  size: number,
  overlap: number
): { text: string; startOffset: number }[] {
  const chunks: { text: string; startOffset: number }[] = [];
  let start = 0;

  if (text.length <= size) {
    return text.trim() ? [{ text, startOffset: 0 }] : [];
  }

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      const sentenceBreak = text.lastIndexOf('. ', end);
      const breakPoint = Math.max(paragraphBreak, sentenceBreak);
      if (breakPoint > start + size * 0.5) {
        end = breakPoint + 1;
      }
    }

    chunks.push({ text: text.slice(start, end), startOffset: start });
    start = end - overlap;
    if (start <= chunks[chunks.length - 1].startOffset) break; // safety against infinite loop
  }

  return chunks;
}