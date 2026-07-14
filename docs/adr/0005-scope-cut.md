# ADR 0005 — Cutting six features to finish one

**Status:** Accepted
**Date:** 2026-07

## Context

The project had accumulated, in various states of half-done:

- LangGraph agentic tasks (9 task types, a 2,464-line module)
- multi-step workflows with human-in-the-loop checkpoints
- citation graphs and claim-lineage visualisation
- methodology comparison matrices
- paper recommendations
- friends and friend requests
- LaTeX paper generation (which is why a full TeX Live lived in the Docker image)

Most of it ran, in the sense that it did not crash. Almost none of it was
finished. The recommendation engine scored every paper `0.8`. The friends tables
existed with no endpoint that could create a friendship. Two tools in the agentic
service were defined and never wired to anything. The intent classifier had an
intent that no task map could route.

The failure mode this produces is specific and worth naming: **breadth becomes a
liability under questioning.** Six shallow features give an interviewer six places
to ask "how does this work?" and get an unsatisfying answer. One deep feature gives
them one place to ask, and a real answer.

## Decision

Delete all of it, and finish the RAG chat.

**Kept:** auth, groups and membership, realtime chat sessions (Socket.IO), the
paper library and arXiv search, paper summarization, PDF reports — and the
flagship: group-scoped RAG chat with streaming and citations.

**Cut:** everything in the list above.

The cut removed **16,354 lines** across the three services and 9 of the 22 database
tables.

## Consequences

The remaining surface is small enough to hold in your head and explain end to end:
a message with `@ai` in it → hybrid retrieval scoped to the group → a prompt built
from those chunks → tokens streamed back over the websocket → citation chips
showing what grounded the answer. Every step of that is defensible, because every
step is finished.

The removed code is not gone — it is in the git history, and the interesting parts
of it (the LangGraph orchestration in particular) are a legitimate answer to "what
else have you built?". It is just not in the demo, where it would have had to
survive questions it could not.

The honest framing of this decision, if asked: the agentic workflow engine was the
most technically ambitious thing in the repo, and it was the right thing to cut,
because it was the least finished. Ambition that does not survive a demo is not
ambition, it is risk.
