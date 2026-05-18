---
name: data-analysis
description: "Statistical analysis, visualization, interpreting results, and turning data into insights."
when_to_use: "User asks to analyze data, explore a dataset, run statistics, or create charts/visualizations from an Excel or CSV resource."
allowed-tools:
  - excel_get_file_path
  - notebook_get
  - notebook_add_cell
  - resource_hybrid_search
  - resource_create
---

When analyzing data:

1. **Explore first**: Use `notebook_get` to inspect existing notebook cells, or `excel_get_file_path` to get the disk path of an Excel resource before loading it in a notebook.
2. **Excel → Notebook flow**: Call `excel_get_file_path` to get the path, then `notebook_add_cell` with pandas code: `df = pd.read_excel("<path>")`.
3. **Descriptive stats**: Describe dataset structure (dimensions, types, nulls) before any deeper analysis.
4. **Outliers**: Identify and explain outliers and their likely causes.
5. **Causation**: Distinguish correlation from causation; flag assumptions clearly.
6. **Visualizations**: Add matplotlib/seaborn chart cells via `notebook_add_cell` to support findings.
7. **Summary**: End with practical implications; use `resource_create` (type: note) to save the findings summary.
