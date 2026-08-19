// lib/naac/documents/chunkValidator.ts
import type { TextChunk } from './chunkText';

export type ValidatedChunk = TextChunk & {
  is_valid: boolean;
  flagged_reason: string | null;
};

const MIN_CHUNK_LENGTH = 40;        // chars — anything shorter is likely noise
const MIN_ALPHA_RATIO = 0.5;        // at least 50% letters (catches OCR garbage / symbol soup)
const MAX_REPEATED_CHAR_RUN = 15;   // catches "-----------" or "........." junk lines

/**
 * Validates each chunk's quality before it's allowed into the embedding step.
 * Never drops a chunk — always tags is_valid + flagged_reason so nothing
 * disappears silently (same pattern as your row validationErrors).
 */
export function validateChunks(chunks: TextChunk[]): ValidatedChunk[] {
  return chunks.map((chunk) => {
    const reason = getFlagReason(chunk.chunk_text);
    return {
      ...chunk,
      is_valid: reason === null,
      flagged_reason: reason
    };
  });
}

function getFlagReason(text: string): string | null {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return 'empty_after_clean';
  }

  if (trimmed.length < MIN_CHUNK_LENGTH) {
    return 'too_short';
  }

  const alphaCount = (trimmed.match(/[a-zA-Z]/g) ?? []).length;
  const alphaRatio = alphaCount / trimmed.length;
  if (alphaRatio < MIN_ALPHA_RATIO) {
    return 'low_text_quality'; // likely OCR garbage, symbols, table fragments
  }

  if (hasLongRepeatedCharRun(trimmed, MAX_REPEATED_CHAR_RUN)) {
    return 'repeated_char_noise'; // e.g. "..........." table borders/dividers
  }

  return null;
}

function hasLongRepeatedCharRun(text: string, maxRun: number): boolean {
  let runChar = '';
  let runLength = 0;

  for (const char of text) {
    if (char === runChar) {
      runLength++;
      if (runLength >= maxRun) return true;
    } else {
      runChar = char;
      runLength = 1;
    }
  }
  return false;
}