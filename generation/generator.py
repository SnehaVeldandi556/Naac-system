import json
import os
from jinja2 import Environment, FileSystemLoader

def render_ssr_report(data_file: str = "compiled_ssr_data.json", template_dir: str = "templates", template_name: str = "ssr_template.html") -> str:
    """
    Reads the compiled SSR JSON data and renders the final SSR HTML report
    using the configured Jinja2 template.
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
        
    # Render template
    html_content = template.render(
        institution_name=data.get("institution_name", "Pillai College of Engineering"),
        vision=data.get("vision", ""),
        mission=data.get("mission", ""),
        criteria=data.get("criteria", [])
    )
    
    # Save output in the parent directory (project root) so it's easily viewable
    project_root = os.path.dirname(script_dir)
    output_filename = os.path.join(project_root, "ssr_report.html")
    with open(output_filename, "w", encoding="utf-8") as f:
        f.write(html_content)

    public_dir = os.path.join(project_root, "public")
    if os.path.exists(public_dir):
        public_filename = os.path.join(public_dir, "ssr_report.html")
        with open(public_filename, "w", encoding="utf-8") as f:
            f.write(html_content)

    print(f"Beautifully rendered SSR report generated at: {os.path.abspath(output_filename)}")
    return output_filename
