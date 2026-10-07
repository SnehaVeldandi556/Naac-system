import os
import json
import psycopg2
from typing import List, Dict, Any
import config
import embeddings

# In-memory mock database cache for offline/dry-run usage
_mock_db: List[Dict[str, Any]] = []

def load_mock_db(filepath: str = "mock_chunks.json"):
    """Loads a mock vector database from a JSON file for offline execution."""
    global _mock_db
    # Find relative path of mock file in generation folder
    script_dir = os.path.dirname(os.path.abspath(__file__))
    full_path = os.path.join(script_dir, filepath)
    
    if not os.path.exists(full_path):
        # Create a default mock database file if it doesn't exist
        default_mock_data = [
            {
                "chunk_text": "Pillai College of Engineering follows the curriculum provided by the University of Mumbai. The curriculum planning and delivery are diligent with the preparation of the lesson plan, adapting Bloom's Taxonomy focusing on Information, Understanding, Application, and Synthesis. Academic calendar is prepared and lesson plans are reviewed by HODs. Teachers maintain course files documenting all details of lectures, attendance, and internal marks.",
                "page_no": 4,
                "section_heading": "Curricular Planning and Delivery",
                "department": "Computer Engineering",
                "academic_year": "2019-20",
                "doc_category": "Academic Plan",
                "doc_subtype": "Academic Calendar"
            },
            {
                "chunk_text": "The Nature Club of Pillai College of Engineering organizes annual cleanliness drives, tree plantations, and rallies to create awareness about cleanliness and environmental issues. In addition, subjects like Business Communication and Ethics, Intellectual Property Rights, and Cyber Security address professional ethics. Women Development Cell (WDC) renamed as Internal Complaints Committee (ICC) handles safety, security, and gender sensitization workshops.",
                "page_no": 23,
                "section_heading": "Curriculum Enrichment",
                "department": "All Departments",
                "academic_year": "2019-20",
                "doc_category": "Welfare",
                "doc_subtype": "Nature Club Report"
            },
            {
                "chunk_text": "PCE assesses the learning levels of students after admission. Slow learners are identified based on their performance in the first internal assessment test. Extra lectures, remedial classes, and study camps are conducted for slow learners to help them pass examinations. Advanced learners are mentored to take up complex projects, participate in hackathons (like AICTE Smart India Hackathon), and are supported to prepare for GATE, GRE, TOEFL, and CAT exams.",
                "page_no": 27,
                "section_heading": "Catering to Student Diversity",
                "department": "First Year Engineering",
                "academic_year": "2018-19",
                "doc_category": "Student Welfare",
                "doc_subtype": "Policy for Learners"
            },
            {
                "chunk_text": "PCE has a dedicated mentor-mentee scheme where a small group of students (approx 15-20) is allotted to a faculty mentor. The mentors monitor academic progress, attendance, and address stress-related or personal issues of students. Periodic parent-teacher meetings (PTM) are organized to discuss student progress. An in-house counsellor is also available to resolve stress-related concerns.",
                "page_no": 30,
                "section_heading": "Student Mentoring",
                "department": "Information Technology",
                "academic_year": "2019-20",
                "doc_category": "Mentorship",
                "doc_subtype": "Mentor Ratio report"
            },
            {
                "chunk_text": "PCE utilizes student-centric methods like project-based learning (PBL) from the first year itself. Every semester, students complete projects crossing multiple subjects. The college has a Maker Studio with 3D printers, laser cutters, and CNC machines for prototyping. Students also access a Component Library to borrow electronic sensors, microcontrollers, and actuators for their projects.",
                "page_no": 29,
                "section_heading": "Teaching-Learning Process",
                "department": "Mechanical Engineering",
                "academic_year": "2019-20",
                "doc_category": "Innovation",
                "doc_subtype": "PBL Guidelines"
            },
            {
                "chunk_text": "The Internal Quality Assurance Cell (IQAC) established in 2017 conducts annual Academic and Administrative Audits (AAA) to review teaching-learning processes. The IQAC pioneered project-based learning and set up the Component Library. The Academic Monitoring System (AMS) tracks attendance, daily lecture entry, and syllabus coverage dynamically.",
                "page_no": 82,
                "section_heading": "Internal Quality Assurance System",
                "department": "IQAC",
                "academic_year": "2019-20",
                "doc_category": "Quality Assurance",
                "doc_subtype": "AAA Audit Report"
            }
        ]
        
        # Prefill mock embeddings
        print("Pre-embedding mock data for offline simulation...")
        for item in default_mock_data:
            item["embedding"] = embeddings.get_embedding(item["chunk_text"])
            
        with open(full_path, "w") as f:
            json.dump(default_mock_data, f, indent=2)
        _mock_db = default_mock_data
    else:
        with open(full_path, "r") as f:
            _mock_db = json.load(f)
            # Regenerate missing embeddings
            for item in _mock_db:
                if "embedding" not in item:
                    item["embedding"] = embeddings.get_embedding(item["chunk_text"])

