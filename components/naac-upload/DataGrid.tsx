// components/naac-upload/DataGrid.tsx
'use client';
import { CellError } from '@/lib/naac/validateRows';

export interface GridField {
  key: string;
  label: string;
  isCustom?: boolean;
  required?: boolean;
}

type Props = {
  fields: GridField[];
  rows: Record<string, string>[];
  errors: CellError[];
  onCellEdit: (rowIdx: number, field: string, value: string) => void;
};

export function DataGrid({ fields, rows, errors, onCellEdit }: Props) {
  const errorAt = (r: number, f: string) =>
    errors.find(e => e.row === r && e.field === f);

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[500px] overflow-y-auto">
      <table className="w-full border-collapse text-sm text-left">
        <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10 shadow-2xs">
          <tr>
            <th className="border-b border-slate-300 px-3 py-2 text-center text-xs text-slate-500 w-12 bg-slate-100">
              #
            </th>
            {fields.map(f => (
              <th key={f.key} className="border-b border-slate-300 px-3 py-2 text-xs font-semibold whitespace-nowrap bg-slate-100">
                <div className="flex items-center gap-1.5">
                  <span>{f.label}</span>
                  {f.isCustom ? (
                    <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-sans">
                      custom
                    </span>
                  ) : f.required ? (
                    <span className="text-[10px] font-normal text-red-500">*</span>
                  ) : null}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.map((row, r) => (
            <tr key={r} className="hover:bg-slate-50/70 transition-colors">
              <td className="px-3 py-1.5 text-center text-xs text-slate-400 font-mono select-none bg-slate-50/40 border-r border-slate-200">
                {r + 1}
              </td>
              {fields.map(f => {
                const err = errorAt(r, f.key);
                return (
                  <td key={f.key} className="p-0 border-r border-slate-200 last:border-r-0">
                    <input
                      className={`w-full px-3 py-1.5 outline-none text-slate-800 text-xs transition-colors ${
                        err ? 'bg-red-50 border border-red-400 text-red-900 focus:bg-red-100/60' : 'focus:bg-indigo-50/40'
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
    </div>
  );
}