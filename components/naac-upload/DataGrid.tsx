// components/naac-upload/DataGrid.tsx
'use client';
import { CANONICAL_FIELDS, CanonicalKey } from '@/lib/naac/columnMap';
import { CellError } from '@/lib/naac/validateRows';

type Props = {
  rows: Record<CanonicalKey, string>[];
  errors: CellError[];
  onCellEdit: (rowIdx: number, field: CanonicalKey, value: string) => void;
};

export function DataGrid({ rows, errors, onCellEdit }: Props) {
  const errorAt = (r: number, f: CanonicalKey) =>
    errors.find(e => e.row === r && e.field === f);

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {CANONICAL_FIELDS.map(f => (
            <th key={f.key} className="border px-2 py-1 text-left bg-gray-100">
              {f.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {CANONICAL_FIELDS.map(f => {
              const err = errorAt(r, f.key);
              return (
                <td key={f.key} className="border p-0">
                  <input
                    className={`w-full px-2 py-1 outline-none ${
                      err ? 'bg-red-100 border border-red-400' : ''
                    }`}
                    title={err?.message}
                    value={row[f.key] ?? ''}
                    onChange={e => onCellEdit(r, f.key, e.target.value)}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}