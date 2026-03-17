#!/usr/bin/env python3
import argparse
import asyncio
import contextlib
import importlib
import io
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import traceback
import urllib.error
import urllib.parse
import urllib.request


THIS_DIR = Path(__file__).resolve().parent
RUNTIME_ROOT = THIS_DIR.parent
PAGEINDEX_ROOT = THIS_DIR / "vendor" / "pageindex"

if str(PAGEINDEX_ROOT) not in sys.path:
    sys.path.insert(0, str(PAGEINDEX_ROOT))

import openai  # type: ignore
import tiktoken  # type: ignore

page_index_module = importlib.import_module("pageindex.page_index")
page_index_md_module = importlib.import_module("pageindex.page_index_md")
pageindex_utils = importlib.import_module("pageindex.utils")

_ORIGINAL_ENCODING_FOR_MODEL = tiktoken.encoding_for_model


def _read_json(path_str):
    with open(path_str, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _run_quietly(fn, *args, **kwargs):
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
        return fn(*args, **kwargs)


def _safe_await(coro):
    return asyncio.run(coro)


def _simple_token_count(text):
    return max(1, math.ceil(len(str(text or "")) / 4))


def _safe_encoding_for_model(model_name):
    try:
        return _ORIGINAL_ENCODING_FOR_MODEL(model_name)
    except Exception:
        normalized = str(model_name or "").strip().lower()
        candidates = []
        if normalized.startswith(("gpt-5", "gpt-4.1", "gpt-4o", "o1", "o3", "o4")):
            candidates.extend(["o200k_base", "cl100k_base"])
        else:
            candidates.extend(["cl100k_base", "o200k_base", "p50k_base"])
        for encoding_name in candidates:
            try:
                return tiktoken.get_encoding(encoding_name)
            except Exception:
                continue
    return None


def _count_tokens(text, model=None):
    if not text:
        return 0
    try:
        encoding = _safe_encoding_for_model(model or "gpt-4o-mini")
        if encoding is None:
            return _simple_token_count(text)
        return len(encoding.encode(text))
    except Exception:
        return _simple_token_count(text)


tiktoken.encoding_for_model = _safe_encoding_for_model


def _normalize_provider_config(payload):
    llm = payload.get("llm") or {}
    provider = str(llm.get("provider") or "openai").strip().lower()
    model = llm.get("model") or "gpt-4o-mini"
    api_key = llm.get("api_key") or ""
    base_url = llm.get("base_url") or ""
    return {
        "provider": provider,
        "model": model,
        "api_key": api_key,
        "base_url": base_url,
    }


MINIMAX_BASE_URL = "https://api.minimax.io/v1"


def _provider_config_from_db(conn):
    rows = conn.execute(
        "SELECT key, value FROM settings WHERE key IN ('ai_provider', 'ai_model', 'ai_api_key', 'ai_base_url', 'ollama_model', 'ollama_api_key', 'ollama_base_url')"
    ).fetchall()
    settings = {row["key"]: row["value"] for row in rows}
    provider = str(settings.get("ai_provider") or "openai").strip().lower()
    if provider == "ollama":
        raw_base_url = settings.get("ollama_base_url") or "http://localhost:11434"
        normalized_base_url = raw_base_url if raw_base_url.endswith("/v1") else f"{raw_base_url.rstrip('/')}/v1"
        return {
            "provider": provider,
            "model": settings.get("ollama_model") or "llama3.2",
            "api_key": settings.get("ollama_api_key") or "ollama",
            "base_url": normalized_base_url,
        }
    # Only use ai_base_url for Minimax — other providers use their SDK defaults
    if provider == "minimax":
        base_url = (settings.get("ai_base_url") or "").strip() or MINIMAX_BASE_URL
    else:
        base_url = ""
    return {
        "provider": provider,
        "model": settings.get("ai_model") or "gpt-4o-mini",
        "api_key": settings.get("ai_api_key") or "",
        "base_url": base_url,
    }


def _as_text_messages(messages):
    normalized = []
    for message in messages or []:
        role = message.get("role") or "user"
        content = message.get("content") or ""
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    parts.append(item.get("text") or "")
            content = "\n".join(part for part in parts if part)
        normalized.append({"role": role, "content": str(content)})
    return normalized


def _http_json(url, method="POST", headers=None, body=None):
    req = urllib.request.Request(
        url,
        data=(json.dumps(body).encode("utf-8") if body is not None else None),
        headers=headers or {},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw)


def _call_openai_compatible(messages, cfg, model, with_finish_reason=False):
    client = openai.OpenAI(
        api_key=cfg.get("api_key") or "dome",
        base_url=cfg.get("base_url") or None,
    )
    response = client.chat.completions.create(
        model=model,
        messages=_as_text_messages(messages),
        temperature=0,
    )
    text = response.choices[0].message.content or ""
    if not with_finish_reason:
        return text
    finish_reason = response.choices[0].finish_reason or "finished"
    normalized = "max_output_reached" if finish_reason == "length" else "finished"
    return text, normalized


def _call_anthropic(messages, cfg, model, with_finish_reason=False):
    body = {
        "model": model,
        "max_tokens": 4096,
        "temperature": 0,
        "messages": _as_text_messages(messages),
    }
    data = _http_json(
        "https://api.anthropic.com/v1/messages",
        headers={
            "content-type": "application/json",
            "x-api-key": cfg.get("api_key") or "",
            "anthropic-version": "2023-06-01",
        },
        body=body,
    )
    content = data.get("content") or []
    text = "\n".join(part.get("text", "") for part in content if isinstance(part, dict) and part.get("type") == "text")
    if not with_finish_reason:
        return text
    stop_reason = data.get("stop_reason") or "end_turn"
    normalized = "max_output_reached" if stop_reason == "max_tokens" else "finished"
    return text, normalized


def _call_google(messages, cfg, model, with_finish_reason=False):
    parts = []
    for message in _as_text_messages(messages):
        parts.append({"text": message["content"]})
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 4096},
    }
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(model)}:generateContent?key={urllib.parse.quote(cfg.get('api_key') or '')}"
    )
    data = _http_json(url, headers={"content-type": "application/json"}, body=body)
    candidate = ((data.get("candidates") or [{}])[0]) if isinstance(data.get("candidates"), list) else {}
    content = candidate.get("content") or {}
    text = "\n".join(part.get("text", "") for part in content.get("parts", []) if isinstance(part, dict) and part.get("text"))
    if not with_finish_reason:
        return text
    finish_reason = candidate.get("finishReason") or "STOP"
    normalized = "max_output_reached" if str(finish_reason).upper() == "MAX_TOKENS" else "finished"
    return text, normalized


