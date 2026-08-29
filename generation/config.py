import os
from dotenv import load_dotenv

# Load .env.local and .env files from project root (one level up from this script)
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(dotenv_path=os.path.join(root_dir, '.env.local'))
load_dotenv(dotenv_path=os.path.join(root_dir, '.env'))

# Groq API Configuration for Qwen Inference
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")

# Supabase REST / Service-Role Configuration (works out-of-the-box with existing Next.js keys)
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Direct PostgreSQL credentials (optional for direct psycopg2 client)
DB_HOST = os.getenv("SUPABASE_DB_HOST", "")
DB_NAME = os.getenv("SUPABASE_DB_NAME", "postgres")
DB_USER = os.getenv("SUPABASE_DB_USER", "postgres")
DB_PASSWORD = os.getenv("SUPABASE_DB_PASSWORD", "")
DB_PORT = os.getenv("SUPABASE_DB_PORT", "5432")

# Google Generative AI (768-dim embeddings)
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# Embedding Configuration
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "gemini-embedding-001")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "768"))

def is_supabase_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)

def is_db_configured() -> bool:
    return bool(DB_HOST and DB_PASSWORD and "your_" not in DB_HOST)

def is_groq_configured() -> bool:
    return bool(GROQ_API_KEY and "your_" not in GROQ_API_KEY)

def is_gemini_embedding_configured() -> bool:
    return bool(GOOGLE_API_KEY and "your_" not in GOOGLE_API_KEY)
