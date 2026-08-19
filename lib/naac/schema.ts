import { z } from 'zod';

export const naacRowSchema = z.object({
  student_id: z.string().trim().min(1, 'Required'),

  student_name: z.string().trim().min(1, 'Required'),

  department: z.string().trim().min(1, 'Required'),

  academic_year: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2,4}$/, 'Format: 2024-25'),

  cgpa: z.preprocess(
    (value) => {
      if (
        value === null ||
        value === undefined ||
        String(value).trim() === ''
      ) {
        return null;
      }

      const normalized = String(value).trim().toLowerCase();

      if (
        normalized === 'na' ||
        normalized === 'n/a' ||
        normalized === '-' ||
        normalized === 'null'
      ) {
        return null;
      }

      const numberValue = Number(normalized);

      return Number.isNaN(numberValue) ? value : numberValue;
    },
    z
      .number()
      .min(0, 'CGPA must be 0-10')
      .max(10, 'CGPA must be 0-10')
      .nullable()
  ),
});

export type NaacRow = z.infer<typeof naacRowSchema>;