<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:hidden-features-reminder -->
# Hidden-features auto-reminder rule

The repo has a small set of features that are **hidden in the UI but
intact in code** (gated behind `{false /* FLAG_NAME */ && ...}` or
similar). They are listed in `docs/HIDDEN-FEATURES.md`.

**MANDATORY before any UI / dashboard / insights / login / presentation
work:**

1. Read `docs/HIDDEN-FEATURES.md` once at the start of any session that
   touches those areas
2. When the user requests a new feature, modification, or UI change in
   an overlapping area, **proactively surface the relevant hidden
   item(s)** before writing code. Example: "You currently have the
   Trends panel hidden — should this new dashboard widget account for
   it, or should we re-enable Trends first?"
3. When the user decides to hide a new feature, append a row to
   `docs/HIDDEN-FEATURES.md` in the same commit. Don't lose it.
4. When the user asks to "re-enable" or "bring back" something, check
   that doc first — the answer is almost always a one-line flag flip,
   not a rebuild.

Why this rule exists: without it, hidden features get re-built from
scratch when the user asks for similar functionality, OR they're
forgotten and never re-enabled even when they should be.
<!-- END:hidden-features-reminder -->

<!-- BEGIN:proactive-solve-rule -->
# Proactive-solve rule (applies to Claude AND every council agent)

When a user surfaces a critical issue — broken upload, deploy failure, data
loss risk, blocked critical path — you SOLVE it, not just diagnose it. Do
not ship "here are 3 things you could try" if you can implement option 4
yourself in the same turn. Specifically:

1. **Diagnose silently first**: identify root cause + the minimum-viable fix
   that actually unblocks the user.
2. **Solve, then explain**: ship the code/config/migration that resolves it.
   The explanation comes after the fix, not instead of it.
3. **Persist the lesson**: if the issue is class-of-failure (not one-off),
   add a guard (test, schema constraint, agent rule, retry, fallback path)
   so it cannot recur silently.
4. **Only escalate when truly blocked**: human input required (a secret only
   they have, a policy decision, a billing approval). Otherwise, ship.
5. **Same rule for council agents**: every agent (mapper, verification,
   export, ai-health) must auto-resolve recoverable failures (retry with
   alternate strategy, fall back to original, quarantine and re-probe) before
   surfacing the issue. Surfacing a failure without an attempted recovery is
   the wrong default.

Example of the wrong pattern (don't do this):
> "Your upload is blocked by an ad-blocker. Here are 3 fixes you can try."

Example of the right pattern:
> [auto-builds CloudConvert fallback path that bypasses the blocker]
> "I built an automatic fallback — when blob upload fails, the page now
>  silently retries via CloudConvert's domain (which isn't blocked).
>  Tested + deployed. Try the upload again."
<!-- END:proactive-solve-rule -->
