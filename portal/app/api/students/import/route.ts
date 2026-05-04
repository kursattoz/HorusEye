// PRD-013 §5.1 — Bulk student upload (CSV; XLSX placeholder)
// CSV header (zorunlu): student_id, full_name, email[, department]
// Upsert by student_id: existing rows updated, new rows inserted.
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

const STUDENT_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Row {
  student_id: string;
  full_name:  string;
  email:      string | null;
  department: string | null;
}

interface ImportResult {
  imported: number;
  updated:  number;
  skipped:  number;
  errors:   string[];
}

// RFC 4180-lite CSV: handles quoted fields and embedded commas/quotes/newlines.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip; \n handles row break */ }
      else { field += c; }
    }
  }
  // Flush last field/row if file doesn't end with newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(cell => cell.trim().length > 0));
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file form field is required.' }, { status: 400 });
  }

  const filename = file.name.toLowerCase();
  const isXlsx = filename.endsWith('.xlsx') || file.type.includes('spreadsheetml');
  const isCsv  = filename.endsWith('.csv')  || file.type.includes('csv') || file.type === 'text/plain';

  if (isXlsx) {
    return NextResponse.json(
      { error: 'XLSX import not yet wired (Phase A.1). Convert to CSV and retry.' },
      { status: 415 },
    );
  }
  if (!isCsv) {
    return NextResponse.json({ error: 'Only CSV is supported in Phase A.' }, { status: 415 });
  }

  const text = await file.text();
  const rows = parseCSV(text);
  if (rows.length < 2) {
    return NextResponse.json({ error: 'CSV must contain a header row and at least one data row.' }, { status: 400 });
  }

  const header = rows[0]!.map(normalizeHeader);
  const idIdx   = header.indexOf('student_id');
  const nameIdx = header.indexOf('full_name');
  const mailIdx = header.indexOf('email');
  const deptIdx = header.indexOf('department');

  if (idIdx === -1 || nameIdx === -1) {
    return NextResponse.json({ error: 'Required headers: student_id, full_name (email and department optional).' }, { status: 400 });
  }

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const valid: Row[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const lineNo = i + 1;
    const sid  = (r[idIdx] ?? '').trim();
    const name = (r[nameIdx] ?? '').trim();
    const mail = mailIdx >= 0 ? (r[mailIdx] ?? '').trim().toLowerCase() : '';
    const dept = deptIdx >= 0 ? (r[deptIdx] ?? '').trim() : '';

    if (!sid || !name) {
      result.skipped++;
      result.errors.push(`Line ${lineNo}: missing student_id or full_name`);
      continue;
    }
    if (!STUDENT_ID_RE.test(sid)) {
      result.skipped++;
      result.errors.push(`Line ${lineNo}: invalid student_id "${sid}"`);
      continue;
    }
    if (mail && !EMAIL_RE.test(mail)) {
      result.skipped++;
      result.errors.push(`Line ${lineNo}: invalid email "${mail}"`);
      continue;
    }

    valid.push({
      student_id: sid,
      full_name:  name,
      email:      mail || null,
      department: dept || null,
    });
  }

  if (valid.length === 0) {
    return NextResponse.json(result, { status: 200 });
  }

  // Determine which student_ids already exist to split insert vs update counters
  const ids = valid.map(v => v.student_id);
  const { data: existing } = await supabase
    .from('students')
    .select('student_id')
    .in('student_id', ids);
  const existingSet = new Set((existing ?? []).map(r => r.student_id));

  // Upsert all rows in one shot (Postgres ON CONFLICT via Supabase)
  const { error: upsertError } = await supabase
    .from('students')
    .upsert(valid, { onConflict: 'student_id' });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message, partial: result }, { status: 500 });
  }

  for (const v of valid) {
    if (existingSet.has(v.student_id)) result.updated++;
    else                                result.imported++;
  }

  await log({
    event_type: 'system.info',
    severity:   'info',
    user_id:    user.id,
    resource_type: 'student_import',
    action:        `Bulk student import: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped`,
    metadata:      { filename: file.name, ...result, error_count: result.errors.length },
  });

  return NextResponse.json(result);
}
