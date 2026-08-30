---
name: Render build log verification
description: How to retrieve build diagnostics from Render's logs API after a deploy
---

## Rule
Query `/v1/logs` with the service ID as both `ownerId` and `resource`, and use `direction=forward` over the deployment time window.

**Why:** Filtering by the deployment ID returns no entries. Build-command output is stored under the service resource and may be mixed with application and request logs.

**How to apply:** After a deployment finishes, query the service resource for its build interval and filter messages for the expected diagnostic output.