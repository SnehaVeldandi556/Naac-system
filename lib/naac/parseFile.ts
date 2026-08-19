// lib/naac/parseFile.ts
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

export type RawSheet = string[][];

export async function parseFile(file: File): Promise<RawSheet> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv')) {
    return parseCsv(file);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseXlsx(file);
  }
  throw new Error('Only .csv or .xlsx files are supported.');
}

function parseCsv(file: File): Promise<RawSheet> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete: (result) => resolve(result.data as RawSheet),
      error: reject,
      skipEmptyLines: false, // keep blank rows so detectHeaderRow can see title/blank rows
    });
  });
}

async function parseXlsx(file: File): Promise<RawSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  const rows: RawSheet = [];

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    // row.values is 1-indexed with index 0 empty — slice it off
    const values = row.values as ExcelJS.CellValue[];
    for (let i = 1; i < values.length; i++) {
      const v = values[i];
      cells.push(v == null ? '' : String(v));
    }
    rows.push(cells);
  });

  return rows;
}