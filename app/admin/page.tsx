// app/admin/pipeline-test/page.tsx
'use client';

import { useState } from 'react';

type Chunk = {
  chunk_index: number;
  chunk_type: 'text' | 'table';
  section_heading: string | null;
  chunk_text: string;
  is_valid: boolean;
  flagged_reason: string | null;
};

type PipelineResult = {
  documentId: string;
  extraction_status: string;
  processing_status: string;
  extraction_error: string | null;
  raw_text: string | null;
  chunks: Chunk[];
};

export default function PipelineTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [expandedChunk, setExpandedChunk] = useState<number | null>(null);

  async function handleRun() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/naac-upload/pipeline-tester', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Pipeline run failed');
        return;
      }

      setResult(data as PipelineResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Pipeline test</h1>
        <p style={styles.subtitle}>
          Runs a file through extractText → cleanText → chunkText → validateChunks → embedChunks,
          the same functions the real ingestion flow uses. Nothing here is stored differently
          from a normal upload — this just surfaces the result in the browser instead of a terminal.
        </p>
      </div>

      <div style={styles.uploadRow}>
        <label style={styles.fileLabel}>
          <input
            type="file"
            accept=".pdf,.docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ display: 'none' }}
          />
          {file ? file.name : 'Choose a .pdf or .docx file'}
        </label>
        <button
          onClick={handleRun}
          disabled={!file || loading}
          style={{
            ...styles.runButton,
            opacity: !file || loading ? 0.5 : 1,
            cursor: !file || loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Running…' : 'Run pipeline'}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {result && (
        <div style={styles.resultsArea}>
          <div style={styles.statusRow}>
            <StatusPill label="extraction" value={result.extraction_status} />
            <StatusPill label="processing" value={result.processing_status} />
            <span style={styles.chunkCount}>{result.chunks.length} chunks</span>
            <button
              onClick={() => setShowRawText((v) => !v)}
              style={styles.rawTextToggle}
            >
              {showRawText ? 'Hide raw text' : 'Show raw text'}
            </button>
          </div>

          {result.extraction_error && (
            <div style={styles.errorBox}>{result.extraction_error}</div>
          )}

          {showRawText && (
            <pre style={styles.rawTextBlock}>{result.raw_text ?? '(empty)'}</pre>
          )}

          <div style={styles.table}>
            <div style={{ ...styles.tableRow, ...styles.tableHeaderRow }}>
              <div style={{ ...styles.cell, width: 40 }}>#</div>
              <div style={{ ...styles.cell, width: 70 }}>type</div>
              <div style={{ ...styles.cell, width: 60 }}>valid</div>
              <div style={{ ...styles.cell, flex: '0 0 220px' }}>section heading</div>
              <div style={{ ...styles.cell, flex: 1 }}>flagged reason</div>
            </div>

            {result.chunks.map((chunk) => {
              const isOpen = expandedChunk === chunk.chunk_index;
              return (
                <div key={chunk.chunk_index}>
                  <div
                    style={{
                      ...styles.tableRow,
                      cursor: 'pointer',
                      background: chunk.is_valid ? undefined : '#3a1f1f'
                    }}
                    onClick={() => setExpandedChunk(isOpen ? null : chunk.chunk_index)}
                  >
                    <div style={{ ...styles.cell, width: 40 }}>{chunk.chunk_index}</div>
                    <div style={{ ...styles.cell, width: 70 }}>{chunk.chunk_type}</div>
                    <div style={{ ...styles.cell, width: 60 }}>
                      {chunk.is_valid ? '✓' : '✕'}
                    </div>
                    <div style={{ ...styles.cell, flex: '0 0 220px' }}>
                      {chunk.section_heading || '—'}
                    </div>
                    <div style={{ ...styles.cell, flex: 1, color: '#e07a5f' }}>
                      {chunk.flagged_reason || ''}
                    </div>
                  </div>
                  {isOpen && (
                    <div style={styles.expandedText}>{chunk.chunk_text}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  const ok = value === 'extracted' || value === 'chunked';
  return (
    <span
      style={{
        ...styles.pill,
        background: ok ? '#1f3a2a' : '#3a1f1f',
        color: ok ? '#7fd99f' : '#f28b82'
      }}
    >
      {label}: {value}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: '"IBM Plex Mono", "SF Mono", Menlo, monospace',
    background: '#151515',
    color: '#e4e4e4',
    minHeight: '100vh',
    padding: '32px 24px',
    maxWidth: 1000,
    margin: '0 auto'
  },
  header: { marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' },
  subtitle: { fontSize: 13, color: '#8a8a8a', marginTop: 6, lineHeight: 1.5, maxWidth: 640 },
  uploadRow: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 },
  fileLabel: {
    border: '1px dashed #444',
    borderRadius: 4,
    padding: '10px 14px',
    fontSize: 13,
    color: '#ccc',
    cursor: 'pointer',
    flex: 1
  },
  runButton: {
    background: '#2b5f4c',
    color: '#e4e4e4',
    border: 'none',
    borderRadius: 4,
    padding: '10px 18px',
    fontSize: 13,
    fontFamily: 'inherit'
  },
  errorBox: {
    background: '#3a1f1f',
    color: '#f28b82',
    border: '1px solid #5a2c2c',
    borderRadius: 4,
    padding: '10px 14px',
    fontSize: 13,
    marginBottom: 16,
    whiteSpace: 'pre-wrap'
  },
  resultsArea: { marginTop: 8 },
  statusRow: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' },
  pill: { fontSize: 12, padding: '4px 8px', borderRadius: 3 },
  chunkCount: { fontSize: 12, color: '#8a8a8a' },
  rawTextToggle: {
    marginLeft: 'auto',
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: 4,
    color: '#ccc',
    fontSize: 12,
    padding: '5px 10px',
    fontFamily: 'inherit',
    cursor: 'pointer'
  },
  rawTextBlock: {
    background: '#0f0f0f',
    border: '1px solid #2a2a2a',
    borderRadius: 4,
    padding: 14,
    fontSize: 12,
    lineHeight: 1.6,
    maxHeight: 320,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    marginBottom: 16,
    color: '#b5b5b5'
  },
  table: { border: '1px solid #2a2a2a', borderRadius: 4, overflow: 'hidden' },
  tableRow: {
    display: 'flex',
    borderBottom: '1px solid #232323',
    padding: '8px 10px',
    fontSize: 12,
    alignItems: 'flex-start'
  },
  tableHeaderRow: {
    background: '#1c1c1c',
    color: '#8a8a8a',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },
  cell: { paddingRight: 10, wordBreak: 'break-word' },
  expandedText: {
    background: '#0f0f0f',
    padding: '12px 16px',
    fontSize: 12,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    color: '#cfcfcf',
    borderBottom: '1px solid #232323'
  }
};