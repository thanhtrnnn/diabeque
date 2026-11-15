# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the course lecturer grading the final essay project (Intelligent System Development, PTIT), watching a live demo on a classroom projector at 16:9. The student (Trần Xuân Thành) drives the demo and explains the system while it runs. Secondary: the same lecturer reopening the app later on a laptop.

## Product Purpose

Diabeque is a Vietnamese multi-agent assistant for diabetes screening and advice. It answers knowledge questions with citations from a Neo4j knowledge base (Chapter 5: KB + RAG) and estimates risk from a 7-field health profile with CNN-1D / LSTM models trained on BRFSS (Chapter 6). It estimates, never diagnoses.

The observability surface ("nhà máy") exists so a viewer can see, while a real question runs, which agent works, which tool it calls, which branch the orchestrator takes, how the multi-turn intake loop and session memory work, what happens when the LLM or a tool fails, and open the exact code line behind each step. Success: the lecturer understands the architecture from watching one or two questions run, without reading a diagram.

## Positioning

The LLM only does the three jobs that need language (intent, profile extraction, writing advice); encoding, BMI, safety, and risk prediction are deterministic code that can be tested. The factory makes that split visible: code-only stations versus LLM stations, and a fallback path for every failure.

## Operating Context

- Demo flow and numbers: `DEMO.md`; deploy: `DEPLOY.md`.
- Live runs come from the Chapter 6 API (port 8200) stream: each turn returns a trace of steps `{agent, label, summary, tools[{name,args,result}], ms}`.
- Network to the LLM endpoint can fail in class, so scripted scenarios must replay the same flows offline.
- Frontend: Next.js 16 + React 19 app in `chap6-agents/frontend` (port 3200), BFF proxy to the API. WebGL via three.js approved for this surface (user, 2026-11-10).

## Capabilities and Constraints

- LangGraph, 7 nodes: safety_in → orchestrator → {knowledge | intake → risk → advisor | direct} → safety_out. Emergency short-circuits safety_in → safety_out in 0 ms with no LLM.
- Agent loop across turns: intake asks at most 3 questions per turn; the profile persists in `InMemorySaver` per conversation; the next turn resumes.
- Tools: compute_bmi, validate_profile, predict_diabetes_risk (CNN-1D), predict_diabetes_type (LSTM), search_knowledge, get_recommendations.
- KB `KB_diabet`: 35 documents (28 links + 7 PDFs), 424 chunks with bge-m3 vectors, retrieval vector + BM25 + graph, citation gate, out-of-scope threshold cosine 0.78.
- Fallbacks: orchestrator and intake fall back to rules when the LLM fails. Knowledge and advisor LLM failure has no fallback yet; user approved adding real ones (2026-11-10).
- Code links: VS Code (`vscode://file/...:line`) locally, GitHub `thanhtrnnn/diabeque` otherwise.

## Brand Commitments

- Name Diabeque; logo mark `chap6-agents/assets/diabeque-mark.svg` (beret + blue blood drop).
- User-pinned for the observability surface: a whimsical candy-factory world in the spirit of a Willy-Wonka-style factory, rendered 2.5D at game quality, each agent an original character with its own body shape and interactions, tools as machines. Characters and art must be original; no names, characters, or imagery from any existing film or book.
- All UI copy in Vietnamese.

## Evidence on Hand

Real metrics in `DEMO.md` (e.g. risk example 62% / 3% / 35%, emergency 0 ms, 31 + 37 tests). Real trace format from the API. No user testimonials or usage data exist; none may be invented.

## Product Principles

- Show the mechanism, not a diagram of it: the real trace drives what moves.
- Code versus LLM is always visible.
- Every failure has a visible way out.
- Every step is one click from its source line.

## Accessibility & Inclusion

Projector legibility: large type, high contrast, nothing essential conveyed by color alone. Respect `prefers-reduced-motion` with a step-through mode.
