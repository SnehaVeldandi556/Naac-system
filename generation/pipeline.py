import json
import os
from typing import Dict, Any, List
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
    
    print("=" * 60)
    print(f"Starting NAAC Qualitative Ingestion Loop for {compiled_results['institution_name']}")
    print("=" * 60)
    
    for criterion in structure.get("criteria", []):
        crit_id = criterion["id"]
        crit_title = criterion["title"]
        print(f"\nProcessing {crit_title}...")
        
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
            print(f"  - Metric {metric_id}: {metric_title} (Weight: {metric_weight})")
            
            # Step 1: Generate search keywords from heading + description
            search_query = llm.generate_search_query(metric_id, metric_title, metric_description)
            print(f"    Search Query: \"{search_query}\"")
            
            # Step 2: Retrieve Top-K document chunks (Supabase or local mock vector fallback)
            # K=3 limit is maintained for cost/context optimization to prevent noise.
            context_chunks = database.retrieve_relevant_chunks(search_query, limit=chunk_limit)
            print(f"    Retrieved {len(context_chunks)} chunks for context.")
            
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
                print("    Status: Extraction Successful.")
            else:
                missing_metrics.append({
                    "id": metric_id,
                    "title": metric_title,
                    "reason": "Context did not cover this sub-criterion"
                })
                print("    Status: No Data Available (Marked for Manual Review).")
                
        compiled_results["criteria"].append(criterion_entry)
        
    # Write output compiled data in the same directory as script
    compiled_data_path = os.path.join(script_dir, "compiled_ssr_data.json")
    with open(compiled_data_path, "w") as f:
        json.dump(compiled_results, f, indent=2)
        
    # Write audit log of missing metrics
    audit_report = {
        "institution_name": compiled_results["institution_name"],
        "total_qualitative_metrics": total_metrics_count,
        "metrics_extracted": successful_extractions_count,
        "metrics_missing": len(missing_metrics),
        "missing_list": missing_metrics
    }
    missing_report_path = os.path.join(script_dir, "missing_data_report.json")
    with open(missing_report_path, "w") as f:
        json.dump(audit_report, f, indent=2)
        
    print("\n" + "=" * 60)
    print("Generation Pipeline Completed!")
    print(f"Processed QlMs: {total_metrics_count} | Extracted: {successful_extractions_count} | Missing: {len(missing_metrics)}")
    print("Output saved to 'compiled_ssr_data.json' and 'missing_data_report.json'.")
    print("=" * 60)
    
    return compiled_results
