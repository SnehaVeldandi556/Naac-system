import json
import config
from typing import List, Dict, Any
from openai import OpenAI
from schemas import QualitativeExtractionSchema

def get_groq_client() -> OpenAI:
    """Initializes and returns an OpenAI client configured for Groq API."""
    if not config.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set in configuration.")
    return OpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=config.GROQ_API_KEY
    )

def generate_search_query(metric_id: str, title: str, description: str) -> str:
    """
    Extracts high-impact domain keywords from metric heading and description.
    Fast, deterministic, and avoids burning LLM rate-limit quota on search queries.
    """
    stop_words = {
        'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'been',
        'were', 'will', 'are', 'institution', 'institutions', 'ensures',
        'effective', 'through', 'including', 'such', 'other', 'into',
        'which', 'their', 'during', 'last', 'five', 'years', 'per', 'any',
        'across', 'various', 'conduct', 'level', 'program', 'programs'
    }
    words = []
    # Prioritize metric title words, then description
    for part in [title, description]:
        for w in part.split():
            clean = ''.join(c for c in w.lower() if c.isalnum())
            if len(clean) > 2 and clean not in stop_words and clean not in words:
                words.append(clean)
    
    query = ' '.join(words[:12])
    return query if query else f"{title} keywords"

def simulate_llm_extraction(metric_id: str, context: List[Dict[str, Any]]) -> QualitativeExtractionSchema:
    """Generates realistic mock extraction data for testing when Groq is not configured."""
    has_found_data = len(context) > 0 and any(c.get("similarity", 1.0) > 0.4 for c in context)
    
    if not has_found_data:
        return QualitativeExtractionSchema(
            metric_id=metric_id,
            narrative_draft="Data not available",
            key_initiatives=[],
            data_available=False,
            supporting_documents=[]
        )
        
    if metric_id == "1.1.1":
        return QualitativeExtractionSchema(
            metric_id=metric_id,
            narrative_draft="Pillai College of Engineering (PCE) maintains a highly structured, well-planned, and documented curriculum delivery system. PCE aligns its academic operations with the calendar set by the University of Mumbai. Prior to each term, an Academic and Administrative Activity Planner (AAAP) is drawn up. Faculty members prepare comprehensive lesson plans detailing weekly lecture schedules, syllabus topics, and pedagogic tools. Course files are meticulously compiled containing lecture contents, student attendance records, assignments, and test question papers. The teaching process integrates active learning methodologies, prominently featuring project-based learning (PBL) from the first year onwards. This ensures students apply theoretical concepts in practical settings, reinforced by modern e-learning systems like Google Classroom.",
            key_initiatives=[
                "Formulation of the Academic and Administrative Activity Planner (AAAP) prior to term start.",
                "Preparation and mandatory review of course files and weekly lesson plans by HODs.",
                "Implementation of Project-Based Learning (PBL) starting from First Year of Engineering.",
                "Adoption of Academic Monitoring System (AMS) to track daily syllabus completion."
            ],
            data_available=True,
            supporting_documents=["Academic Calendar 2019-20", "AAAP Directive", "Sample Course File - Computer Engineering"]
        )
    elif metric_id == "1.3.1":
        return QualitativeExtractionSchema(
            metric_id=metric_id,
            narrative_draft="The curriculum at Pillai College of Engineering integrates critical cross-cutting issues like professional ethics, gender equality, human values, and environmental sustainability. PCE incorporates mandatory courses covering Business Communication and Ethics, Intellectual Property Rights, and Cyber Security. The college runs an active Nature Club which organizes tree plantation activities, river cleanliness drives (specifically for the Gadhi River), and environmental awareness campaigns to build ecological responsibility. Furthermore, gender sensitivity is institutionalized through safety cells like the Women Development Cell (renamed as the Internal Complaints Committee) which organizes self-defense programs, legal awareness sessions, and supports girl students to succeed in technical streams.",
            key_initiatives=[
                "Mandatory integration of ethics, cybersecurity, and IPR courses into academic cycles.",
                "Active Nature Club organizing environmental drives, including the Gadhi River cleaning project.",
                "Women Development Cell/Internal Complaints Committee conducting self-defense and safety workshops.",
                "Integration of environmental study modules in first-year engineering curriculums."
            ],
            data_available=True,
            supporting_documents=["Nature Club Annual Report 2019", "Ethics Course Syllabus", "ICC Grievance Policy"]
        )
    elif metric_id == "2.2.1":
        return QualitativeExtractionSchema(
            metric_id=metric_id,
            narrative_draft="Pillai College of Engineering assesses student learning capacity immediately after admission to implement tailored academic strategies. Slow learners are identified via initial internal assessments and continuous evaluations. The institute supports slow learners by scheduling extra lectures, remedial classes, and study camp sessions. Additionally, a dedicated mentor-mentee scheme is deployed where faculty mentors provide personalized counseling and monitor student progress. For advanced learners, the college offers challenges to foster excellence, including sponsorship to national hackathons (Smart India Hackathon) and specialized guidance classes for competitive exams such as GATE, GRE, TOEFL, and CAT.",
            key_initiatives=[
                "Identification of slow learners based on first internal evaluation tests.",
                "Conduction of remedial classes, study camps, and mock exams during non-academic hours.",
                "Dedicated mentoring sessions with faculty mentors to track stress and performance issues.",
                "Guidance classes and academic sponsorships for advanced learners preparing for GATE/GRE."
            ],
            data_available=True,
            supporting_documents=["Remedial Class Attendance Sheet", "Mentoring Scheme Guidelines", "GATE Preparation Schedule"]
        )
    else:
        return QualitativeExtractionSchema(
            metric_id=metric_id,
            narrative_draft="Pillai College of Engineering demonstrates structured operations aligned with this metric. Relevant documentation, policies, and committees exist to support institutional guidelines. (Mock data generated for demonstration purposes).",
            key_initiatives=[
                f"Implementation of key activities related to NAAC metric {metric_id}.",
                "Regular evaluation and updates of the processes by institutional committees.",
                "Active participation of faculty and department heads in maintaining quality standards."
            ],
            data_available=True,
            supporting_documents=[f"Policy Document for Metric {metric_id}", "Committee Meeting Minutes"]
        )

