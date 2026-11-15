// lib/naac/detectHeaderRow.ts
import { RawSheet } from './parseFile';
import { KNOWN_HEADER_KEYWORDS } from './columnMap';

/**
 * Scores each of the first N rows by how many cells match a known
 * column alias (case-insensitive, trimmed). Picks the best match.
 * Falls back to row 0 if nothing scores.
 */
export function detectHeaderRow(rows: RawSheet, scanLimit = 10): number {
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(scanLimit, rows.length); i++) {
    const row = rows[i].map(c => String(c ?? '').trim().toLowerCase());
    const nonEmpty = row.filter(Boolean).length;
    if (nonEmpty < 2) continue; // title rows / blank rows

    const score = row.filter(cell =>
      KNOWN_HEADER_KEYWORDS.some(keyword => keyword === cell || cell.includes(keyword))
    ).length;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}