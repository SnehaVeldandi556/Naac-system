// components/naac-upload/columnmapping.tsx
'use client';
import { useState } from 'react';
import { ColumnMapping, CustomField } from '@/lib/naac/columnMap';

type Props = {
  mapping: ColumnMapping;
  rawHeaders: string[];
  customFields: CustomField[];
  onChange: (mapping: ColumnMapping) => void;
  onAddCustomField: (headerName: string, customLabel?: string) => void;
  onRemoveCustomField: (key: string) => void;
};

export function ColumnMappingPanel({
  mapping,
  rawHeaders,
  customFields,
  onChange,
  onAddCustomField,
  onRemoveCustomField,
}: Props) {
  const [selectedAttribute, setSelectedAttribute] = useState<string>('');
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [manualLabel, setManualLabel] = useState('');
  const [manualHeader, setManualHeader] = useState('');

  // find raw headers used more than once across the mapping
  const usedCounts = rawHeaders.reduce<Record<string, number>>((acc, h) => {
    const usedBy = Object.values(mapping).filter(v => v === h).length;
    if (usedBy > 0) acc[h] = usedBy;
    return acc;
  }, {});

  const mappedHeaders = new Set(Object.values(mapping).filter(Boolean) as string[]);
  const unmappedHeaders = rawHeaders.filter(h => !mappedHeaders.has(h));

  function handleSelect(fieldKey: string, rawHeader: string) {
    onChange({ ...mapping, [fieldKey]: rawHeader || null });
  }

  function handleQuickAdd(header: string) {
    onAddCustomField(header);
  }

  function handleAddSelected() {
    if (!selectedAttribute) return;
    onAddCustomField(selectedAttribute);
    setSelectedAttribute('');
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualLabel.trim()) return;
    onAddCustomField(manualHeader || manualLabel.trim(), manualLabel.trim());
    setManualLabel('');
    setManualHeader('');
    setIsAddingManual(false);
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white p-5 space-y-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">Dataset Column Mapping</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Add and map the columns from your dataset attributes that you want to include in this report.
          </p>
        </div>
        <div className="text-xs text-slate-600 font-medium bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
          {customFields.length} column{customFields.length === 1 ? '' : 's'} added ({Object.values(mapping).filter(Boolean).length} mapped)
        </div>
      </div>

      {/* 1. List of Added Columns */}
      {customFields.length === 0 ? (
        <div className="text-center py-6 px-4 bg-slate-50/70 border border-dashed border-slate-200 rounded-lg">
          <p className="text-sm font-medium text-slate-700">No columns added yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Choose attributes from your dataset below to add them to the report.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Mapped Columns ({customFields.length})
          </h4>
          <div className="space-y-2">
            {customFields.map(field => {
              const current = mapping[field.key];
              const isDuplicate = Boolean(current && usedCounts[current] > 1);
              const isMissing = !current;

              return (
                <div
                  key={field.key}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-2.5 rounded-lg border border-slate-200 bg-slate-50/40 text-sm"
                >
                  <div className="w-48 shrink-0 flex items-center gap-2">
                    <span className="font-medium text-slate-800 truncate" title={field.label}>
                      {field.label}
                    </span>
                  </div>

                  <div className="flex-1 flex items-center gap-2">
                    <select
                      className={`w-full border px-3 py-1.5 rounded-lg text-sm bg-white outline-none transition-colors ${
                        isDuplicate
                          ? 'border-red-400 bg-red-50/50 text-red-900 focus:border-red-500'
                          : isMissing
                          ? 'border-amber-400 bg-amber-50/50 text-amber-900 focus:border-amber-500'
                          : 'border-slate-300 focus:border-slate-500 text-slate-800'
                      }`}
                      value={current ?? ''}
                      onChange={e => handleSelect(field.key, e.target.value)}
                    >
                      <option value="">— Select Dataset Column —</option>
                      {rawHeaders.map(h => (
                        <option key={h} value={h}>
                          {h} {usedCounts[h] > 1 && current !== h ? '(already used)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-36 shrink-0 flex items-center justify-between text-xs">
                    {isDuplicate ? (
                      <span className="text-red-600 font-medium">⚠️ Duplicate</span>
                    ) : current ? (
                      <span className="text-emerald-600 font-medium">✓ Mapped</span>
                    ) : (
                      <span className="text-amber-600 font-medium">⚠️ Unmapped</span>
                    )}

                    <button
                      type="button"
                      onClick={() => onRemoveCustomField(field.key)}
                      title="Remove column"
                      className="ml-auto inline-flex items-center justify-center p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <span className="text-base leading-none">✕</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Add Column Controls */}
      <div className="pt-4 border-t border-slate-100 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedAttribute}
              onChange={e => setSelectedAttribute(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-slate-500 text-slate-700"
            >
              <option value="">-- Select Attribute from Dataset --</option>
              {rawHeaders.map(h => (
                <option key={h} value={h}>
                  {h} {mappedHeaders.has(h) ? '(already mapped)' : '(available)'}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedAttribute}
              onClick={handleAddSelected}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs cursor-pointer"
            >
              <span>+</span>
              <span>Add Column</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsAddingManual(!isAddingManual)}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
          >
            {isAddingManual ? 'Cancel Custom Form' : '+ Add Column with Custom Name'}
          </button>
        </div>

        {/* Manual Custom Column Form */}
        {isAddingManual && (
          <form
            onSubmit={handleManualSubmit}
            className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center gap-3 animate-in fade-in duration-150"
          >
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                Column Label / Header Name
              </label>
              <input
                type="text"
                placeholder="e.g. Total Marks or Specialization"
                value={manualLabel}
                onChange={e => setManualLabel(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-slate-500"
                required
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                Map to Dataset Attribute (Optional)
              </label>
              <select
                value={manualHeader}
                onChange={e => setManualHeader(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-slate-500"
              >
                <option value="">— Select Dataset Column —</option>
                {rawHeaders.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
            <div className="self-end">
              <button
                type="submit"
                className="px-4 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
              >
                Create Column
              </button>
            </div>
          </form>
        )}

        {/* Quick Add Available Attributes Pills */}
        {unmappedHeaders.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-xs font-semibold text-slate-500">
              Unmapped dataset attributes (click to quickly add):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {unmappedHeaders.map(header => (
                <button
                  key={header}
                  type="button"
                  onClick={() => handleQuickAdd(header)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
                  title={`Add "${header}" to columns`}
                >
                  <span className="text-indigo-500 font-bold">+</span>
                  <span>{header}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}