def _call_provider(messages, cfg, model=None, with_finish_reason=False):
    provider = cfg.get("provider") or "openai"
    model_name = model or cfg.get("model") or "gpt-4o-mini"
    if provider == "anthropic":
        return _call_anthropic(messages, cfg, model_name, with_finish_reason=with_finish_reason)
    if provider == "google":
        return _call_google(messages, cfg, model_name, with_finish_reason=with_finish_reason)
    return _call_openai_compatible(messages, cfg, model_name, with_finish_reason=with_finish_reason)


def _patch_pageindex_modules(cfg):
    def sync_chat(model, prompt, api_key=None, chat_history=None):
        messages = list(chat_history or [])
        messages.append({"role": "user", "content": prompt})
        return _call_provider(messages, cfg, model=model)

    def sync_chat_with_finish_reason(model, prompt, api_key=None, chat_history=None):
        messages = list(chat_history or [])
        messages.append({"role": "user", "content": prompt})
        return _call_provider(messages, cfg, model=model, with_finish_reason=True)

    async def async_chat(model, prompt, api_key=None):
        return await asyncio.to_thread(_call_provider, [{"role": "user", "content": prompt}], cfg, model, False)

    for module in (pageindex_utils, page_index_module, page_index_md_module):
        module.count_tokens = _count_tokens
        module.ChatGPT_API = sync_chat
        module.ChatGPT_API_async = async_chat
        module.ChatGPT_API_with_finish_reason = sync_chat_with_finish_reason
        module.CHATGPT_API_KEY = cfg.get("api_key") or ""


