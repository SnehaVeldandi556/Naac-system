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
    Asks Qwen to generate an optimized vector search query.
    If Groq is offline or not configured, falls back to joining title + description key terms.
    """
    if not config.is_groq_configured():
        # Fallback keyword/phrase generation
        words = f"{title} {description}"
        # Keep only unique alphanumeric words of length > 3
        unique_words = []
        for w in words.split():
            clean = "".join(filter(str.isalnum, w)).lower()
            if len(clean) > 3 and clean not in unique_words:
                unique_words.append(clean)
        return " ".join(unique_words[:10])

    try:
        client = get_groq_client()
        prompt = f"""You are a search query optimizer. Given a NAAC metric heading and description, output a single line containing 4 to 8 keywords or search phrases separated by spaces that are optimal for finding relevant documents using vector search. 
DO NOT output introductory text, markdown formatting, or numbering.

Metric {metric_id}: {title}
Description: {description}

Search Keywords:"""
        
        response = client.chat.completions.create(
            messages=[
                {"role": "user", "content": prompt}
            ],
            model=config.GROQ_MODEL,
            max_tokens=50,
            temperature=0.1
        )
        query = response.choices[0].message.content.strip().strip('"').strip("'")
        return query
    except Exception as e:
        print(f"Error generating query via LLM: {e}. Using title keywords.")
        return f"{title} keywords"

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
        
    context_text = "\n\n".join([
        f"[Source Doc: Page {c.get('page_no', 'N/A')}, Section: {c.get('section_heading', 'N/A')}]\n{c.get('chunk_text', '')}"
        for c in context_chunks
    ])
    
    schema_json = json.dumps(QualitativeExtractionSchema.model_json_schema(), indent=2)
    
    system_prompt = f"""You are an expert NAAC accreditation reporting assistant. Your task is to extract information and write a formal qualitative response for a self-study report.

You will be given context text retrieved from the college's uploaded documents. You must write a descriptive narrative response of 300 to 500 words for the metric, extract a list of key initiatives, and identify supporting documents mentioned.

CRITICAL ANTI-HALLUCINATION RULES:
1. You MUST ONLY use facts directly present in the context.
2. DO NOT make up policies, names, dates, or numbers.
3. If the context does not contain relevant information for this metric, you MUST output 'Data not available' for the narrative_draft and set 'data_available' to false. This is a normal, valid response.
4. Output your response as a valid JSON object matching the JSON Schema below:

{schema_json}
"""

    user_prompt = f"""NAAC Metric ID: {metric_id}
Metric Title: {title}
Metric Description: {description}

---
CONTEXT FROM UPLOADED DOCUMENTS:
{context_text if context_text.strip() else 'No documents or context chunks retrieved for this metric.'}
---

Generate the JSON response:"""

    try:
        client = get_groq_client()
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=config.GROQ_MODEL,
            response_format={"type": "json_object"},
            temperature=0.1
        )
        response_content = response.choices[0].message.content
        
        extracted_data = QualitativeExtractionSchema.model_validate_json(response_content)
        return extracted_data
        
    except Exception as e:
        print(f"Extraction or validation failed for metric {metric_id}: {e}")
        print("Falling back to a clean 'Data not available' response for safety.")
        return QualitativeExtractionSchema(
            metric_id=metric_id,
            narrative_draft="Data not available",
            key_initiatives=[],
            data_available=False,
            supporting_documents=[]
        )
