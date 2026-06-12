---
name: Render API PATCH build command
description: How to correctly update the Render build command via API v1
---

## Rule
To update the build/start command of a Render web service via API, the correct JSON nesting is:

```json
{
  "serviceDetails": {
    "envSpecificDetails": {
      "buildCommand": "...",
      "startCommand": "..."
    }
  }
}
```

**Why:** Sending `serviceDetails.buildCommand` (without `envSpecificDetails`) is silently ignored — the API returns 200 but the field doesn't update. The actual field lives at `serviceDetails.envSpecificDetails.buildCommand`.

**How to apply:** Any time you need to PATCH a Render web service build/start command, always use the `envSpecificDetails` nesting. Verify by checking the response: `svc.serviceDetails.envSpecificDetails.buildCommand`.

## Context
- Service: `srv-d7256m450q8c7390kbbg` (colombia-crime-api)
- Was stuck at `pnpm@9`; finally updated to `pnpm@10.26.1` once the correct nesting was used
- pnpm version MUST match the lockfile generator version (Replit uses pnpm@10.26.1)
