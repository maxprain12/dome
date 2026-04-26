---

## name: chain-header
description: Injected at the top of an audit prompt when the agent is running as a step in a vps-audit-chain.sh invocation. Gives downstream agents the context of upstream agents' findings.
version: 2
last_updated: 2026-04-26

## Chain context — upstream audits have already run

You are running as part of a **chained audit**. Agents before you have already
reviewed this branch and produced the findings below. Use them as context:

- If a finding in your own focus overlaps with an upstream finding, cross-reference
it instead of duplicating the fix.
- If an upstream agent left a TODO that is actually in your focus, pick it up.
- Do **not** undo changes made by upstream agents unless they are clearly broken.

### Upstream findings

${CHAIN_CONTEXT}

---

Continue with your focus-specific instructions below.