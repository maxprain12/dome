"""
PageIndex Service - FastAPI microservice for reasoning-based RAG
Replaces LanceDB/embeddings with hierarchical document indexing.

Environment variables:
  PAGEINDEX_PORT        Port to listen on (default: 7432)
  PAGEINDEX_PROVIDER    LLM provider: openai | anthropic | ollama (default: openai)
  PAGEINDEX_MODEL       LLM model to use
  OPENAI_API_KEY        OpenAI API key (required if provider=openai)
  ANTHROPIC_API_KEY     Anthropic API key (required if provider=anthropic)
  OLLAMA_BASE_URL       Ollama base URL (default: http://localhost:11434, if provider=ollama)

Ollama support:
  When PAGEINDEX_PROVIDER=ollama the service uses Ollama's OpenAI-compatible
  endpoint (http://<OLLAMA_BASE_URL>/v1) so PageIndex's OpenAI client talks
  directly to the local Ollama instance - no API key required.
"""

import os
import sys
import json
import asyncio
import logging
from pathlib import Path

# Silence uvicorn startup noise on stdout so Electron can parse readiness signal
logging.basicConfig(level=logging.WARNING, stream=sys.stderr)

try:
    from fastapi import FastAPI
    from pydantic import BaseModel
    import uvicorn
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {e}. Run pip install fastapi uvicorn pydantic"}), flush=True)
    sys.exit(1)

try:
    from pageindex import PageIndex
except ImportError as e:
    print(json.dumps({"error": f"Missing pageindex: {e}. Run pip install pageindex"}), flush=True)
    sys.exit(1)

PORT = int(os.environ.get("PAGEINDEX_PORT", "7432"))
PROVIDER = os.environ.get("PAGEINDEX_PROVIDER", "openai")
MODEL = os.environ.get("PAGEINDEX_MODEL", "gpt-4o-2024-11-20")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

app = FastAPI(title="PageIndex Service", version="1.0.0")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class IndexRequest(BaseModel):
    pdf_path: str
    resource_id: str
    max_pages_per_node: int = 10
    toc_check_pages: int = 20


class IndexResponse(BaseModel):
    success: bool
    resource_id: str
    tree_json: str | None = None
    error: str | None = None


class SearchRequest(BaseModel):
    query: str
    trees: list[dict]  # [{ resource_id, tree_json }]
    top_k: int = 5


class SearchResult(BaseModel):
    resource_id: str
    pages: list[int]
    text: str
    node_title: str
    score: float


class SearchResponse(BaseModel):
    success: bool
    results: list[SearchResult] = []
    error: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_pageindex(model_override: str | None = None) -> PageIndex:
    """
    Create a configured PageIndex instance.

    For Ollama: PageIndex uses the standard OpenAI Python client internally.
    Ollama exposes an OpenAI-compatible API at <base_url>/v1, so we point the
    client there via the OPENAI_BASE_URL env-var and use "ollama" as the
    (required but unused) API key.
    """
    model = model_override or MODEL

    if PROVIDER == "ollama":
        # Ollama's OpenAI-compatible endpoint
        ollama_v1_url = OLLAMA_BASE_URL.rstrip("/") + "/v1"
        # Set env vars that the OpenAI Python client picks up automatically
        os.environ["OPENAI_BASE_URL"] = ollama_v1_url
        os.environ["OPENAI_API_KEY"] = "ollama"  # required by client but ignored
        print(
            f"[PageIndex] Using Ollama at {ollama_v1_url} model={model}",
            file=sys.stderr,
            flush=True,
        )
        try:
            # Some PageIndex versions accept base_url directly
            return PageIndex(model=model, api_key="ollama", base_url=ollama_v1_url)
        except TypeError:
            # Fallback: rely on env vars (OPENAI_BASE_URL / OPENAI_API_KEY)
            return PageIndex(model=model, api_key="ollama")

    elif PROVIDER == "openai":
        if not OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not set")
        # Clear any previously set Ollama override
        os.environ.pop("OPENAI_BASE_URL", None)
        return PageIndex(model=model, api_key=OPENAI_API_KEY)

    elif PROVIDER == "anthropic":
        if not ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY not set")
        return PageIndex(model=model, api_key=ANTHROPIC_API_KEY)

    else:
        raise ValueError(f"Unsupported provider: {PROVIDER!r}")


