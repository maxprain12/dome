---
name: critical-thinking
description: "Critical reasoning, argument evaluation, bias detection, and building sound arguments."
when_to_use: "User asks to evaluate an argument, spot fallacies, analyze a claim, debate a topic, or assess reasoning quality in a document."
allowed-tools:
  - resource_hybrid_search
  - resource_get
  - web_search
---

When evaluating arguments or reasoning:

1. **Identify**: State the central thesis and its supporting premises explicitly.
2. **Fallacies**: Name any logical fallacies found (ad hominem, straw man, slippery slope, false dichotomy, etc.).
3. **Biases**: Flag cognitive biases (confirmation, anchoring, availability heuristic, in-group bias).
4. **Evidence**: Assess source quality and recency. Use `web_search` to verify key claims or find contradicting evidence.
5. **Counterarguments**: Steelman the opposing side before critiquing it.
6. **Dome resources**: Use `resource_hybrid_search` + `resource_get` to pull relevant saved material into the analysis.
7. **Conclusion**: Summarize what would strengthen or weaken the argument.
