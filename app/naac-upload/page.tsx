// app/naac-upload/page.tsx
'use client';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import SignOutButton from '@/components/SignOutButton';
import { parseFile } from '@/lib/naac/parseFile';
import { detectHeaderRow } from '@/lib/naac/detectHeaderRow';
import {
  ColumnMapping,
  CustomField,
  getMappingIssues,
} from '@/lib/naac/columnMap';
import { validateRows, CellError } from '@/lib/naac/validateRows';
import { DataGrid } from '@/components/naac-upload/DataGrid';
import { ColumnMappingPanel } from '@/components/naac-upload/columnmapping';

type Chunk = {
  chunk_index: number;
  chunk_type: string;
  section_heading: string | null;
  chunk_text: string;
  is_valid: boolean;
  flagged_reason: string | null;
};

type PipelineResult = {
  documentId: string;
  file_name: string;
  file_type: string;
  storage_bucket: string;
  storage_path: string;
  department: string;
  academic_year: string;
  doc_category: string;
  extraction_status: string;
  processing_status: string;
  extraction_error: string | null;
  raw_text: string | null;
  chunks: Chunk[];
};

export default function NaacUploadPage() {
  const [activeTab, setActiveTab] = useState<'documents' | 'spreadsheets'>('documents');

  // --- Document Pipeline State ---
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docCategory, setDocCategory] = useState('SSR Supporting Document');
  const [docSubtype, setDocSubtype] = useState('Activity Report');
  const [docDepartment, setDocDepartment] = useState('Computer Engineering');
  const [academicYear, setAcademicYear] = useState('2024-25');
  const [docProcessing, setDocProcessing] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [docResult, setDocResult] = useState<PipelineResult | null>(null);

  // --- Spreadsheets State ---
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawDataRows, setRawDataRows] = useState<string[][]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [errors, setErrors] = useState<CellError[]>([]);
  const [override, setOverride] = useState(false);
  const [sheetFileName, setSheetFileName] = useState<string | null>(null);
  const [sheetUploading, setSheetUploading] = useState(false);
  const [sheetResult, setSheetResult] = useState<string | null>(null);

  // --- Document Processing Handler ---
  async function handleProcessDocument() {
    if (!docFile) return;
    setDocProcessing(true);
    setDocError(null);
    setDocResult(null);

    try {
      const formData = new FormData();
      formData.append('file', docFile);
      formData.append('doc_category', docCategory);
      formData.append('doc_subtype', docSubtype);
      formData.append('department', docDepartment);
      formData.append('academic_year', academicYear);

      const res = await fetch('/api/naac-upload/pipeline-tester', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setDocError(data.error ?? 'Document upload failed. Please try again.');
        return;
      }

      setDocResult(data as PipelineResult);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : String(err));
    } finally {
      setDocProcessing(false);
    }
  }

  // --- Spreadsheet Handlers ---
  function applyMapping(
    map: ColumnMapping,
    headers: string[],
    dataRows: string[][],
    fieldsList: CustomField[]
  ) {
    if (fieldsList.length === 0) {
      setRows([]);
      setErrors([]);
      return;
    }

    const mapped = dataRows.map(r => {
      const obj: Record<string, string> = {};
      for (const field of fieldsList) {
        const colIdx = headers.indexOf(map[field.key] ?? '');
        obj[field.key] = colIdx >= 0 ? String(r[colIdx] ?? '') : '';
      }
      return obj;
    });
    setRows(mapped);
    setErrors(validateRows(mapped).errors);
  }

  async function handleSpreadsheetFile(file: File) {
    setSheetResult(null);
    setSheetFileName(file.name);

    const sheet = await parseFile(file);
    const headerIdx = detectHeaderRow(sheet);
    const headers = sheet[headerIdx].map(String);
    const dataRows = sheet.slice(headerIdx + 1);

    setRawHeaders(headers);
    setRawDataRows(dataRows);
    setCustomFields([]);
    setMapping({});
    setRows([]);
    setErrors([]);
  }

  function handleAddCustomField(headerNameOrKey: string, customLabel?: string) {
    const label = customLabel?.trim() || headerNameOrKey.trim();
    const baseKey = label.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'col';
    let uniqueKey = baseKey;
    let counter = 1;
    while (customFields.some(f => f.key === uniqueKey)) {
      uniqueKey = `${baseKey}_${counter++}`;
    }

    const newField: CustomField = {
      key: uniqueKey,
      label,
      isCustom: true,
    };

    const nextCustomFields = [...customFields, newField];
    setCustomFields(nextCustomFields);

    const mappedHeader = rawHeaders.includes(headerNameOrKey) ? headerNameOrKey : (rawHeaders[0] ?? null);
    const nextMapping: ColumnMapping = {
      ...(mapping ?? {}),
      [uniqueKey]: mappedHeader,
    };
    setMapping(nextMapping);

    applyMapping(nextMapping, rawHeaders, rawDataRows, nextCustomFields);
  }

  function handleRemoveCustomField(fieldKey: string) {
    const nextCustomFields = customFields.filter(f => f.key !== fieldKey);
    setCustomFields(nextCustomFields);

    const nextMapping = { ...(mapping ?? {}) };
    delete nextMapping[fieldKey];
    setMapping(nextMapping);

    applyMapping(nextMapping, rawHeaders, rawDataRows, nextCustomFields);
  }

  function handleMappingChange(m: ColumnMapping) {
    setMapping(m);
    applyMapping(m, rawHeaders, rawDataRows, customFields);
  }

  const onCellEdit = useCallback((r: number, field: string, value: string) => {
    setRows(prev => {
      const next = [...prev];
      next[r] = { ...next[r], [field]: value };
      setErrors(validateRows(next).errors);
      return next;
    });
  }, []);

  async function handleUploadSpreadsheet() {
    setSheetUploading(true);
    setSheetResult(null);
    try {
      const res = await fetch('/api/naac-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, override, fileName: sheetFileName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSheetResult(`Failed: ${data.error ?? 'unknown error'}`);
      } else {
        setSheetResult(`Uploaded ${data.inserted} row(s)${data.skipped ? `, skipped ${data.skipped}` : ''}.`);
      }
    } catch {
      setSheetResult('Upload failed — check server logs.');
    } finally {
      setSheetUploading(false);
    }
  }

  const mappingIssues = mapping ? getMappingIssues(customFields, mapping) : [];
  const hasBlockingIssues = errors.length > 0 || mappingIssues.length > 0;
  const hasColumns = customFields.length > 0;
  const hasData = rows.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Top bar with back to dashboard and sign out */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            ← Back to Dashboard
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">NAAC Ingestion & Document Pipeline</h1>
          </div>
        </div>
        <SignOutButton />
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-white rounded-xl p-1 shadow-sm gap-2">
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'documents'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span className="text-base">📄</span>
            <span>Narrative Documents (.pdf, .docx)</span>
          </button>
          <button
            onClick={() => setActiveTab('spreadsheets')}
            className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'spreadsheets'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span className="text-base">📊</span>
            <span>Quantitative Metrics (.csv, .xlsx)</span>
          </button>
        </div>

        {/* ----------------- TAB 1: DOCUMENT PIPELINE ----------------- */}
        {activeTab === 'documents' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Document Cleaning & Chunking Pipeline</h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload a .pdf or .docx document to store it in Supabase Storage and process it through text extraction, cleaning, section chunking, validation, and database storage.
              </p>
            </div>

            {/* Document Upload & Metadata Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Document File (.pdf or .docx)
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-slate-400 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    <span className="text-3xl mb-2">📁</span>
                    <span className="text-sm font-medium text-slate-700">
                      {docFile ? docFile.name : 'Click to choose a .pdf or .docx file'}
                    </span>
                    <span className="text-xs text-slate-400 mt-1">
                      {docFile ? `${(docFile.size / 1024).toFixed(1)} KB` : 'Word (.docx) or PDF format supported'}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (f && f.name.toLowerCase().endsWith('.doc') && !f.name.toLowerCase().endsWith('.docx')) {
                          alert('Older binary .doc format is not supported directly. Please open in Word and save as .docx or .pdf.');
                          return;
                        }
                        setDocFile(f);
                      }}
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                      Document Category
                    </label>
                    <input
                      value={docCategory}
                      onChange={(e) => setDocCategory(e.target.value)}
                      placeholder="e.g. SSR Supporting, Placement Report, Workshop"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                      Document Subtype
                    </label>
                    <input
                      value={docSubtype}
                      onChange={(e) => setDocSubtype(e.target.value)}
                      placeholder="e.g. Activity Report, Syllabus, Brochure"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                        Department
                      </label>
                      <input
                        value={docDepartment}
                        onChange={(e) => setDocDepartment(e.target.value)}
                        placeholder="e.g. Computer Engineering"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                        Academic Year
                      </label>
                      <input
                        value={academicYear}
                        onChange={(e) => setAcademicYear(e.target.value)}
                        placeholder="e.g. 2024-25"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Select your document and department to submit for NAAC reporting.
                </p>
                <button
                  onClick={handleProcessDocument}
                  disabled={!docFile || docProcessing}
                  className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  {docProcessing ? 'Uploading document...' : 'Upload Document'}
                </button>
              </div>
            </div>

            {/* Error Display */}
            {docError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p className="font-semibold mb-1">Upload Error</p>
                <p className="text-xs whitespace-pre-wrap">{docError}</p>
              </div>
            )}

            {/* Processing Results Area */}
            {docResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-sm space-y-4 animate-in fade-in duration-200">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold border border-emerald-300">
                      ✓
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-emerald-950">
                        Your file has been successfully uploaded and taken for review for the report.
                      </h3>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        Your document is securely registered and will be included in the NAAC SSR report generation.
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Status: Under Review
                  </span>
                </div>

                {/* File Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-emerald-200/80 text-xs">
                  <div className="bg-white/95 p-3 rounded-lg border border-emerald-100 shadow-2xs">
                    <span className="font-semibold text-slate-500 block">Uploaded File</span>
                    <span className="font-medium text-slate-800 break-all">{docResult.file_name}</span>
                  </div>
                  <div className="bg-white/95 p-3 rounded-lg border border-emerald-100 shadow-2xs">
                    <span className="font-semibold text-slate-500 block">Department & Academic Year</span>
                    <span className="font-medium text-slate-800">{docDepartment} ({academicYear})</span>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-1 text-xs">
                  <button
                    onClick={() => {
                      setDocFile(null);
                      setDocResult(null);
                    }}
                    className="font-semibold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                  >
                    + Upload Another Document
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------- TAB 2: QUANTITATIVE SPREADSHEETS ----------------- */}
        {activeTab === 'spreadsheets' && (
          <div className="space-y-6">
            <header>
              <h2 className="text-lg font-semibold text-gray-900">NAAC Quantitative Data Ingestion</h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload a CSV or Excel file, add and map columns from your dataset attributes, review data, and submit.
              </p>
            </header>

            {/* Step 1: Upload */}
            <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 shadow-sm">
              <SectionTitle step={1} title="Upload Spreadsheet" />
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm rounded cursor-pointer hover:bg-gray-800 transition-colors">
                  Choose File
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={e => e.target.files && handleSpreadsheetFile(e.target.files[0])}
                  />
                </label>
                {sheetFileName && <span className="text-sm text-gray-600 font-medium">{sheetFileName}</span>}
              </div>
            </section>

            {/* Step 2: Column mapping */}
            {rawHeaders.length > 0 && (
              <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 shadow-sm">
                <SectionTitle step={2} title="Map Columns" />
                <ColumnMappingPanel
                  mapping={mapping ?? {}}
                  rawHeaders={rawHeaders}
                  customFields={customFields}
                  onChange={handleMappingChange}
                  onAddCustomField={handleAddCustomField}
                  onRemoveCustomField={handleRemoveCustomField}
                />
                {mappingIssues.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <ul className="text-red-700 text-sm list-disc pl-5 space-y-0.5">
                      {mappingIssues.map((issue, i) => <li key={i}>{issue}</li>)}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* Step 3: Review data */}
            {rawHeaders.length > 0 && (
              <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <SectionTitle step={3} title="Review Data" />
                  {hasColumns && (
                    <span className={`text-sm font-medium ${errors.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {errors.length > 0 ? `${errors.length} error(s)` : 'No errors'}
                    </span>
                  )}
                </div>

                {hasColumns ? (
                  <DataGrid fields={customFields} rows={rows} errors={errors} onCellEdit={onCellEdit} />
                ) : (
                  <div className="text-center text-sm text-slate-400 py-8 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                    No columns added yet. Add columns in Step 2 above to review and preview dataset records.
                  </div>
                )}
              </section>
            )}

            {/* Empty state before any file is uploaded */}
            {rawHeaders.length === 0 && (
              <div className="text-center text-sm text-gray-400 py-12 border border-dashed border-gray-200 rounded-lg bg-white">
                No spreadsheet uploaded yet. Click &quot;Choose File&quot; above to begin.
              </div>
            )}

            {/* Sticky footer: upload action */}
            {hasData && (
              <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 shadow-lg">
                <div className="max-w-5xl mx-auto flex items-center gap-4">
                  <button
                    disabled={(hasBlockingIssues && !override) || sheetUploading}
                    onClick={handleUploadSpreadsheet}
                    className="px-5 py-2 bg-gray-900 text-white text-sm rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors font-medium"
                  >
                    {sheetUploading ? 'Uploading…' : 'Upload to Database'}
                  </button>

                  {hasBlockingIssues && (
                    <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
                      Upload anyway
                    </label>
                  )}

                  {sheetResult && (
                    <span className="text-sm font-medium text-gray-700 ml-auto">{sheetResult}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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