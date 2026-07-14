# ADR 0004 — Hybrid retrieval: vectors, BM25, and Reciprocal Rank Fusion

**Status:** Accepted
**Date:** 2026-07

## Context

Pure vector search fails in a way that is easy to demo and hard to defend.

Embeddings capture meaning, so they retrieve a passage about "attention
mechanisms" when the question asks about "transformer architectures" — which is
the whole point. But they are lossy about *exact tokens*. Ask about "ResNet-152"
or "BLEU 41.8" and semantic similarity will happily return a passage about a
different architecture with a different score, because the sentences mean roughly
the same thing.

Keyword search (BM25) has precisely the opposite failure: it nails the exact
token and misses every paraphrase.

## Decision

Run both, and fuse the rankings.

For each query the AI service issues one SQL statement that:

1. ranks chunks by **vector distance** — pgvector's `<=>` cosine operator over an
   HNSW index;
2. ranks the same chunks by **BM25** — Postgres full-text search (`ts_rank_cd`)
   over a generated `tsvector` column with a GIN index;
3. combines the two rankings with **Reciprocal Rank Fusion**:

```
score(d) = 0.6 / (60 + rank_vector(d)) + 0.4 / (60 + rank_bm25(d))
```

RRF combines *ranks*, not scores. That matters: a cosine distance and a BM25
score are not on a comparable scale, and normalising them against each other
would be arbitrary. Ranks are directly comparable. The constant `k = 60` is the
value from the original RRF paper; it damps the influence of the top position so
one engine cannot dominate on its own.

Both indexes live in the same Postgres instance as the application data, so this
is one query, not a fan-out to a separate search service.

## Consequences

The system answers both kinds of question: "what do these papers say about
attention?" (vector wins) and "what was the BLEU score?" (BM25 wins).

The weights (0.6/0.4) are a judgment call, not a measured optimum — there is no
labelled relevance set here to tune them against, and inventing one would be
theatre. They are one constant in one SQL statement.

Retrieval degrades rather than fails: if full-text search errors, the query falls
back to vector-only.

Every query is filtered by `group_id` before ranking. Group isolation is the
security boundary of the product, and it is enforced in the `WHERE` clause, not
by filtering results afterwards.
