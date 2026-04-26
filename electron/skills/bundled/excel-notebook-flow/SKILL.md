---
name: excel-notebook-flow
description: "Read an Excel resource from disk in a notebook via pandas using excel_get_file_path."
when_to_use: "User wants to extract or analyze Excel data in a notebook with pandas/sklearn."
paths:
  - "notebook"
allowed-tools:
  - excel_get_file_path
  - notebook_get
  - notebook_add_cell
---

## Excel + notebook flow

When the user says "extract data from Excel X and generate analysis with pandas/sklearn":

1. Call `excel_get_file_path` (`resource_id`: Excel resource id) to get the absolute file path.
2. Call `notebook_get` (`resource_id`: current notebook id) to see structure.
3. Call `notebook_add_cell` with Python code: `import pandas as pd; df = pd.read_excel(r"...path..."); ...` using the `file_path` from step 1.