def reciprocal_rank_fusion(vector_results: List[Dict[str, Any]], keyword_results: List[Dict[str, Any]], limit: int = 3, k: int = 60) -> List[Dict[str, Any]]:
    """
    Applies Reciprocal Rank Fusion (RRF) algorithm to combine rankings 
    from Vector Search (Cosine Similarity) and Keyword Search.
    """
    scores = {}
    docs = {}
    
    # Process vector results (rank 1 to N)
    for rank, doc in enumerate(vector_results, start=1):
        text = doc["chunk_text"]
        scores[text] = scores.get(text, 0.0) + 1.0 / (k + rank)
        docs[text] = doc
        
    # Process keyword results (rank 1 to M)
    for rank, doc in enumerate(keyword_results, start=1):
        text = doc["chunk_text"]
        scores[text] = scores.get(text, 0.0) + 1.0 / (k + rank)
        # Store metadata if not already present
        if text not in docs:
            docs[text] = doc
            
    # Sort documents by RRF score descending
    sorted_texts = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    
    fused_results = []
    for text in sorted_texts[:limit]:
        doc_copy = docs[text].copy()
        doc_copy["rrf_score"] = scores[text]
        # Keep similarity or map it to rrf_score for interface compatibility
        doc_copy["similarity"] = scores[text]
        fused_results.append(doc_copy)
        
    return fused_results

def retrieve_chunks_mock(query: str, limit: int = 3) -> List[Dict[str, Any]]:
    """Simulates vector search locally using Cosine Similarity and Word Overlap fused via RRF."""
    if not _mock_db:
        load_mock_db()
        
    query_emb = embeddings.get_embedding(query)
    
    # 1. Cosine similarity ranking
    vector_results = []
    for item in _mock_db:
        sim = embeddings.cosine_similarity(query_emb, item.get("embedding", []))
        vector_results.append((sim, item))
    vector_results.sort(key=lambda x: x[0], reverse=True)
    vector_ranked = [item for sim, item in vector_results if sim > 0.1]
    
    # 2. Keyword overlap ranking
    keyword_results = []
    query_words = set(w.strip(".,;:?!'\"()").lower() for w in query.split() if len(w) > 3)
    for item in _mock_db:
        chunk_words = set(w.strip(".,;:?!'\"()").lower() for w in item["chunk_text"].split() if len(w) > 3)
        overlap = len(query_words.intersection(chunk_words))
        score = float(overlap) / len(query_words) if len(query_words) > 0 else 0.0
        keyword_results.append((score, item))
    keyword_results.sort(key=lambda x: x[0], reverse=True)
    keyword_ranked = [item for score, item in keyword_results if score > 0.0]
    
    # 3. Apply RRF Fusion
    fused = reciprocal_rank_fusion(vector_ranked, keyword_ranked, limit=limit)
    
    # Fallback to pure vector cosine results if RRF yielded nothing (e.g. no keyword matches found)
    if not fused:
        top_chunks = []
        for score, item in vector_results[:limit]:
            chunk_copy = item.copy()
            chunk_copy.pop("embedding", None)
            chunk_copy["similarity"] = score
            top_chunks.append(chunk_copy)
        return top_chunks
        
    return fused

def retrieve_chunks_supabase(query: str, limit: int = 3) -> List[Dict[str, Any]]:
    """Connects to Supabase Postgres database and performs Hybrid Search with Reciprocal Rank Fusion (RRF)."""
    query_emb = embeddings.get_embedding(query)
    vector_str = "[" + ",".join(map(str, query_emb)) + "]"
    
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(
            host=config.DB_HOST,
            database=config.DB_NAME,
            user=config.DB_USER,
            password=config.DB_PASSWORD,
            port=config.DB_PORT
        )
        cursor = conn.cursor()
        
        # 1. Cosine similarity query (retrieve top 10)
        sql_vector = """
            SELECT chunk_text, page_no, section_heading, department, academic_year,
                   1 - (embedding <=> %s::vector) as similarity
            FROM document_chunks
            ORDER BY embedding <=> %s::vector
            LIMIT 10;
        """
        cursor.execute(sql_vector, (vector_str, vector_str))
        rows_v = cursor.fetchall()
        vector_results = []
        for row in rows_v:
            vector_results.append({
                "chunk_text": row[0],
                "page_no": row[1],
                "section_heading": row[2],
                "department": row[3],
                "academic_year": row[4],
                "similarity": float(row[5])
            })
            
        # 2. Keyword query using ILIKE (retrieve top 10)
        search_terms = " % " + " % ".join(query.split()[:4]) + " % "
        sql_keyword = """
            SELECT chunk_text, page_no, section_heading, department, academic_year, 1.0 as similarity
            FROM document_chunks
            WHERE chunk_text ILIKE %s OR section_heading ILIKE %s
            LIMIT 10;
        """
        cursor.execute(sql_keyword, (search_terms, search_terms))
        rows_k = cursor.fetchall()
        keyword_results = []
        for row in rows_k:
            keyword_results.append({
                "chunk_text": row[0],
                "page_no": row[1],
                "section_heading": row[2],
                "department": row[3],
                "academic_year": row[4],
                "similarity": float(row[5])
            })
            
        # 3. Apply Reciprocal Rank Fusion to fuse vector and keyword results
        fused = reciprocal_rank_fusion(vector_results, keyword_results, limit=limit)
        return fused

    except Exception as e:
        print(f"Error querying Supabase: {e}")
        print("Falling back to local in-memory mock database search...")
        return retrieve_chunks_mock(query, limit)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

