// app/api/generate-ssr/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { supabaseServer } from '@/lib/supabase/supabaseServer';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scriptDir = path.join(process.cwd(), 'generation');
  const compiledPath = path.join(scriptDir, 'compiled_ssr_data.json');
  const missingPath = path.join(scriptDir, 'missing_data_report.json');

  try {
    const [compiledStr, missingStr] = await Promise.all([
      fs.readFile(compiledPath, 'utf-8').catch(() => null),
      fs.readFile(missingPath, 'utf-8').catch(() => null),
    ]);

    return NextResponse.json({
      compiled: compiledStr ? JSON.parse(compiledStr) : null,
      missing: missingStr ? JSON.parse(missingStr) : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scriptPath = path.join(process.cwd(), 'generation', 'main.py');

  return new Promise<NextResponse>((resolve) => {
    execFile(
      'python',
      [scriptPath, 'run', '--limit', '3'],
      { cwd: process.cwd(), timeout: 180000 },
      async (error, stdout, stderr) => {
        if (error) {
          console.error('Python pipeline error:', stderr || error.message);
          return resolve(
            NextResponse.json(
              { error: `Pipeline execution failed: ${stderr || error.message}` },
              { status: 500 }
            )
          );
        }

        try {
          const scriptDir = path.join(process.cwd(), 'generation');
          const compiledPath = path.join(scriptDir, 'compiled_ssr_data.json');
          const missingPath = path.join(scriptDir, 'missing_data_report.json');

          const [compiledStr, missingStr] = await Promise.all([
            fs.readFile(compiledPath, 'utf-8').catch(() => null),
            fs.readFile(missingPath, 'utf-8').catch(() => null),
          ]);

          return resolve(
            NextResponse.json({
              ok: true,
              stdout,
              compiled: compiledStr ? JSON.parse(compiledStr) : null,
              missing: missingStr ? JSON.parse(missingStr) : null,
            })
          );
        } catch (readErr) {
          return resolve(NextResponse.json({ ok: true, stdout }));
        }
      }
    );
  });
}
