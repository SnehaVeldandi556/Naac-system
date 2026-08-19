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
  const [rawDataRows, setRawDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [rows, setRows] = useState<Record<CanonicalKey, string>[]>([]);
  const [errors, setErrors] = useState<CellError[]>([]);
  const [override, setOverride] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploadResult(null);
    setFileName(file.name);

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
    applyMapping(m, rawHeaders, rawDataRows);
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
    setUploading(true);
    setUploadResult(null);
    try {
      const res = await fetch('/api/naac-upload', {
        method: 'POST',
        body: JSON.stringify({ rows, override }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadResult(`Failed: ${data.error ?? 'unknown error'}`);
      } else {
        setUploadResult(`Uploaded ${data.inserted} row(s)${data.skipped ? `, skipped ${data.skipped}` : ''}.`);
      }
    } catch {
      setUploadResult('Upload failed — check server logs.');
    } finally {
      setUploading(false);
    }
  }

  const mappingIssues = mapping ? getMappingIssues(mapping) : [];
  const hasBlockingIssues = errors.length > 0 || mappingIssues.length > 0;
  const hasData = rows.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Page header */}
        <header>
          <h1 className="text-xl font-semibold text-gray-900">NAAC Data Upload</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload a CSV or Excel file, map columns, fix any errors, then submit.
          </p>
        </header>

        {/* Step 1: Upload */}
        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <SectionTitle step={1} title="Upload File" />
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm rounded cursor-pointer hover:bg-gray-800">
              Choose File
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={e => e.target.files && handleFile(e.target.files[0])}
              />
            </label>
            {fileName && <span className="text-sm text-gray-600">{fileName}</span>}
          </div>
        </section>

        {/* Step 2: Column mapping */}
        {mapping && rawHeaders.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <SectionTitle step={2} title="Map Columns" />
            <ColumnMappingPanel
              mapping={mapping}
              rawHeaders={rawHeaders}
              onChange={handleMappingChange}
            />
            {mappingIssues.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <ul className="text-red-700 text-sm list-disc pl-5 space-y-0.5">
                  {mappingIssues.map((issue, i) => <li key={i}>{issue}</li>)}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Step 3: Review data */}
        {hasData && (
          <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <SectionTitle step={3} title="Review Data" />
              <span className={`text-sm font-medium ${errors.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {errors.length > 0 ? `${errors.length} error(s)` : 'No errors'}
              </span>
            </div>
            <div className="overflow-x-auto border border-gray-100 rounded">
              <DataGrid rows={rows} errors={errors} onCellEdit={onCellEdit} />
            </div>
          </section>
        )}

        {/* Empty state before any file is uploaded */}
        {!hasData && (
          <div className="text-center text-sm text-gray-400 py-12 border border-dashed border-gray-200 rounded-lg">
            No file uploaded yet.
          </div>
        )}

      </div>

      {/* Sticky footer: always visible upload action */}
      {hasData && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            <button
              disabled={(hasBlockingIssues && !override) || uploading}
              onClick={handleUpload}
              className="px-5 py-2 bg-gray-900 text-white text-sm rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>

            {hasBlockingIssues && (
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
                Upload anyway
              </label>
            )}

            {uploadResult && (
              <span className="text-sm text-gray-600 ml-auto">{uploadResult}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-900 text-white text-xs font-medium">
        {step}
      </span>
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
    </div>
  );
}