def _coerce_int(value, default=None):
    try:
        return int(value)
    except Exception:
        return default


def _normalize_summary(node):
    summary = node.get("summary") or node.get("prefix_summary") or node.get("text") or ""
    return str(summary).strip()


def _normalize_pdf_node(node):
    start_index = _coerce_int(node.get("start_index"))
    end_index = _coerce_int(node.get("end_index"))
    if start_index is None:
        start_index = _coerce_int(node.get("physical_index"))
    if end_index is None:
        end_index = start_index
    if start_index is None:
        start_index = 1
    if end_index is None:
        end_index = start_index
    out = {
        "title": str(node.get("title") or "Sección").strip(),
        "node_id": str(node.get("node_id") or ""),
        "summary": _normalize_summary(node),
        "start_index": max(0, start_index - 1),
        "end_index": max(0, end_index - 1),
    }
    keywords = node.get("keywords")
    if isinstance(keywords, list):
        out["keywords"] = [str(keyword).strip() for keyword in keywords if str(keyword).strip()]
    children = [_normalize_pdf_node(child) for child in (node.get("nodes") or []) if isinstance(child, dict)]
    if children:
        out["nodes"] = children
    return out


def _normalize_markdown_node(node):
    line_num = _coerce_int(node.get("line_num"), 1)
    out = {
        "title": str(node.get("title") or "Contenido").strip(),
        "node_id": str(node.get("node_id") or ""),
        "summary": _normalize_summary(node),
        "line_num": max(0, line_num - 1),
    }
    children = [_normalize_markdown_node(child) for child in (node.get("nodes") or []) if isinstance(child, dict)]
    if children:
        out["nodes"] = children
    return out


def _normalize_pdf_result(raw):
    structure = raw.get("structure") if isinstance(raw, dict) else raw
    if not isinstance(structure, list):
        return []
    return [_normalize_pdf_node(node) for node in structure if isinstance(node, dict)]


def _normalize_markdown_result(raw):
    structure = raw.get("structure") if isinstance(raw, dict) else raw
    if not isinstance(structure, list):
        return []
    return [_normalize_markdown_node(node) for node in structure if isinstance(node, dict)]


def _flatten_tree(tree):
    nodes = []

    def walk(item, ancestors=None):
        ancestors = ancestors or []
        if isinstance(item, list):
            for child in item:
                walk(child, ancestors)
            return
        if not isinstance(item, dict):
            return
        current = {k: v for k, v in item.items() if k != "nodes"}
        current["path"] = [ancestor.get("title") for ancestor in ancestors if ancestor.get("title")]
        current["node_path"] = current["path"] + ([current.get("title")] if current.get("title") else [])
        nodes.append(current)
        next_ancestors = ancestors + [{"title": item.get("title"), "node_id": item.get("node_id")}]
        for child in item.get("nodes") or []:
            walk(child, next_ancestors)

    walk(tree, [])
    return nodes


def _count_tree_nodes(tree):
    return len(_flatten_tree(tree))


def _page_range_label(start_index, end_index=None):
    if start_index is None:
        return ""
    end = start_index if end_index is None else end_index
    if end == start_index:
        return f"p.{start_index + 1}"
    return f"p.{start_index + 1}-{end + 1}"


def _build_search_tree(node):
    compact = {
        "title": node.get("title") or "",
        "node_id": node.get("node_id") or "",
        "summary": _normalize_summary(node)[:500],
    }
    if "start_index" in node:
        compact["page_range"] = _page_range_label(node.get("start_index"), node.get("end_index"))
    children = [_build_search_tree(child) for child in (node.get("nodes") or []) if isinstance(child, dict)]
    if children:
        compact["nodes"] = children
    return compact


def _parse_json_response(text):
    raw = str(text or "").strip()
    if raw.startswith("```json"):
        raw = raw[7:].strip()
    if raw.endswith("```"):
        raw = raw[:-3].strip()
    return json.loads(raw)


