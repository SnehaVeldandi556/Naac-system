import json
import os
from jinja2 import Environment, FileSystemLoader
import tables as table_utils
import database

def render_ssr_report(data_file: str = "compiled_ssr_data.json", template_dir: str = "templates", template_name: str = "ssr_template.html") -> str:
    """
    Reads the compiled SSR JSON data and renders the final SSR HTML report
    using the configured Jinja2 template. Automatically ensures all mapped Excel
    and tabular registers are structured and displayed as HTML tables.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_path = os.path.join(script_dir, data_file)
    template_path = os.path.join(script_dir, template_dir)
    
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Compiled SSR data file '{data_path}' not found. Please run pipeline first.")
        
    # Configure Jinja2 Environment
    env = Environment(loader=FileSystemLoader(template_path))
    template = env.get_template(template_name)
    
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Enrich metrics with Excel/tabular datasets
    data_modified = False
    for criterion in data.get("criteria", []):
        for metric in criterion.get("metrics", []):
            m_id = metric.get("id", "")
            m_title = metric.get("title", "")
            
            try:
                chunks = database.retrieve_relevant_chunks(m_title, limit=5, metric_id=m_id)
                found_tables = table_utils.extract_tables_from_context_chunks(chunks, metric_id=m_id)
                if found_tables:
                    metric["tables"] = found_tables
                    data_modified = True
            except Exception as e:
                print(f"Warning: could not lookup tabular chunks for {m_id}: {e}")

            # Also check if narrative draft contains markdown tables
            draft = metric.get("narrative_draft", "")
            if draft and "|" in draft:
                md_tables, clean_draft = table_utils.extract_markdown_tables(draft)
                if md_tables:
                    existing = metric.get("tables", [])
                    for mt in md_tables:
                        if not any(et.get("title") == mt.get("title") for et in existing):
                            existing.append(mt)
                    metric["tables"] = existing
                    data_modified = True

    # Persist enriched data back to JSON so subsequent views retain tables
    if data_modified:
        try:
            with open(data_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    # Render template with tabular data
    html_content = template.render(
        institution_name=data.get("institution_name", "Pillai College of Engineering"),
        vision=data.get("vision", ""),
        mission=data.get("mission", ""),
        criteria=data.get("criteria", [])
    )
    
    # Save output in the parent directory (project root)
    project_root = os.path.dirname(script_dir)
    output_filename = os.path.join(project_root, "ssr_report.html")
    with open(output_filename, "w", encoding="utf-8") as f:
        f.write(html_content)

    # Save to public directory for Next.js web preview (/ssr_report.html)
    public_dir = os.path.join(project_root, "public")
    if os.path.exists(public_dir):
        public_filename = os.path.join(public_dir, "ssr_report.html")
        with open(public_filename, "w", encoding="utf-8") as f:
            f.write(html_content)

    print(f"Beautifully rendered SSR report generated at: {os.path.abspath(output_filename)}")
    return output_filename
