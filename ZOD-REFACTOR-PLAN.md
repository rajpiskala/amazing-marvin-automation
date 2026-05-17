# Zod Validation and Tooling Modernization Plan

## Summary
Add Zod validation at the JSON trust boundaries in this project, using Marvin’s local API reference as the source of truth for allowed fields and enums. Keep the validation permissive for Marvin-owned objects so extra upstream fields do not break the app, while making the payloads this app constructs strict.

## Key Changes
- Add a shared schema module for the webhook bodies, Marvin API responses, and outbound request payloads.
- Validate `POST /habit-as-task` input before routing by `type`, and reject unknown or malformed bodies with `400`.
- Validate Marvin API responses before using them, especially the habit and goal list fetches used to build pattern matches.
- Validate all outbound JSON payloads before posting to Marvin, including task creation, habit recording, and document updates.
- Keep the TypeScript types derived from the schemas so runtime checks and compile-time types stay aligned.
- Modernize the project baseline for the newer Node/TypeScript toolchain, including the lint and test setup needed for TypeScript-aware checks.

## Test Plan
- Add schema tests for valid and invalid webhook bodies, Marvin response shapes, and outbound payloads.
- Add route tests for invalid `type`, malformed webhook bodies, malformed Marvin responses, and successful happy-path requests.
- Run `typecheck`, `lint`, `test`, and `npm audit` after the changes land.

## Assumptions
- Unknown extra fields from Marvin should be allowed, not rejected.
- The current scope is the main runtime call sites only, not a full-schema model of every Marvin object in the wiki.
- The Marvin API wiki in `references/MarvinAPI.wiki` remains the source of truth for enums, shape details, and field names.
