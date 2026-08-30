---
name: Crime workbook imports on Render
description: Resource constraint and fallback policy for importing large Policía Nacional AICRI workbooks in production.
---

Official AICRI workbooks must be downloaded to temporary storage and parsed as streamed worksheet XML. Bound the compressed file, decompressed entries, and retained row buffer independently; aggregate only publication totals in memory.

**Why:** The production service restarted when a compressed workbook expanded to hundreds of megabytes in memory. Total decompression limits alone are insufficient because one malformed row can still grow the retained parser buffer.

**How to apply:** Validate every required month/type series before publishing, replace data transactionally, and use a PostgreSQL advisory lock shared by startup, manual, and automatic refreshes. Persist provenance and bind each source to an explicit year.