---
name: "systematic-debugging"
description: "Use for any bug, error, crash, failing build, or unexpected behavior in an app or game (خطأ، مشكلة، ما يشتغل، تعطل), before proposing any fix, and before claiming anything is fixed or done."
---

# Systematic Debugging + Verification

Adapted from obra/superpowers (MIT, Jesse Vincent): systematic-debugging and verification-before-completion.

## Iron laws
1. NO FIX WITHOUT ROOT CAUSE FIRST. Symptom patches cause the "fixed one thing, broke another" loop.
2. NO "DONE" WITHOUT FRESH EVIDENCE. Never say fixed / works / done unless you ran the check in this turn and saw the output.

## Phase 1 — Root cause
- Read the full error message and stack trace: file, line, error code.
- Reproduce it: exact steps, every time or intermittent?
- Check what changed recently (diff, new dependency, config, Firebase rules, Unity package, build settings).
- Multi-layer systems (UI → state → Firebase → rules; Unity script → scene → build): log what enters and leaves each layer, run once, find WHERE it breaks before guessing WHY.
- Trace the bad value backwards to its source. Fix at the source.
- Unity: read the Console through Unity MCP if connected, instead of asking the user to paste errors.

## Phase 2 — Compare
- Find similar code in the same project that works. List every difference, however small.

## Phase 3 — One hypothesis
- State it: "I think X is the cause because Y."
- Make the smallest change that tests it. One variable at a time. If wrong, form a new hypothesis; do not stack fixes.
- If you don't understand something, say so and investigate; don't pretend.

## Phase 4 — Fix and verify
- One fix addressing the root cause. No "while I'm here" refactors.
- Verify by re-running the original failing scenario (build, test, run the app/scene, check the console). Report the actual result with evidence.
- If 3 fixes have failed: STOP. The design is likely wrong. Explain to the user and discuss the architecture before attempt #4.

## Red flags — stop and go back to Phase 1
- "Let me just try changing X" / "It's probably X"
- Several changes at once
- Proposing fixes before reading the error or tracing the data
- Words like "should work now", "probably fixed", "Perfect!" without having run anything

## Reporting to the user
Reply in the user's language (often Iraqi Arabic). Say briefly: the root cause, what was changed, and how it was verified. If something could not be verified (e.g. needs a real device), say so plainly and tell the user exactly what to test.