def _check_ollama_available() -> bool:
    """Quick reachability check for Ollama (synchronous)."""
    import urllib.request
    try:
        url = OLLAMA_BASE_URL.rstrip("/") + "/api/tags"
        with urllib.request.urlopen(url, timeout=2):
            return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    info: dict = {"status": "ok", "provider": PROVIDER, "model": MODEL}
    if PROVIDER == "ollama":
        info["ollama_base_url"] = OLLAMA_BASE_URL
        info["ollama_available"] = _check_ollama_available()
    return info


@app.post("/index", response_model=IndexResponse)
async def index_document(req: IndexRequest):
    """
    Generate a PageIndex hierarchical tree for a PDF document.
    Returns the tree as a JSON string to be stored in SQLite.
    """
    pdf_path = req.pdf_path

    if not Path(pdf_path).exists():
        return IndexResponse(
            success=False,
            resource_id=req.resource_id,
            error=f"File not found: {pdf_path}",
        )

    try:
        pi = _make_pageindex()
        loop = asyncio.get_event_loop()
        tree = await loop.run_in_executor(
            None,
            lambda: pi.build_index(pdf_path),
        )
        tree_json = json.dumps(tree, ensure_ascii=False)
        return IndexResponse(
            success=True,
            resource_id=req.resource_id,
            tree_json=tree_json,
        )
    except Exception as exc:
        return IndexResponse(
            success=False,
            resource_id=req.resource_id,
            error=str(exc),
        )


@app.post("/search", response_model=SearchResponse)
async def search_documents(req: SearchRequest):
    """
    Reasoning-based search across multiple document trees.
    For each tree, uses PageIndex to find the most relevant sections.
    """
    if not req.trees:
        return SearchResponse(success=True, results=[])

    try:
        pi = _make_pageindex()
        loop = asyncio.get_event_loop()
        all_results: list[SearchResult] = []

        for tree_entry in req.trees:
            resource_id = tree_entry.get("resource_id", "")
            tree_json_str = tree_entry.get("tree_json", "")

            if not tree_json_str:
                continue

            try:
                tree = json.loads(tree_json_str)
            except json.JSONDecodeError:
                continue

            try:
                raw_results = await loop.run_in_executor(
                    None,
                    lambda t=tree: pi.search(req.query, t, top_k=req.top_k),
                )

                for r in raw_results:
                    # PageIndex returns dicts with: title, start_index, end_index, summary
                    pages = list(range(
                        int(r.get("start_index", 0)),
                        int(r.get("end_index", r.get("start_index", 0))) + 1,
                    ))
                    all_results.append(SearchResult(
                        resource_id=resource_id,
                        pages=pages,
                        text=r.get("summary", ""),
                        node_title=r.get("title", ""),
                        score=float(r.get("score", 1.0)),
                    ))
            except Exception as exc:
                print(f"[PageIndex] Search error for {resource_id}: {exc}", file=sys.stderr)
                continue

        all_results.sort(key=lambda x: x.score, reverse=True)
        return SearchResponse(success=True, results=all_results[: req.top_k * len(req.trees)])

    except Exception as exc:
        return SearchResponse(success=False, error=str(exc))


# ---------------------------------------------------------------------------
# Startup signal (Electron reads this to know the service is ready)
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def on_startup():
    provider_info = PROVIDER
    if PROVIDER == "ollama":
        available = _check_ollama_available()
        provider_info = f"ollama ({'available' if available else 'UNREACHABLE - check Ollama is running'})"
    print(
        json.dumps({"ready": True, "port": PORT, "provider": provider_info, "model": MODEL}),
        flush=True,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=PORT,
        log_level="warning",
        access_log=False,
    )
