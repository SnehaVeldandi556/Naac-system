import re
from typing import List, Dict, Any, Tuple

def clean_cell(c: str) -> str:
    """Cleans table cell text by removing field labels and excessive whitespace."""
    if not isinstance(c, str):
        return str(c)
    c = c.strip()
    c = re.sub(r'^(Recruiter|Offered CTC|Offer Date|Salary CTC|Company|Package|CTC|Status):\s*', '', c, flags=re.IGNORECASE)
    return c.strip()

def extract_markdown_tables(text: str) -> Tuple[List[Dict[str, Any]], str]:
    """
    Finds markdown tables in a narrative string, converts them to structured dicts,
    and removes or leaves the clean narrative.
    """
    tables = []
    if not text or "|" not in text:
        return tables, text

    lines = text.split("\n")
    table_lines = []
    in_table = False
    clean_lines = []

    for line in lines:
        stripped = line.strip()
        if "|" in stripped and (stripped.startswith("|") or stripped.endswith("|") or " | " in stripped):
            in_table = True
            table_lines.append(stripped)
        else:
            if in_table and len(table_lines) >= 2:
                tbl = _parse_pipe_lines_to_table(table_lines, title="Statistical / Quantitative Overview")
                if tbl:
                    tables.append(tbl)
                table_lines = []
                in_table = False
            clean_lines.append(line)

    if in_table and len(table_lines) >= 2:
        tbl = _parse_pipe_lines_to_table(table_lines, title="Statistical / Quantitative Overview")
        if tbl:
            tables.append(tbl)

    return tables, "\n".join(clean_lines).strip()

def _parse_pipe_lines_to_table(pipe_lines: List[str], title: str = "Quantitative Data") -> Dict[str, Any] | None:
    """Parses raw lines with pipes into headers and rows."""
    raw_rows = []
    for l in pipe_lines:
        if re.match(r'^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$', l):
            continue
        parts = [clean_cell(p) for p in l.split("|")]
        if parts and parts[0] == "":
            parts = parts[1:]
        if parts and parts[-1] == "":
            parts = parts[:-1]
        if len(parts) >= 2:
            raw_rows.append(parts)

    if len(raw_rows) >= 2:
        headers = raw_rows[0]
        data_rows = raw_rows[1:]
        return {
            "title": title,
            "headers": headers,
            "rows": data_rows
        }
    return None

def extract_tables_from_context_chunks(chunks: List[Dict[str, Any]], metric_id: str = "") -> List[Dict[str, Any]]:
    """
    Extracts tabular/Excel data from retrieved document chunks.
    Accurately maps Excel registers (student placement offers, salary CTC, MoU companies,
    quantitative spreadsheets) into structured HTML-ready tables.
    """
    tables = []
    if not chunks:
        return tables

    # 1. Placement Master Register Table (e.g. Metric 5.2.1, 7.2.1, 7.3.1)
    register_rows = []
    register_title = "TPO Campus Recruitment Master Register (Student-Wise Offers & Salary CTC)"
    
    for c in chunks:
        txt = c.get("chunk_text", "")
        for line in txt.split("\n"):
            line = line.strip()
            # Match lines like "1. Sharma Aarav (Roll: 2020IT0001) | B.Tech Information Technology | Recruiter: TCS | Offered CTC: 7.5 LPA | Offer Date: 15-09-2023"
            if "|" in line and re.match(r'^\d+[\.\)]\s+', line):
                parts = [clean_cell(p) for p in line.split("|")]
                if len(parts) >= 4:
                    num_match = re.match(r'^(\d+)[\.\)]\s*(.*)', parts[0])
                    if num_match:
                        sr_no = num_match.group(1)
                        student_info = num_match.group(2).strip()
                        row = [sr_no, student_info] + parts[1:]
                    else:
                        row = parts
                    register_rows.append(row)

    if register_rows:
        seen = set()
        dedup_rows = []
        for r in register_rows:
            key = r[0] if len(r) > 0 else str(r)
            if key not in seen:
                seen.add(key)
                dedup_rows.append(r)

        headers = ["Sr. No.", "Student Name & Roll No.", "Programme / Department", "Recruiting Company", "Offered CTC", "Offer Date"]
        tables.append({
            "title": register_title,
            "headers": headers[:len(dedup_rows[0])] if dedup_rows else headers,
            "rows": dedup_rows
        })

    # 2. Company Recruiters & MoU Linkages Table (e.g. Metric 3.5.2, 1.3.3, 5.1.4)
    company_rows = []
    comp_headers = ["S.No.", "Company / Employer", "Sector / Domain", "Recruitment Mode"]
    comp_title = "Participating Corporate Recruiters & Industry Linkages (MoUs)"

    for c in chunks:
        for src in [c.get("section_heading", ""), c.get("chunk_text", "")]:
            for line in src.split("\n"):
                line = line.strip()
                if "|" in line:
                    parts = [clean_cell(p) for p in line.split("|")]
                    if len(parts) >= 3:
                        if parts[0].isdigit():
                            company_rows.append(parts)
                        elif any(w in parts[1].lower() for w in ["company", "employer", "recruiter"]):
                            comp_headers = parts

    if company_rows:
        if len(company_rows) < 5:
            try:
                import database
                all_chunks = database.get_cached_supabase_chunks()
                for c in all_chunks:
                    for src in [c.get("section_heading", ""), c.get("chunk_text", "")]:
                        for line in src.split("\n"):
                            line = line.strip()
                            if "|" in line:
                                parts = [clean_cell(p) for p in line.split("|")]
                                if len(parts) >= 3 and parts[0].isdigit():
                                    company_rows.append(parts)
            except Exception:
                pass

        seen_c = set()
        dedup_comp = []
        for r in sorted(company_rows, key=lambda x: int(x[0]) if x[0].isdigit() else 999):
            if r[0] not in seen_c:
                seen_c.add(r[0])
                dedup_comp.append(r)
        tables.append({
            "title": comp_title,
            "headers": comp_headers[:len(dedup_comp[0])] if dedup_comp else comp_headers,
            "rows": dedup_comp
        })

    # 3. Generic Excel sheets / multi-row tabular chunks
    for c in chunks:
        txt = c.get("chunk_text", "")
        heading = c.get("section_heading", "Excel Data Sheet")
        lines = [l.strip() for l in txt.split("\n") if l.strip()]
        
        # Filter out lines that are simple metadata like 'Dates: ... | Venue: ...'
        pipe_lines = [
            l for l in lines 
            if "|" in l 
            and not any(l.lower().startswith(x) for x in ["academic year", "ref no", "dates:", "venue:"])
        ]
        
        if len(pipe_lines) >= 3:
            # Skip if this is identical to chunks already captured above
            if any("Sharma Aarav" in l for l in pipe_lines) or any("Tata Consultancy Services (TCS)" in l for l in pipe_lines):
                continue
                
            tbl = _parse_pipe_lines_to_table(pipe_lines, title=heading or "Institutional Tabular Records")
            if tbl and len(tbl.get("rows", [])) >= 2:
                # Deduplicate by title
                if not any(t.get("title") == tbl["title"] for t in tables):
                    tables.append(tbl)

    return tables