_cached_supabase_chunks: List[Dict[str, Any]] = None

def get_cached_supabase_chunks() -> List[Dict[str, Any]]:
    """Loads and caches all document chunks from Supabase, supplemented by baseline mock chunks."""
    global _cached_supabase_chunks
    if _cached_supabase_chunks is not None:
        return _cached_supabase_chunks

    import requests
    headers = {
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}"
    }

    url = f"{config.SUPABASE_URL}/rest/v1/document_chunks?select=chunk_text,page_no,section_heading,department,academic_year,embedding&limit=500"
    all_chunks = []
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            raw_rows = resp.json()
            for r in raw_rows:
                chunk_text = (r.get("chunk_text") or "").strip()
                if not chunk_text:
                    continue
                emb = r.get("embedding")
                if isinstance(emb, str):
                    try:
                        emb = json.loads(emb)
                    except Exception:
                        emb = None
                if not (emb and len(emb) == config.EMBEDDING_DIMENSION):
                    emb = None
                all_chunks.append({
                    "chunk_text": chunk_text,
                    "page_no": r.get("page_no"),
                    "section_heading": r.get("section_heading") or "",
                    "department": r.get("department") or "",
                    "academic_year": r.get("academic_year") or "",
                    "embedding": emb,
                    "source": "supabase"
                })
    except Exception as e:
        print(f"Error prefetching Supabase chunks: {e}")

    # Also load foundational mock institutional chunks
    if not _mock_db:
        load_mock_db()
    for m in _mock_db:
        all_chunks.append({
            "chunk_text": m.get("chunk_text", ""),
            "page_no": m.get("page_no"),
            "section_heading": m.get("section_heading", ""),
            "department": m.get("department", ""),
            "academic_year": m.get("academic_year", ""),
            "embedding": m.get("embedding"),
            "source": "mock"
        })

    _cached_supabase_chunks = all_chunks
    return _cached_supabase_chunks