def _keyword_score(query, node):
    haystack = " ".join(
        part for part in [
            node.get("title") or "",
            node.get("summary") or "",
            " ".join(node.get("node_path") or []),
        ] if part
    ).lower()
    if not haystack:
        return 0.0
    terms = [term for term in re.findall(r"\w+", query.lower()) if len(term) > 2]
    if not terms:
        return 0.0
    score = 0.0
    for term in terms:
        score += haystack.count(term)
    return score


def _search_single_tree(query, resource_id, tree, top_k, cfg):
    flat_nodes = _flatten_tree(tree)
    if not flat_nodes:
        return []
    compact_tree = [_build_search_tree(node) for node in tree]
    prompt = (
        "You are given a user query and a PageIndex tree structure for one document.\n"
        f"Query: {query}\n\n"
        f"Document tree: {json.dumps(compact_tree, ensure_ascii=False)}\n\n"
        f"Return ONLY JSON in this format: {{\"node_list\": [\"node_id_1\", \"node_id_2\"]}}.\n"
        f"Choose up to {top_k} node IDs that are most likely to contain the answer. "
        "Prefer the most specific nodes when possible."
    )
    chosen_ids = []
    try:
        parsed = _parse_json_response(_call_provider([{"role": "user", "content": prompt}], cfg))
        raw_ids = parsed.get("node_list") or []
        if isinstance(raw_ids, list):
            chosen_ids = [str(node_id) for node_id in raw_ids if str(node_id).strip()]
    except Exception:
        chosen_ids = []
    node_map = {str(node.get("node_id") or ""): node for node in flat_nodes if node.get("node_id")}
    results = []
    seen = set()
    for rank, node_id in enumerate(chosen_ids):
        node = node_map.get(node_id)
        if not node or node_id in seen:
            continue
        seen.add(node_id)
        start_index = node.get("start_index")
        end_index = node.get("end_index", start_index)
        pages = list(range(start_index, end_index + 1)) if start_index is not None and end_index is not None else []
        results.append({
            "resource_id": resource_id,
            "node_id": node_id,
            "node_title": node.get("title") or "",
            "node_path": node.get("node_path") or [],
            "pages": pages,
            "page_range": _page_range_label(start_index, end_index) if pages else None,
            "text": node.get("summary") or "",
            "score": max(0.0, 1.0 - rank * (0.5 / max(top_k, 1))),
        })
        if len(results) >= top_k:
            return results
    fallback = sorted(flat_nodes, key=lambda node: _keyword_score(query, node), reverse=True)
    for node in fallback:
        node_id = str(node.get("node_id") or "")
        if not node_id or node_id in seen:
            continue
        seen.add(node_id)
        start_index = node.get("start_index")
        end_index = node.get("end_index", start_index)
        pages = list(range(start_index, end_index + 1)) if start_index is not None and end_index is not None else []
        results.append({
            "resource_id": resource_id,
            "node_id": node_id,
            "node_title": node.get("title") or "",
            "node_path": node.get("node_path") or [],
            "pages": pages,
            "page_range": _page_range_label(start_index, end_index) if pages else None,
            "text": node.get("summary") or "",
            "score": max(0.0, _keyword_score(query, node)),
        })
        if len(results) >= top_k:
            break
    return results


