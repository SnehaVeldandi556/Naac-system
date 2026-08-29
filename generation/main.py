import argparse
import sys
import os
import pipeline
import generator

def main():
    parser = argparse.ArgumentParser(description="NAAC SSR Qualitative Data Generation & Mapping Module")
    subparsers = parser.add_subparsers(dest="command", help="Sub-commands")
    
    # Run pipeline command
    run_parser = subparsers.add_parser("run", help="Run similarity searches and extraction pipeline")
    run_parser.add_argument("--limit", type=int, default=3, help="Retrieval chunk limit (K)")
    
    # Render command
    subparsers.add_parser("render", help="Render final report using compiled data")
    
    args = parser.parse_args()
    
    if args.command == "run":
        try:
            pipeline.run_generation_pipeline(chunk_limit=args.limit)
            generator.render_ssr_report()
        except Exception as e:
            print(f"Error executing generation pipeline: {e}")
            sys.exit(1)
            
    elif args.command == "render":
        try:
            generator.render_ssr_report()
        except Exception as e:
            print(f"Error rendering report: {e}")
            sys.exit(1)
            
    else:
        parser.print_help()

if __name__ == "__main__":
    # Ensure current directory is added to sys.path so sibling imports work correctly
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    main()
