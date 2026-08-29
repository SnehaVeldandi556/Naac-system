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

def retrieve_chunks_supabase_rest(query: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Connects to Supabase via REST API and performs Hybrid Search with Reciprocal Rank Fusion.
    Uses existing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY without requiring direct DB passwords.
    """
    import requests
    query_emb = embeddings.get_embedding(query)

    headers = {
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}"
    }

    url = f"{config.SUPABASE_URL}/rest/v1/document_chunks?select=chunk_text,page_no,section_heading,department,academic_year,embedding&embedding=not.is.null&limit=200"
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code != 200:
            print(f"Supabase REST error: {resp.status_code} {resp.text}")
            return retrieve_chunks_mock(query, limit)

        rows = resp.json()
        if not rows:
            return retrieve_chunks_mock(query, limit)

        # 1. Cosine similarity ranking
        vector_results = []
        for r in rows:
            emb = r.get("embedding")
            if isinstance(emb, str):
                try:
                    emb = json.loads(emb)
                except Exception:
                    continue
            if not emb:
                continue
            sim = embeddings.cosine_similarity(query_emb, emb)
            doc_copy = {
                "chunk_text": r.get("chunk_text", ""),
                "page_no": r.get("page_no"),
                "section_heading": r.get("section_heading"),
                "department": r.get("department"),
                "academic_year": r.get("academic_year"),
                "similarity": sim
            }
            vector_results.append((sim, doc_copy))

        vector_results.sort(key=lambda x: x[0], reverse=True)
        vector_ranked = [item for sim, item in vector_results if sim > 0.1]

        # 2. Keyword overlap ranking
        keyword_results = []
        query_words = set(w.strip(".,;:?!'\"()").lower() for w in query.split() if len(w) > 3)
        for r in rows:
            text = (r.get("chunk_text") or "") + " " + (r.get("section_heading") or "")
            chunk_words = set(w.strip(".,;:?!'\"()").lower() for w in text.split() if len(w) > 3)
            overlap = len(query_words.intersection(chunk_words))
            score = float(overlap) / len(query_words) if len(query_words) > 0 else 0.0
            doc_copy = {
                "chunk_text": r.get("chunk_text", ""),
                "page_no": r.get("page_no"),
                "section_heading": r.get("section_heading"),
                "department": r.get("department"),
                "academic_year": r.get("academic_year"),
                "similarity": score
            }
            keyword_results.append((score, doc_copy))

        keyword_results.sort(key=lambda x: x[0], reverse=True)
        keyword_ranked = [item for score, item in keyword_results if score > 0.0]

        # 3. Apply Reciprocal Rank Fusion (RRF)
        fused = reciprocal_rank_fusion(vector_ranked, keyword_ranked, limit=limit)
        if not fused:
            return [item for _, item in vector_results[:limit]]
        return fused
    except Exception as e:
        print(f"Error querying Supabase REST: {e}. Falling back to mock...")
        return retrieve_chunks_mock(query, limit)

def retrieve_relevant_chunks(query: str, limit: int = 3) -> List[Dict[str, Any]]:
    """Primary entrypoint for document chunk retrieval."""
    if config.is_db_configured():
        return retrieve_chunks_supabase(query, limit)
    elif config.is_supabase_configured():
        return retrieve_chunks_supabase_rest(query, limit)
    else:
        return retrieve_chunks_mock(query, limit)