def _connect_db(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _set_status(conn, resource_id, status, progress, error_message=None):
    conn.execute(
        """
        INSERT INTO resource_index_status (resource_id, status, progress, error_message, updated_at)
        VALUES (?, ?, ?, ?, strftime('%s','now') * 1000)
        ON CONFLICT(resource_id) DO UPDATE SET
          status = excluded.status,
          progress = excluded.progress,
          error_message = excluded.error_message,
          updated_at = excluded.updated_at
        """,
        (resource_id, status, progress, error_message),
    )
    conn.commit()


def _clear_status(conn, resource_id):
    conn.execute("DELETE FROM resource_index_status WHERE resource_id = ?", (resource_id,))
    conn.commit()


def _upsert_page_index(conn, resource_id, tree_json, model_used):
    conn.execute(
        """
        INSERT INTO resource_page_index (resource_id, tree_json, indexed_at, model_used, status, progress, error_message)
        VALUES (?, ?, strftime('%s','now') * 1000, ?, 'done', 100, NULL)
        ON CONFLICT(resource_id) DO UPDATE SET
          tree_json = excluded.tree_json,
          indexed_at = excluded.indexed_at,
          model_used = excluded.model_used,
          status = 'done',
          progress = 100,
          error_message = NULL
        """,
        (resource_id, tree_json, model_used),
    )
    conn.commit()


def _resolve_resource_path(resource, payload):
    storage_root = payload.get("storage_root") or ""
    internal_path = resource["internal_path"] if "internal_path" in resource.keys() else None
    if not storage_root:
        user_data_path = payload.get("user_data_path") or ""
        storage_root = str(Path(user_data_path) / "dome-files") if user_data_path else ""
    if not internal_path:
        raise ValueError("Resource has no internal_path")
    full_path = Path(storage_root) / internal_path
    if not full_path.exists():
        raise FileNotFoundError(f"Indexed file not found: {full_path}")
    return str(full_path)


def _tiptap_text_children(node):
    return "".join(_tiptap_to_markdown(child) for child in (node.get("content") or []))


def _tiptap_to_markdown(node):
    if not isinstance(node, dict):
        return ""
    node_type = node.get("type")
    if node_type == "doc":
        return "\n\n".join(_tiptap_to_markdown(child) for child in (node.get("content") or []))
    if node_type == "heading":
        level = _coerce_int((node.get("attrs") or {}).get("level"), 1) or 1
        return f"{'#' * max(1, min(level, 6))} {_tiptap_text_children(node)}"
    if node_type == "paragraph":
        return _tiptap_text_children(node)
    if node_type == "text":
        return str(node.get("text") or "")
    if node_type == "hardBreak":
        return "\n"
    if node_type == "bulletList":
        return "\n".join(f"- {_tiptap_to_markdown(child)}" for child in (node.get("content") or []))
    if node_type == "orderedList":
        return "\n".join(
            f"{index + 1}. {_tiptap_to_markdown(child)}" for index, child in enumerate(node.get("content") or [])
        )
    if node_type == "listItem":
        return "".join(_tiptap_to_markdown(child) for child in (node.get("content") or []))
    if node_type == "blockquote":
        return "\n".join(f"> {_tiptap_to_markdown(child)}" for child in (node.get("content") or []))
    if node_type == "codeBlock":
        return f"```\n{_tiptap_text_children(node)}\n```"
    if node_type == "horizontalRule":
        return "---"
    return _tiptap_text_children(node)


def _note_content_to_markdown(content, title):
    raw = content or ""
    parsed = None
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = raw
    else:
        parsed = raw
    if isinstance(parsed, dict) and parsed.get("type") == "doc":
        markdown = _tiptap_to_markdown(parsed)
    else:
        markdown = str(raw)
    markdown = markdown.strip()
    if title:
        return f"# {title}\n\n{markdown}" if markdown else f"# {title}"
    return markdown


def _load_resource(conn, resource_id):
    row = conn.execute(
        "SELECT id, type, title, content, internal_path FROM resources WHERE id = ?",
        (resource_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Resource not found")
    return row


def _index_pdf_resource(resource, provider_cfg, payload):
    """Index PDF using native PageIndex PDF processor."""
    pdf_path = _resolve_resource_path(resource, payload)
    _patch_pageindex_modules(provider_cfg)
    config_loader = pageindex_utils.ConfigLoader()
    opt = config_loader.load({
        "model": provider_cfg.get("model") or "gpt-4o-mini",
        "if_add_node_id": "yes",
        "if_add_node_summary": "yes",
        "if_add_doc_description": "no",
        "if_add_node_text": "no",
    })
    raw = _run_quietly(page_index_module.page_index_main, pdf_path, opt)
    return _normalize_pdf_result(raw)


def _index_note_resource(resource, provider_cfg):
    markdown = _note_content_to_markdown(resource["content"], resource["title"])
    if not markdown.strip():
        raise ValueError("Note has no indexable content")
    _patch_pageindex_modules(provider_cfg)
    with tempfile.NamedTemporaryFile("w", suffix=".md", encoding="utf-8", delete=False) as handle:
        handle.write(markdown)
        temp_path = handle.name
    try:
        raw = _run_quietly(
            _safe_await,
            page_index_md_module.md_to_tree(
                md_path=temp_path,
                if_thinning=False,
                min_token_threshold=5000,
                if_add_node_summary="yes",
                summary_token_threshold=200,
                model=provider_cfg.get("model") or "gpt-4o-mini",
                if_add_doc_description="no",
                if_add_node_text="no",
                if_add_node_id="yes",
            ),
        )
        return _normalize_markdown_result(raw)
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


def _index_resource(payload):
    resource_id = payload.get("resource_id")
    db_path = payload.get("db_path")
    if not resource_id:
        raise ValueError("resource_id is required")
    if not db_path:
        raise ValueError("db_path is required")
    conn = _connect_db(db_path)
    try:
        provider_cfg = _normalize_provider_config(payload)
        if not provider_cfg.get("api_key") and provider_cfg.get("provider") != "ollama":
            provider_cfg = _provider_config_from_db(conn)
        resource = _load_resource(conn, resource_id)
        # If a PDF has already been converted to Markdown by Docling cloud service,
        # its content field will be populated — use the faster markdown indexing path.
        _docling_markdown = (resource["content"] or "").strip()
        _use_markdown_path = resource["type"] == "pdf" and len(_docling_markdown) > 100
        _set_status(conn, resource_id, "processing", 10, None)
        if resource["type"] == "pdf" and not _use_markdown_path:
            _set_status(conn, resource_id, "processing", 25, None)
            tree = _index_pdf_resource(resource, provider_cfg, payload)
        elif resource["type"] in ("note", "pdf"):  # pdf with Docling markdown
            _set_status(conn, resource_id, "processing", 25, None)
            tree = _index_note_resource(resource, provider_cfg)
        else:
            raise ValueError(f"Unsupported resource type: {resource['type']}")
        _set_status(conn, resource_id, "processing", 90, None)
        tree_json = json.dumps(tree, ensure_ascii=False)
        _upsert_page_index(conn, resource_id, tree_json, provider_cfg.get("model") or "unknown")
        _clear_status(conn, resource_id)
        return {
            "success": True,
            "resource_id": resource_id,
            "node_count": _count_tree_nodes(tree),
        }
    except Exception as error:
        try:
            _set_status(conn, resource_id, "error", 0, str(error))
        except Exception:
            pass
        return {
            "success": False,
            "resource_id": resource_id,
            "error": str(error),
            "error_type": "indexing_error",
            "details": traceback.format_exc(),
        }
    finally:
        conn.close()


def _search(payload):
    provider_cfg = _normalize_provider_config(payload)
    _patch_pageindex_modules(provider_cfg)
    query = payload.get("query") or ""
    top_k = max(1, int(payload.get("top_k") or 5))
    trees = payload.get("trees") or []
    results = []
    for entry in trees:
        if not isinstance(entry, dict):
            continue
        resource_id = entry.get("resource_id")
        tree_json = entry.get("tree_json")
        if not resource_id or not tree_json:
            continue
        try:
            tree = json.loads(tree_json)
        except Exception:
            continue
        results.extend(_search_single_tree(query, resource_id, tree, top_k, provider_cfg))
    results.sort(key=lambda item: item.get("score", 0), reverse=True)
    return {
        "success": True,
        "results": results[: max(top_k, 1) * max(1, len(trees))],
    }


def main():
    parser = argparse.ArgumentParser(description="Dome PageIndex Python bridge")
    parser.add_argument("--mode", required=True, choices=["index-resource", "search"])
    parser.add_argument("--input-file", required=True)
    args = parser.parse_args()
    payload = _read_json(args.input_file)
    try:
        if args.mode == "index-resource":
            out = _index_resource(payload)
        else:
            out = _search(payload)
        print(json.dumps(out, ensure_ascii=False))
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        print(json.dumps({
            "success": False,
            "error": f"HTTP {error.code} while calling provider",
            "error_type": "indexing_error",
            "details": details,
        }, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({
            "success": False,
            "error": str(error),
            "error_type": "indexing_error",
            "details": traceback.format_exc(),
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
