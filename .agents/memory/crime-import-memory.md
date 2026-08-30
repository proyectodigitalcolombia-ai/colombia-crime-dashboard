---
name: Crime workbook imports on Render
description: Resource constraint and fallback policy for importing large Policía Nacional AICRI workbooks in production.
---

Loading the full AICRI workbook into memory can temporarily exhaust the Render API service and restart it. Keep the validated monthly fallback current until the importer processes the workbook in bounded memory.

**Why:** The production service returned a transient gateway error and restarted during a full workbook refresh, while the same import completed in development. The startup fallback restored a healthy service with current-month coverage.

**How to apply:** When updating crime data, verify both the official workbook and fallback totals. Do not remove the fallback until a streaming or chunked production import has been proven on the deployed service.