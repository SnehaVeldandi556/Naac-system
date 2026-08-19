// components/naac-upload/ColumnMappingPanel.tsx
'use client';
import { CANONICAL_FIELDS, ColumnMapping, CanonicalKey } from '@/lib/naac/columnMap';

type Props = {
  mapping: ColumnMapping;
  rawHeaders: string[];
  onChange: (mapping: ColumnMapping) => void;
};

export function ColumnMappingPanel({ mapping, rawHeaders, onChange }: Props) {
  // find raw headers used more than once across the mapping
  const usedCounts = rawHeaders.reduce<Record<string, number>>((acc, h) => {
    const usedBy = Object.values(mapping).filter(v => v === h).length;
    if (usedBy > 0) acc[h] = usedBy;
    return acc;
  }, {});

  function handleSelect(field: CanonicalKey, rawHeader: string) {
    onChange({ ...mapping, [field]: rawHeader || null });
  }

  return (
    <div className="border rounded p-4 space-y-2">
      <h3 className="font-medium text-sm">Column Mapping</h3>
      {CANONICAL_FIELDS.map(field => {
        const current = mapping[field.key];
        const isDuplicate = current && usedCounts[current] > 1;
        const isMissing = !current;

        return (
          <div key={field.key} className="flex items-center gap-3 text-sm">
            <label className="w-40 shrink-0">{field.label}</label>
            <select
              className={`border px-2 py-1 rounded flex-1 ${
                isDuplicate ? 'border-red-400 bg-red-50' :
                isMissing ? 'border-yellow-400 bg-yellow-50' : ''
              }`}
              value={current ?? ''}
              onChange={e => handleSelect(field.key, e.target.value)}
            >
              <option value="">— Not mapped —</option>
              {rawHeaders.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            {isDuplicate && <span className="text-red-500 text-xs">used twice</span>}
            {isMissing && <span className="text-yellow-600 text-xs">no match found</span>}
          </div>
        );
      })}
    </div>
  );
}