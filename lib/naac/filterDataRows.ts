type CanonicalRow = Record<string, unknown>;

export type FilteredRow = {
  row: CanonicalRow;
  originalIndex: number;
};

const SUMMARY_PATTERNS = [
  /^total\s+(students?|records?|count)/i,
  /^(ai|artificial intelligence)\s+specialization\s+count/i,
  /^cybersecurity\s+count/i,
  /^overall\s+average/i,
  /^average\s+(cgpa|gpa)/i,
  /^highest\s+(cgpa|gpa)/i,
  /^lowest\s+(cgpa|gpa)/i,
  /^department\s+summary/i,
  /^summary\s+statistics/i,
  /^statistics/i,
];
function getCellText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return '';
  }

  return String(value).trim();
}

function isSummaryRow(row: CanonicalRow): boolean {
  const values = Object.values(row)
    .map(getCellText)
    .filter(Boolean);

  if (values.length === 0) {
    return true;
  }

  return values.some((value) =>
    SUMMARY_PATTERNS.some((pattern) => pattern.test(value))
  );
}

export function filterDataRows(rows: CanonicalRow[]) {
  const dataRows: FilteredRow[] = [];
  const ignoredRows: number[] = [];

  rows.forEach((row, index) => {
    const hasAnyValue = Object.values(row).some(
      (value) => getCellText(value) !== ''
    );

    if (!hasAnyValue || isSummaryRow(row)) {
      ignoredRows.push(index);
      return;
    }

    dataRows.push({
      row,
      originalIndex: index,
    });
  });

  return {
    dataRows,
    ignoredRows,
  };
}