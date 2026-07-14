# ADR 0003 — Hosted embeddings instead of local transformer models

**Status:** Accepted
**Date:** 2026-07

## Context

The AI service embedded text locally with SPECTER2 (a BERT variant trained on
scientific papers), with all-MiniLM-L6-v2 as a fallback and a cross-encoder for
reranking. Three transformer models, on top of PyTorch, baked into the image at
build time.

The choice had a real argument behind it: SPECTER2 is trained on academic papers,
which is exactly this corpus, and running locally means no paper text ever leaves
the machine.

What it cost:

| | |
|---|---|
| Image size | **2.81 GB** — measured, and that is *before* the three models were baked in |
| Memory ceiling | 4 GB reserved in compose |
| Cold start | 300-second healthcheck grace period, because loading the models took that long |
| First query | slower still — the reranker was lazy-loaded on first use, so a real user paid for it |

For a portfolio project that has to start on a laptop in front of an interviewer,
that is a bad trade.

## Decision

Use Gemini embeddings over plain HTTPS. Delete PyTorch, sentence-transformers,
transformers, and the cross-encoder reranker.

The deciding detail is dimensionality. The existing column is `vector(768)` with
an HNSW index built for that width, so a model of any other width would force a
migration and a full re-index.

`gemini-embedding-001` natively emits **3072** dimensions — which would not fit.
But it is trained with **Matryoshka representation learning**: the leading
dimensions of its vector are themselves a valid, usable embedding, so the model
can be asked for a prefix. Passing `outputDimensionality: 768` returns exactly
that, and the schema is untouched.

Truncating has a consequence worth knowing: it breaks unit length. The real API
returns a 768-prefix with an L2 norm around **0.59**, not 1.0. Cosine distance is
scale-invariant, so pgvector would survive it — but the similarity scores handed
to the UI would not be comparable between vectors, and an inner-product index
would silently rank wrongly. So the service re-normalises every vector once, on
the way out, and a test asserts it.

(The original choice here was `text-embedding-004`, which is natively 768. Google
retired it; the model name is one line of config, which is the point of keeping
the provider behind one class.)

Retrieval keeps hybrid search (pgvector cosine + Postgres BM25, fused with
Reciprocal Rank Fusion). Dropping the cross-encoder means RRF's ranking is now
final rather than a candidate list for reranking.

## Consequences

| | Before | After |
|---|---|---|
| ai-service image | 2.81 GB+ | **480 MB** |
| Memory | 4 GB | ~300 MB |
| Cold start | minutes | seconds |
| Embedding call | local, ~free | network hop, free tier |

What was given up, honestly: paper text now leaves the machine on its way to
Google, so this would not be acceptable for confidential or embargoed research.
Retrieval quality is a general-purpose model's rather than a
scientific-paper-specific one's, and dropping the cross-encoder costs some
precision on the final ranking. Embedding is now a network call that can rate-limit
or fail — so it retries with backoff, and falls back to a deterministic
hash-derived vector rather than crashing (degraded retrieval beats a 500).

The embedding interface is one class with two methods. Going back to a local model,
or moving to another provider, means rewriting `embeddings.py` and nothing else —
as long as the replacement also emits 768 dimensions.
