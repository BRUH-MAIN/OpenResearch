# ADR 0006 — A research agent, and why the loop is hand-written

**Status:** Accepted
**Date:** 2026-07
**Related:** [ADR 0005](0005-scope-cut.md), which deleted the previous agentic system.

## Context

ADR 0005 removed 4,814 lines of agentic machinery: a LangGraph ReAct agent with
nine task types and nine tools, an embedding-based intent classifier, an LLM
planner, and a workflow orchestrator with human-in-the-loop checkpoints.

Cutting it was right — two of the nine tools were wired to nothing, the
classifier had an intent no task map could route, and a smoke test had to sleep
35 seconds between calls to stay inside the provider's rate limit. It was not
finished.

But cutting it left a real gap, and the gap is not about fashion. **Single-shot
RAG retrieves once and answers.** It cannot issue the second query that only
becomes obvious after seeing the first result — *"these three papers all evaluate
on ImageNet, but none of them describes the augmentation setup; is there one that
does?"* Answering that requires acting on an observation, and a single retrieval
pass structurally cannot.

## Decision

Rebuild **one** agent, finished, rather than nine unfinished ones.

**Three tools**, each earning its place:

| Tool | Why |
|---|---|
| `search_group_papers` | Hybrid retrieval over the group's own index — the same RRF search the chat uses ([ADR 0004](0004-hybrid-retrieval.md)). |
| `search_arxiv` | The wider literature, for when the group's papers do not cover what the question needs. This is the tool that makes the loop worth having: it lets the agent notice an absence and go elsewhere. |
| `read_paper` | The full text of one paper, when a retrieved passage is not enough. Only useful because PDF upload put full text in the index in the first place. |

**The loop is written out, not delegated to a framework.** LangGraph's
`create_react_agent` would do this in one call. Writing the ~60 lines instead
buys: no heavy dependency; every step observable and therefore streamable to the
UI; and a loop that can be tested against a scripted model. The framework's
version is a black box in exactly the place a reviewer will ask questions.

**Guardrails**, because an unbounded agent is a way to spend money on nothing:

- a hard iteration cap (6), after which it answers with what it has rather than
  looping on;
- identical tool calls are refused and the model is told why, so it changes
  course instead of spinning;
- tool results are truncated before re-entering the context;
- the final synthesis is a **separate call** whose prompt requires a bracketed
  citation for every substantive claim — so the answer cannot quietly drift away
  from the evidence the agent actually gathered.

**The reasoning is streamed.** Each tool call and its observation is pushed to
the session as it happens. This is not decoration: an agent that thinks for forty
seconds behind a spinner is indistinguishable from a hung request, and an answer
whose derivation you cannot inspect is one you have to take on faith. The trace
is persisted with the message, so reopening a session still shows how the answer
was reached.

## Consequences

The agent is a *deliberate* act — a separate button and a separate socket event,
not something a stray `@ai` triggers. The RAG chat remains the fast path; the
agent is the slow, thorough one. Both are honest about which they are.

It therefore does **not** require an `@ai` mention, and reusing the chat's request
model (which validates one) was a bug: it rejected every agent run with a 422.
The invariant the `@ai` gate protects is *no AI activity without explicit user
intent*, and pressing a button labelled "Deep research" satisfies that as squarely
as typing `@ai` does. Demanding both would be theatre rather than a safeguard.

What it is good for: multi-hop questions over the group's corpus, comparisons
across papers, and finding relevant work the team does not yet have.

What it is not: it will not write a publishable survey. Its output is a
structured, cited synthesis over roughly 5–15 sources in 30–60 seconds. The old
system's `_tool_write_paper_draft` and IEEE-LaTeX pipeline pretended otherwise,
and that pretence is a large part of why it deserved deletion.

Quality is bounded by three things and only one of them is the agent: what is
actually indexed, the model, and retrieval quality. The loop adds *iterative*
retrieval; it cannot manufacture evidence that is not there.

### On the model

The agent runs on `llama-3.1-8b-instant`, and the smaller model is a deliberate
choice, not a cost compromise. Groq's 70b variants write better prose but emit
malformed tool calls — `<function=search_group_papers{...}</function>` — which
Groq itself rejects with `tool_use_failed`. For a loop whose entire value is
reliable tool dispatch, the smaller model that calls tools correctly beats the
larger one that does not.

Discovering that also exposed a weakness worth fixing: a single malformed call
was aborting the whole investigation. It now falls back to answering with the
evidence already gathered, because a model fumbling one call is a reason to stop
searching, not a reason to fail the request.

### On testing an agent

The loop is tested twice, at two different levels, because they fail differently.

`test_agent.py` scripts the model with a fake object and asserts on the loop's
behaviour: does it dispatch the tool the model asked for, feed the observation
back, stop when the model stops asking, refuse to repeat itself, respect the cap,
and survive a tool that throws?

`test_agent_wire.py` mocks the provider at the **HTTP layer** with a genuine
OpenAI-format `tool_calls` response and drives the real LangChain client through
it. The scripted fake proves the logic but assumes the shape of what a provider
returns — and that assumption was the most likely thing to be wrong. (It found a
real mismatch on the first run: the streaming synthesis call needs SSE frames,
not a JSON body.)

Neither test makes a network call or needs an API key.