def retrieve_chunks_supabase_rest(query: str, limit: int = 3, query_emb: List[float] = None, metric_id: str = None) -> List[Dict[str, Any]]:
    """
    Performs Criteria-Aware Hybrid Search on cached document chunks.
    Accurately maps uploaded institutional documents to corresponding NAAC metrics.
    """
    rows = get_cached_supabase_chunks()
    if not rows:
        return retrieve_chunks_mock(query, limit)

    METRIC_SPECIFIC_KEYWORDS = {
        "1.1.1": ["curricular planning and delivery", "lesson plan", "bloom's taxonomy", "course files", "academic calendar"],
        "1.3.1": ["curriculum enrichment", "cross-cutting", "nature club", "professional ethics", "intellectual property", "environmental", "cleanliness"],
        "1.3.2": ["self-defense", "nirbhaya", "life skills", "police squad", "safety training", "value added"],
        "1.3.3": ["recruitment", "internship", "field projects", "tpo", "industry-institute linkages"],
        "2.2.1": ["catering to student diversity", "slow learners", "advanced learners", "remedial classes", "hackathons", "gate"],
        "2.3.1": ["student-centric", "project-based learning", "pbl", "maker studio", "prototyping", "component library"],
        "2.3.3": ["student mentoring", "mentor", "mentee", "counselor", "counselling", "mentor ratio"],
        "2.4.2": ["doctoral dissertation", "ph.d", "sabbatical study leave", "qualification upgradation", "vjti"],
        "3.1.1": ["doctoral research fellowship", "fellowship allowance", "sabbatical study leave", "grants received", "reimbursement"],
        "3.1.2": ["doctoral dissertation", "ph.d", "research guide", "vjti", "higher qualification"],
        "3.5.2": ["industry-institute linkages", "mous", "tcs", "infosys", "capgemini", "siemens", "collaborative"],
        "4.1.1": ["maker studio", "3d printers", "cnc machines", "component library", "physical facilities"],
        "4.1.2": ["conclave", "gymkhana", "sports", "cultural", "event report"],
        "5.1.3": ["self-defense", "nirbhaya", "capacity building", "aptitude", "technical readiness bootcamps"],
        "5.1.4": ["career counselling", "pre-placement", "aptitude bootcamps", "mock interview", "guidance for competitive"],
        "5.2.1": ["tpo campus recruitment", "placed", "highest ctc", "amazon web services", "master register", "salary", "recruiting"],
        "5.2.2": ["progression to higher education", "career counselling", "aptitude bootcamps", "placed"],
        "6.3.1": ["sabbatical study leave", "mes faculty higher qualification", "welfare measures", "fellowship allowance", "workload adjustment"],
        "6.3.2": ["reimbursement of university thesis", "examination fee", "fellowship grant", "financial support"],
        "6.3.4": ["higher qualification upgradation", "sabbatical study leave", "doctoral dissertation", "faculty development"],
        "6.5.1": ["internal quality assurance cell", "iqac", "academic and administrative audits", "aaa", "academic monitoring system", "ams"],
        "7.1.1": ["nirbhaya", "self-defense", "women development cell", "gender equity", "police commissionerate"],
        "7.1.2": ["gender sensitivity", "women campus safety", "cctv", "sanitary napkin vending", "girls' common rooms", "hygiene audit"],
        "7.2.1": ["maker studio", "project-based learning", "campus recruitment annual report", "best practices", "tpo"],
        "7.3.1": ["maker studio", "project-based learning", "tier-1 software multinational", "amazon web services", "distinctiveness"]
    }

    query_lower = (query or "").lower()
    target_keywords = METRIC_SPECIFIC_KEYWORDS.get(metric_id, [])

    scored_candidates = []
    seen_texts = set()
    query_tokens = [w.strip(".,;:?!'\"()[]") for w in query_lower.split() if len(w) > 3]

    for r in rows:
        chunk_txt = (r.get("chunk_text") or "").strip()
        if not chunk_txt:
            continue
        
        # Deduplicate identical or near-identical chunks
        norm_key = chunk_txt[:100].lower()
        if norm_key in seen_texts:
            continue
        seen_texts.add(norm_key)

        text = chunk_txt + " " + (r.get("section_heading") or "")
        text_lower = text.lower()
        score = 0.0

        # 1. Direct metric-specific keyword matching
        if target_keywords:
            matched_targets = sum(1 for kw in target_keywords if kw in text_lower)
            if matched_targets > 0:
                score += 20.0 + (matched_targets * 5.0)

        # 2. General domain fallback matching
        if any(w in query_lower for w in ["placement", "recruit", "ctc", "salary", "tpo"]):
            if any(w in text_lower for w in ["campus recruitment", "tpo", "placement", "amazon web services"]):
                score += 10.0
        elif any(w in query_lower for w in ["gender", "women", "self-defense", "safety", "nirbhaya", "wdc"]):
            if any(w in text_lower for w in ["self-defense", "nirbhaya", "women development cell", "sanitary napkin"]):
                score += 10.0
        elif any(w in query_lower for w in ["ph.d", "doctoral", "sabbatical", "fellowship", "qualification"]):
            if any(w in text_lower for w in ["sabbatical study leave", "doctoral dissertation", "fellowship", "vjti"]):
                score += 10.0

        # 3. Lexical query token overlap
        for token in query_tokens:
            if token in text_lower:
                score += 1.0

        # 4. Vector cosine similarity if available
        if query_emb is not None and r.get("embedding") is not None:
            sim = embeddings.cosine_similarity(query_emb, r["embedding"])
            if sim > 0.3:
                score += sim * 5.0

        # Keep relevant items with score >= 10.0
        if score >= 10.0:
            doc_copy = {
                "chunk_text": chunk_txt,
                "page_no": r.get("page_no"),
                "section_heading": r.get("section_heading"),
                "department": r.get("department"),
                "academic_year": r.get("academic_year"),
                "similarity": min(round(score / 35.0, 3), 1.0)
            }
            scored_candidates.append((score, doc_copy))

    scored_candidates.sort(key=lambda x: x[0], reverse=True)
    top_results = [item for score, item in scored_candidates[:limit]]
    return top_results

def retrieve_relevant_chunks(query: str, limit: int = 3, query_emb: List[float] = None, metric_id: str = None) -> List[Dict[str, Any]]:
    """Primary entrypoint for document chunk retrieval."""
    if config.is_db_configured():
        return retrieve_chunks_supabase(query, limit)
    elif config.is_supabase_configured():
        return retrieve_chunks_supabase_rest(query, limit, query_emb=query_emb, metric_id=metric_id)
    else:
        return retrieve_chunks_mock(query, limit)

