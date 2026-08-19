// app/naac-upload/page.tsx
'use client';
import { useState, useCallback } from 'react';
import { parseFile } from '@/lib/naac/parseFile';
import { detectHeaderRow } from '@/lib/naac/detectHeaderRow';
import {
  autoGuessMapping,
  CANONICAL_FIELDS,
  ColumnMapping,
  CanonicalKey,
  getMappingIssues,
} from '@/lib/naac/columnMap';
import { validateRows, CellError } from '@/lib/naac/validateRows';
import { DataGrid } from '@/components/naac-upload/DataGrid';
import { ColumnMappingPanel } from '@/components/naac-upload/columnmapping';

export default function NaacUploadPage() {
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawDataRows, setRawDataRows] = useState<string[][]>([]); // ← source of truth for remapping
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [rows, setRows] = useState<Record<CanonicalKey, string>[]>([]);
  const [errors, setErrors] = useState<CellError[]>([]);
  const [override, setOverride] = useState(false);

  async function handleFile(file: File) {
    const sheet = await parseFile(file);
    const headerIdx = detectHeaderRow(sheet);
    const headers = sheet[headerIdx].map(String);
    const dataRows = sheet.slice(headerIdx + 1);

    const guessedMap = autoGuessMapping(headers);
    setRawHeaders(headers);
    setRawDataRows(dataRows);
    setMapping(guessedMap);
    applyMapping(guessedMap, headers, dataRows);
  }

  function applyMapping(map: ColumnMapping, headers: string[], dataRows: string[][]) {
    const mapped = dataRows.map(r => {
      const obj = {} as Record<CanonicalKey, string>;
      for (const field of CANONICAL_FIELDS) {
        const colIdx = headers.indexOf(map[field.key] ?? '');
        obj[field.key] = colIdx >= 0 ? String(r[colIdx] ?? '') : '';
      }
      return obj;
    });
    setRows(mapped);
    setErrors(validateRows(mapped).errors);
  }

  function handleMappingChange(m: ColumnMapping) {
    setMapping(m);
    applyMapping(m, rawHeaders, rawDataRows); // always remap from raw source
  }

  const onCellEdit = useCallback((r: number, field: CanonicalKey, value: string) => {
    setRows(prev => {
      const next = [...prev];
      next[r] = { ...next[r], [field]: value };
      setErrors(validateRows(next).errors);
      return next;
    });
  }, []);

  async function handleUpload() {
    const res = await fetch('/api/naac-upload', {
      method: 'POST',
      body: JSON.stringify({ rows, override }),
    });
    if (!res.ok) alert('Upload failed — check server logs');
  }

  const mappingIssues = mapping ? getMappingIssues(mapping) : [];
  const hasBlockingIssues = errors.length > 0 || mappingIssues.length > 0;

  return (
    <div className="p-6 space-y-4">
      <input
        type="file"
        accept=".csv,.xlsx"
        onChange={e => e.target.files && handleFile(e.target.files[0])}
      />

      {mapping && rawHeaders.length > 0 && (
        <ColumnMappingPanel
          mapping={mapping}
          rawHeaders={rawHeaders}
          onChange={handleMappingChange}
        />
      )}

      {mappingIssues.length > 0 && (
        <ul className="text-red-600 text-sm list-disc pl-5">
          {mappingIssues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}

      {rows.length > 0 && <DataGrid rows={rows} errors={errors} onCellEdit={onCellEdit} />}

      <div className="flex items-center gap-3">
        <span>{errors.length} error(s)</span>
        <button
          disabled={hasBlockingIssues && !override}
          onClick={handleUpload}
          className="px-4 py-2 bg-black text-white rounded disabled:opacity-40"
        >
          Upload
        </button>
        {hasBlockingIssues && (
          <label className="text-sm">
            <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} /> Upload anyway
          </label>
        )}
      </div>
    </div>
  );
}