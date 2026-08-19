import { naacRowSchema, NaacRow } from './schema';
import { CanonicalKey } from './columnMap';

export type CellError = {
  row: number;
  field: CanonicalKey;
  message: string;
};

export function validateRows(rows: Record<CanonicalKey, unknown>[]) {
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
          field: issue.path[0] as CanonicalKey,
          message: issue.message,
        });
      });
    }
  });

  return { validated, errors };
}