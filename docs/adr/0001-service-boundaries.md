# ADR 0001 — Three services, and only one of them owns the schema

**Status:** Accepted
**Date:** 2026-07

## Context

OpenResearch runs as three services: a Next.js client, a Node/Express server, and
a Python/FastAPI AI service, over one Postgres database.

Three services is more than this application strictly needs. The reason it has
them is that the RAG work genuinely wants Python — pypdf for PDF text, the
embedding and LLM SDKs, the retrieval pipeline — while the realtime chat wants a
long-lived Socket.IO process, which Node does well. Splitting on that line is
defensible. Splitting for its own sake is not.

The original build had the *shape* of this split but not the discipline. Both the
Node server (via Drizzle) and the Python service (via raw `CREATE TABLE IF NOT
EXISTS` at startup) created tables. Each Python class opened its own connection
pool. The result was a schema with two authors and no migration history for half
of it.

## Decision

Keep the three services, and enforce the boundaries that make the split mean
something.

1. **The Node server is the only owner of the database schema.** Every table,
   column, and index is defined in `server/src/db/schema.ts` and applied by a
   Drizzle migration. The AI service reads and writes *rows*; it never issues
   DDL.

2. **The browser only ever talks to the Node server.** The AI service is not
   exposed to the internet. The server proxies to it, which is what lets
   authorization, rate limiting, and the `@ai` gate live in exactly one place.

3. **One connection pool per service.**

4. **A correlation ID crosses every hop.** The server generates one per request,
   forwards it as `X-Correlation-Id`, and the AI service logs under it, so a
   single user action is traceable across all three tiers.

## Consequences

The PDF upload feature shows the boundary working. Text extraction needs pypdf,
so it happens in Python — but the extracted text is handed straight back, and the
*server* is what writes it to `group_papers.full_text`. Python never touches the
schema, even for a feature that is fundamentally Python's job.

The cost is a network hop on every AI call, and the schema and the Python code
that reads it can drift (nothing type-checks that boundary). Both are acceptable
at this size. If the AI service ever needed its own tables, the honest move would
be its own database — not a second author on this one.