def extract_qualitative_content(metric_id: str, title: str, description: str, context_chunks: List[Dict[str, Any]]) -> QualitativeExtractionSchema:
    """
    Sends the retrieved context chunks to Qwen via Groq.
    Instructs the LLM to draft the response paragraph conforming to the Pydantic schema.
    If no Groq key is present, falls back to the local simulator.
    """
    if not config.is_groq_configured():
        return simulate_llm_extraction(metric_id, context_chunks)

    # Filter chunks that actually contain meaningful text
    valid_chunks = [c for c in context_chunks if c.get("chunk_text", "").strip()]
    if not valid_chunks:
        return QualitativeExtractionSchema(
            metric_id=metric_id,
            narrative_draft="Data not available",
            key_initiatives=[],
            data_available=False,
            supporting_documents=[]
        )

    context_text = "\n\n".join([
        f"[Source Doc: Page {c.get('page_no', 'N/A')}, Section: {c.get('section_heading', 'N/A')}]\n{c.get('chunk_text', '')}"
        for c in valid_chunks
    ])

    system_prompt = """You are an expert NAAC accreditation reporting assistant. Your task is to extract information and write a formal qualitative response for a self-study report (SSR).

CRITICAL ANTI-HALLUCINATION RULES:
1. You MUST ONLY use facts directly present in the context.
2. DO NOT make up policies, names, dates, or numbers.
3. If the context contains ANY relevant institutional data, events, policies, statistics, or reports related to this metric, synthesize a formal, comprehensive qualitative narrative (300 to 500 words) using those facts, set data_available to true, and cite the supporting documents. Only output 'Data not available' and set data_available to false if the context has no relevant information for this metric.
4. TABULAR & EXCEL DATA EXTRACTION: If the context contains tabular records, student registers, salary/CTC figures, recruiter lists, MoUs, or spreadsheet rows (often formatted with pipes '|' or columns), YOU MUST extract them into the "tables" array as structured objects with "title", "headers", and "rows". Do not flatten tabular figures solely into text paragraphs.
5. Output your response as a valid JSON object matching this schema:
{
  "metric_id": "<metric id string>",
  "narrative_draft": "<300 to 500 words descriptive narrative or 'Data not available'>",
  "key_initiatives": ["<initiative 1>", "<initiative 2>"],
  "data_available": true or false,
  "supporting_documents": ["<doc 1>", "<doc 2>"],
  "tables": [
    {
      "title": "<Table Title e.g. TPO Campus Recruitment Master Register 2023-24>",
      "headers": ["<Column 1>", "<Column 2>", "<Column 3>"],
      "rows": [
        ["<Cell 1>", "<Cell 2>", "<Cell 3>"],
        ["<Cell 1>", "<Cell 2>", "<Cell 3>"]
      ]
    }
  ]
}
Output pure JSON object only."""

    user_prompt = f"""NAAC Metric ID: {metric_id}
Metric Title: {title}
Metric Description: {description}

---
CONTEXT FROM UPLOADED DOCUMENTS:
{context_text}
---

Generate the JSON response:"""

    import time
    import re
    client = get_groq_client()
    def clean_str(s: str) -> str:
        if not isinstance(s, str):
            return ""
        replacements = {
            '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-',
            '\u2018': "'", '\u2019': "'", '\u201a': "'", '\u201b': "'",
            '\u201c': '"', '\u201d': '"', '\u201e': '"', '\ufffd': ''
        }
        for k, v in replacements.items():
            s = s.replace(k, v)
        return s.strip()

    call_params = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "model": "qwen/qwen3.8-27b",
        "temperature": 0.1,
        "max_tokens": 800,
        "timeout": 25
    }

    max_attempts = 2
    for attempt in range(max_attempts):
        try:
            response = client.chat.completions.create(**call_params)
            response_content = (response.choices[0].message.content or "").strip()

            if not response_content:
                print(f"Empty response on metric {metric_id} (attempt {attempt+1}/{max_attempts}). Retrying...", flush=True)
                time.sleep(2.0)
                continue

            # Clean markdown code fences if present
            clean = response_content
            if clean.startswith("```json"):
                clean = clean[7:]
            if clean.startswith("```"):
                clean = clean[3:]
            if clean.endswith("```"):
                clean = clean[:-3]
            clean = clean.strip()

            # Slice JSON object from first { to last }
            s_idx = clean.find('{')
            e_idx = clean.rfind('}')
            if s_idx != -1 and e_idx != -1:
                clean = clean[s_idx:e_idx+1]

            try:
                parsed = json.loads(clean)
            except Exception:
                # Fallback regex extraction of fields
                parsed = {}
                draft_match = re.search(r'"narrative_draft"\s*:\s*"([^"]+)"', response_content, re.DOTALL)
                if draft_match:
                    parsed["narrative_draft"] = draft_match.group(1)
                init_match = re.search(r'"key_initiatives"\s*:\s*\[(.*?)\]', response_content, re.DOTALL)
                if init_match:
                    parsed["key_initiatives"] = [x.strip(' "\'\n\r') for x in init_match.group(1).split(",") if x.strip()]
                avail_match = re.search(r'"data_available"\s*:\s*(true|false)', response_content, re.IGNORECASE)
                if avail_match:
                    parsed["data_available"] = (avail_match.group(1).lower() == "true")

            narrative_draft = clean_str(str(parsed.get("narrative_draft", "Data not available")).strip())
            raw_avail = parsed.get("data_available")
            if isinstance(raw_avail, bool):
                data_available = raw_avail
            elif isinstance(raw_avail, (list, dict)):
                data_available = bool(raw_avail)
            else:
                data_available = (narrative_draft.lower() != "data not available" and len(narrative_draft) > 50)

            key_initiatives = parsed.get("key_initiatives", [])
            if not isinstance(key_initiatives, list):
                key_initiatives = [str(key_initiatives)] if key_initiatives else []
            supporting_documents = parsed.get("supporting_documents", [])
            if not isinstance(supporting_documents, list):
                supporting_documents = [str(supporting_documents)] if supporting_documents else []

            raw_tables = parsed.get("tables", [])
            extracted_tables = []
            if isinstance(raw_tables, list):
                for tbl in raw_tables:
                    if isinstance(tbl, dict) and tbl.get("headers") and tbl.get("rows"):
                        extracted_tables.append({
                            "title": clean_str(str(tbl.get("title", "Mapped Quantitative / Excel Data"))),
                            "headers": [clean_str(str(h)) for h in tbl.get("headers", [])],
                            "rows": [[clean_str(str(c)) for c in row] for row in tbl.get("rows", []) if isinstance(row, list)]
                        })

            # Gentle pacing between calls to stay well within Groq 30 RPM limit
            time.sleep(1.5)
            return QualitativeExtractionSchema(
                metric_id=str(parsed.get("metric_id", metric_id)),
                narrative_draft=narrative_draft,
                key_initiatives=[clean_str(str(x)) for x in key_initiatives],
                data_available=data_available,
                supporting_documents=[clean_str(str(x)) for x in supporting_documents],
                tables=extracted_tables
            )
        except Exception as e:
            err_str = str(e)
            err_lower = err_str.lower()
            if "429" in err_lower or "rate" in err_lower or "limit" in err_lower:
                wait_sec = 4.0
                match = re.search(r"try again in ([\d\.]+)s", err_str, re.IGNORECASE)
                if match:
                    try:
                        wait_sec = min(float(match.group(1)) + 0.5, 8.0)
                    except Exception:
                        pass
                print(f"Rate limit for qwen/qwen3.8-27b on metric {metric_id} (attempt {attempt+1}/{max_attempts}). Backing off for {round(wait_sec, 1)}s...", flush=True)
                time.sleep(wait_sec)
                continue
            else:
                print(f"Issue on metric {metric_id}: {type(e).__name__} - {e}. Attempt {attempt+1}/{max_attempts}...", flush=True)
                time.sleep(1.5)
                if attempt == max_attempts - 1:
                    break

    print(f"Clean fallback for metric {metric_id} (Data not available).", flush=True)
    return QualitativeExtractionSchema(
        metric_id=metric_id,
        narrative_draft="Data not available",
        key_initiatives=[],
        data_available=False,
        supporting_documents=[]
    )
