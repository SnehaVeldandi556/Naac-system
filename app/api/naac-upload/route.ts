import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';
import { validateRows } from '@/lib/naac/validateRows';
import { filterDataRows } from '@/lib/naac/filterDataRows';

export async function POST(req: Request) {
  try {
    console.time('NAAC TOTAL');

    const { rows, fileName } = await req.json();

    const supabase = getSupabaseServerClient();
    const uploadBatchId = randomUUID();

    // ----------------------------------------
    // 1. RAW SUBMISSIONS - ONE BATCH INSERT
    // ----------------------------------------

    console.time('RAW INSERT');

    const rawInsert = rows.map(
      (row: Record<string, string>, i: number) => ({
        source_filename: fileName ?? 'unknown',
        upload_batch_id: uploadBatchId,
        row_number: i,
        raw_row: row,
        status: 'pending',
      })
    );

    const { data: rawInserted, error: rawError } = await supabase
      .from('raw_submissions')
      .insert(rawInsert)
      .select('id, row_number');

    console.timeEnd('RAW INSERT');

    if (rawError) {
      console.error('raw_submissions insert failed:', rawError);

      return NextResponse.json(
        {
          error: `raw_submissions: ${rawError.message}`,
        },
        { status: 500 }
      );
    }

    // ----------------------------------------
    // 2. row_number -> raw_submission_id
    // ----------------------------------------

    const rawIdByRow = new Map(
      (rawInserted ?? []).map((record) => [
        record.row_number,
        record.id,
      ])
    );

    // ----------------------------------------
    // 3. FILTER NON-DATA ROWS
    // ----------------------------------------

    console.time('FILTER ROWS');

    const {
      dataRows: filteredRows,
      ignoredRows,
    } = filterDataRows(rows);

    console.timeEnd('FILTER ROWS');

    console.log(`Rows received: ${rows.length}`);
    console.log(`Data rows: ${filteredRows.length}`);
    console.log(`Ignored rows: ${ignoredRows.length}`);

    // ----------------------------------------
    // 4. VALIDATE + TRANSFORM
    // ----------------------------------------

    console.time('VALIDATION');

    const canonicalRows = filteredRows.map(
      (item) => item.row
    );

    const {
      validated,
      errors,
    } = validateRows(canonicalRows);

    console.timeEnd('VALIDATION');

    // ----------------------------------------
    // 5. PREPARE VALID DATA
    // ----------------------------------------

    console.time('TRANSFORM');

    const dataInsert = [];
    let skippedCount = 0;

    for (let i = 0; i < validated.length; i++) {
      const validatedRow = validated[i];

      // Invalid record → do not insert into clean table
      if (!validatedRow) {
        skippedCount++;
        continue;
      }

      const filteredItem = filteredRows[i];
      const originalIndex = filteredItem.originalIndex;

      dataInsert.push({
        raw_submission_id:
          rawIdByRow.get(originalIndex),

        student_id: validatedRow.student_id,
        student_name: validatedRow.student_name,
        department: validatedRow.department,
        academic_year: validatedRow.academic_year,
        cgpa: validatedRow.cgpa,

        is_valid: true,
        validation_errors: null,
      });
    }

    console.timeEnd('TRANSFORM');

    // ----------------------------------------
    // 6. DATA SUBMISSIONS - ONE BATCH INSERT
    // ----------------------------------------

    console.time('DATA INSERT');

    if (dataInsert.length > 0) {
      const { error: dataError } = await supabase
        .from('data_submissions')
        .insert(dataInsert);

      if (dataError) {
        console.error(
          'data_submissions batch insert failed:',
          dataError
        );

        return NextResponse.json(
          {
            error: `data_submissions: ${dataError.message}`,
          },
          { status: 500 }
        );
      }
    }

    console.timeEnd('DATA INSERT');

    // ----------------------------------------
    // 7. RESPONSE
    // ----------------------------------------

    console.timeEnd('NAAC TOTAL');

    return NextResponse.json({
      uploadBatchId,
      total: rows.length,
      dataRows: filteredRows.length,
      ignoredRows: ignoredRows.length,
      inserted: dataInsert.length,
      skipped: skippedCount,
      valid: dataInsert.length,
      invalid: errors.length > 0
        ? new Set(errors.map((e) => e.row)).size
        : 0,
      validationErrors: errors,
    });

  } catch (err) {
    console.error(
      'naac-upload route crashed:',
      err
    );

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unknown error',
      },
      { status: 500 }
    );
  }
}