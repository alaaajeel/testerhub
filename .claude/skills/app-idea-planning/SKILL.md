---
name: "app-idea-planning"
description: "Use before building a new app, game, or feature, or a big improvement to an existing one (فكرة تطبيق، ميزة جديدة، نطوّر، نحسّن) — clarify the idea and agree a short plan before writing code."
---

# App / Feature Idea → Plan

Inspired by obra/superpowers brainstorming + writing-plans (MIT).

The user is a solo developer in Iraq building Arabic apps (React / PWA / Firebase, Android via Google Play) and Unity games. Ideas often arrive as one line. Building the wrong thing is the most expensive mistake, so spend a few minutes on clarity first. Skip this skill for tiny changes (a color, a text, one obvious bug).

## Step 1 — Understand (max 3–5 questions, one message)
Look at the existing project first if there is one. Then ask only what changes the build:
- Who uses it, and the ONE main thing they must be able to do?
- Platform: web/PWA, Android, both? Online-only or must work offline / weak internet?
- Data and accounts: login needed? who sees what? (drives Firebase rules)
- Money: free, ads, subscription, paid by a client (e.g. a school)?
- Deadline or a client waiting?
If the user says "you decide", pick sensible defaults and state them.

## Step 2 — Be honest about the idea
In 2–4 lines: the biggest risk (technical, market, or effort), anything that already exists and does this, and what to cut from version 1. Do not just agree.

## Step 3 — MVP plan
Write a short plan the user can approve:
1. MVP scope — the smallest version that is actually useful (bullet list), and what is explicitly NOT in v1.
2. Stack — reuse what the user already knows unless there is a strong reason not to.
3. Data model — main collections/tables and their fields; security rules in one line each.
4. Screens — list of screens and what each does.
5. Build order — small steps, each ending in something runnable and checkable.

## Step 4 — Get a yes, then build step by step
Wait for approval (or adjust). Build in the agreed order, run/verify each step before the next, and tell the user briefly what is done and what is next.

Arabic UI work also follows the arabic-rtl-ui skill.