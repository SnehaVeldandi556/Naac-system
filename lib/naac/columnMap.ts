// lib/naac/columnMap.ts

export interface CustomField {
  key: string;
  label: string;
  isCustom?: boolean;
  required?: boolean;
}

export type ColumnMapping = Record<string, string | null>; // field key -> raw header name

// Known aliases kept for detectHeaderRow scoring
export const KNOWN_HEADER_KEYWORDS = [
  'student id', 'roll no', 'roll number', 'id', 'reg no', 'registration no', 'usn',
  'name', 'student name', 'full name', 'candidate name',
  'dept', 'department', 'branch', 'program',
  'ay', 'academic year', 'year', 'batch', 'session',
  'cgpa', 'gpa', 'marks', 'percentage', 'score',
  'email', 'phone', 'mobile', 'gender', 'category', 'status', 'title', 'code'
];

export function getMappingIssues(columns: CustomField[], mapping: ColumnMapping): string[] {
  const issues: string[] = [];
  const seen = new Map<string, number>();

  for (const col of columns) {
    const raw = mapping[col.key];
    if (!raw) {
      issues.push(`Column "${col.label}" is not mapped to any dataset attribute`);
    } else {
      seen.set(raw, (seen.get(raw) ?? 0) + 1);
    }
  }

  for (const [header, count] of seen) {
    if (count > 1) {
      issues.push(`Dataset attribute "${header}" is mapped to ${count} columns`);
    }
  }

  return issues;
}