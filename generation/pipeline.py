import json
import os
import sys
from typing import Dict, Any, List

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

import database
import llm
from schemas import QualitativeExtractionSchema

def run_generation_pipeline(structure_file: str = "ssr_structure.json", chunk_limit: int = 3) -> Dict[str, Any]:
    """
    Runs the qualitative data ingestion mapping loop.
    For each metric (QlM) in the SSR structure outline:
      1. Generates query terms.
      2. Similarity searches teammate's vector database (retains limit K=3 for cost optimization).
      3. Extracts narrative write-up via Qwen on Groq.
      4. Validates via Pydantic.
      5. Aggregates results.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    structure_path = os.path.join(script_dir, structure_file)
    
    if not os.path.exists(structure_path):
        raise FileNotFoundError(f"SSR structure outline file '{structure_path}' not found.")
        
    with open(structure_path, "r") as f:
        structure = json.load(f)
        
    compiled_results = {
        "institution_name": structure.get("institution_name", "Pillai College of Engineering"),
        "vision": structure.get("vision", ""),
        "mission": structure.get("mission", ""),
        "criteria": []
    }
    
    missing_metrics = []
    total_metrics_count = 0
    successful_extractions_count = 0
    
    print("=" * 60, flush=True)
    print(f"Starting NAAC Qualitative Ingestion Loop for {compiled_results['institution_name']}", flush=True)
    print("=" * 60, flush=True)

    # Pre-warm Supabase document chunks cache once
    print("Pre-fetching document chunks from database...", flush=True)
    database.get_cached_supabase_chunks()

    # Collect all metric items and generate search queries
    all_metric_items = []
    all_queries = []
    for criterion in structure.get("criteria", []):
        for metric in criterion.get("metrics", []):
            all_metric_items.append(metric)
            q = llm.generate_search_query(metric["id"], metric["title"], metric.get("description", ""))
            all_queries.append(q)

    # Batch embed queries for 100x retrieval acceleration
    print(f"Pre-embedding {len(all_queries)} queries in batch...", flush=True)
    import embeddings
    query_embeddings = embeddings.batch_get_embeddings(all_queries)
    query_emb_map = {m["id"]: emb for m, emb in zip(all_metric_items, query_embeddings)}
    query_text_map = {m["id"]: q for m, q in zip(all_metric_items, all_queries)}
    
    for criterion in structure.get("criteria", []):
        crit_id = criterion["id"]
        crit_title = criterion["title"]
        print(f"\nProcessing {crit_title}...", flush=True)
        
        criterion_entry = {
            "id": crit_id,
            "title": crit_title,
            "weight": criterion.get("weight", 100),
            "metrics": []
        }
        
        for metric in criterion.get("metrics", []):
            metric_id = metric["id"]
            metric_title = metric["title"]
            metric_description = metric["description"]
            metric_weight = metric.get("weight", 10)
            
            total_metrics_count += 1
            print(f"  - Metric {metric_id}: {metric_title} (Weight: {metric_weight})", flush=True)
            
            # Step 1: Lookup precomputed search keywords
            search_query = query_text_map.get(metric_id, f"{metric_title} keywords")
            metric_emb = query_emb_map.get(metric_id)
            print(f"    Search Query: \"{search_query}\"", flush=True)
            
            # Step 2: Retrieve Top-K document chunks using cached vectors and criteria routing
            context_chunks = database.retrieve_relevant_chunks(search_query, limit=chunk_limit, query_emb=metric_emb, metric_id=metric_id)
            print(f"    Retrieved {len(context_chunks)} chunks for context.", flush=True)
            
            # Step 3 & 4: Call Qwen via Groq API and validate output using Pydantic
            extraction: QualitativeExtractionSchema = llm.extract_qualitative_content(
                metric_id=metric_id,
                title=metric_title,
                description=metric_description,
                context_chunks=context_chunks
            )
            
            # Record result
            metric_result = {
                "id": metric_id,
                "title": metric_title,
                "description": metric_description,
                "weight": metric_weight,
                "narrative_draft": extraction.narrative_draft,
                "key_initiatives": extraction.key_initiatives,
                "data_available": extraction.data_available,
                "supporting_documents": extraction.supporting_documents
            }
            
            criterion_entry["metrics"].append(metric_result)
            
            # Track statistics & missing sections
            if extraction.data_available:
                successful_extractions_count += 1
                print("    Status: Extraction Successful.", flush=True)
            else:
                missing_metrics.append({
                    "id": metric_id,
                    "title": metric_title,
                    "reason": "Context did not cover this sub-criterion"
                })
                print("    Status: No Data Available (Marked for Manual Review).", flush=True)
                
        compiled_results["criteria"].append(criterion_entry)
        
    # Write output compiled data in the same directory as script
    compiled_data_path = os.path.join(script_dir, "compiled_ssr_data.json")
    with open(compiled_data_path, "w", encoding="utf-8") as f:
        json.dump(compiled_results, f, indent=2, ensure_ascii=False)
        
    # Write audit log of missing metrics
    audit_report = {
        "institution_name": compiled_results["institution_name"],
        "total_qualitative_metrics": total_metrics_count,
        "metrics_extracted": successful_extractions_count,
        "metrics_missing": len(missing_metrics),
        "missing_list": missing_metrics
    }
    missing_report_path = os.path.join(script_dir, "missing_data_report.json")
    with open(missing_report_path, "w", encoding="utf-8") as f:
        json.dump(audit_report, f, indent=2, ensure_ascii=False)
        
    print("\n" + "=" * 60)
    print("Generation Pipeline Completed!")
    print(f"Processed QlMs: {total_metrics_count} | Extracted: {successful_extractions_count} | Missing: {len(missing_metrics)}")
    print("Output saved to 'compiled_ssr_data.json' and 'missing_data_report.json'.")
    print("=" * 60)
    
    return compiled_results
