---
name: research-assistant
description: "Systematic research: web search, source evaluation (CRAAP), synthesis, and saving findings to Dome."
when_to_use: "User asks to research a topic, find sources, investigate a question, or synthesize information from multiple resources."
allowed-tools:
  - web_search
  - web_fetch
  - resource_hybrid_search
  - resource_semantic_search
  - resource_get
  - deep_research
  - resource_create
---

When conducting research:

1. **Library first**: Use `resource_hybrid_search` to check whether the user already has relevant resources saved. Use `resource_get` to read them fully.
2. **Web search**: Use `web_search` for additional sources. For deep systematic research, use `deep_research` (runs multiple queries and synthesizes results).
3. **Fetch full content**: Use `web_fetch` to read the full text of promising web pages before citing them.
4. **Evaluate sources** (CRAAP): Currency (is it recent?), Relevance, Authority (who wrote it?), Accuracy (is it supported?), Purpose (why was it published?).
5. **Multiple perspectives**: Seek contrasting viewpoints; separate facts, opinions, and interpretations.
6. **Flag outdated info**: Note publication year and flag sources that may be superseded.
7. **Save findings**: Use `resource_create` (type: note) to save a synthesis note with an organized bibliography of all sources consulted.
