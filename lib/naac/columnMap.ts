// lib/naac/columnMap.ts
export const CANONICAL_FIELDS = [
  { key: 'student_id', label: 'Student ID', aliases: ['student id', 'roll no', 'roll number', 'id'], required: true },
  { key: 'student_name', label: 'Student Name', aliases: ['name', 'student name', 'full name'], required: true },
  { key: 'department', label: 'Department', aliases: ['dept', 'department', 'branch'], required: true },
  { key: 'academic_year', label: 'Academic Year', aliases: ['ay', 'academic year', 'year'], required: true },
  { key: 'cgpa', label: 'CGPA', aliases: ['cgpa', 'gpa'], required: false },
] as const;

export type CanonicalKey = typeof CANONICAL_FIELDS[number]['key'];
export type ColumnMapping = Record<CanonicalKey, string | null>; // canonical -> raw header name

export function autoGuessMapping(rawHeaders: string[]): ColumnMapping {
  const mapping = {} as ColumnMapping;
  for (const field of CANONICAL_FIELDS) {
    const match = rawHeaders.find(h =>
      field.aliases.some(a => a.toLowerCase() === h.trim().toLowerCase())
    );
    mapping[field.key] = match ?? null;
  }
  return mapping;
}

export function getMappingIssues(mapping: ColumnMapping): string[] {
  const issues: string[] = [];
  const seen = new Map<string, number>();

  for (const field of CANONICAL_FIELDS) {
    const raw = mapping[field.key];
    if (!raw && field.required) {
      issues.push(`${field.label} is required but not mapped`);
    }
    if (raw) seen.set(raw, (seen.get(raw) ?? 0) + 1);
  }

  for (const [header, count] of seen) {
    if (count > 1) issues.push(`"${header}" is mapped to multiple fields`);
  }

  return issues;
}