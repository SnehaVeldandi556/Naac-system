// lib/naac/validateRows.ts
import { naacRowSchema, NaacRow } from './schema';

export type CellError = {
  row: number;
  field: string;
  message: string;
};

export function validateRows(rows: Record<string, unknown>[]) {
  const errors: CellError[] = [];
  const validated: (NaacRow | null)[] = [];

  rows.forEach((row, i) => {
    const result = naacRowSchema.safeParse(row);

    if (result.success) {
      validated.push(result.data);
    } else {
      validated.push(null);

      result.error.issues.forEach((issue) => {
        errors.push({
          row: i,
          field: String(issue.path[0] || 'unknown'),
          message: issue.message,
        });
      });
    }
  });

  return { validated, errors };
}