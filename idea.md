# 🚀 Academic Research Copilot — Vibecoding Sprint Plan

> **Goal:** Ship all remaining features today. Each section includes what to build, where in the codebase, and copy-pasteable implementation hints.

---

## Table of Contents

1. [Citation Anchoring in Survey Output](#1-citation-anchoring-in-survey-output) ⭐ *Start here*
2. [Intent Confidence UI Feedback](#2-intent-confidence-ui-feedback)
3. [Methodology Extraction Matrix](#3-methodology-extraction-matrix)
4. [Embedding-Space Gap Finder](#4-embedding-space-gap-finder)
5. [Claim Lineage Tracker](#5-claim-lineage-tracker)
6. [Reviewer Anticipator](#6-reviewer-anticipator)
7. [Artifact Relevance Scoring](#7-artifact-relevance-scoring)
8. [Stream/Tool Deduplication Refactor](#8-streamtool-deduplication-refactor)
9. [ReAct Short-Circuit for Single-Tool Intents](#9-react-short-circuit-for-single-tool-intents)

---

## 1. Citation Anchoring in Survey Output

**Priority:** 🔥 Highest  
**Effort:** Low  
**Files:** `ai-service/tools/survey_literature.py`, frontend chat renderer

### What To Build

After `survey_literature` generates its synthesis text, run a post-processing pass that:
1. Embeds each sentence of the output with SPECTER2
2. Finds the most similar source chunk from the retrieved corpus
3. Attaches `source_ids[]` metadata to each sentence
4. Returns annotated output that the frontend renders as inline citation chips

### Backend — `ai-service/tools/survey_literature.py`

Add this function after your existing synthesis step:

```python
async def anchor_citations(synthesis: str, source_chunks: list[dict]) -> dict:
    """
    Post-process synthesis output to attach source citations per sentence.
    Returns { "text": str, "sentences": [{ "text": str, "source_ids": list[str] }] }
    """
    import re
    from sklearn.metrics.pairwise import cosine_similarity
    import numpy as np

    sentences = re.split(r'(?<=[.!?])\s+', synthesis.strip())
    
    # Embed all sentences + chunks with SPECTER2 (reuse your existing embedder)
    sentence_embeddings = await embed_texts(sentences)       # shape: (n_sentences, dim)
    chunk_embeddings = [c["embedding"] for c in source_chunks]  # already stored
    
    chunk_matrix = np.array(chunk_embeddings)
    annotated = []

    for i, sentence in enumerate(sentences):
        sent_vec = np.array(sentence_embeddings[i]).reshape(1, -1)
        sims = cosine_similarity(sent_vec, chunk_matrix)[0]
        
        # Take top-3 chunks above threshold as citations
        top_indices = np.where(sims > 0.72)[0]
        top_indices = sorted(top_indices, key=lambda x: sims[x], reverse=True)[:3]
        
        source_ids = [source_chunks[idx]["paper_id"] for idx in top_indices]
        annotated.append({ "text": sentence, "source_ids": source_ids })

    return { "sentences": annotated, "raw_text": synthesis }
```

Call this at the end of your `survey_literature` tool before returning:

```python
# At the end of survey_literature tool
anchored = await anchor_citations(synthesis_text, retrieved_chunks)
return { **existing_result, "anchored_output": anchored }
```

### Frontend — Chat Message Renderer

In your message rendering component (wherever you render assistant messages):

```tsx
// components/CitationAnchoredText.tsx
interface AnnotatedSentence {
  text: string;
  source_ids: string[];
}

interface Props {
  sentences: AnnotatedSentence[];
  papers: Record<string, { title: string; authors: string[]; url: string }>;
}

export function CitationAnchoredText({ sentences, papers }: Props) {
  const [hoveredCitation, setHoveredCitation] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      {sentences.map((sentence, i) => (
        <span key={i}>
          {sentence.text}{' '}
          {sentence.source_ids.map((id) => (
            <span
              key={id}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs 
                         bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200 
                         transition-colors ml-0.5"
              onMouseEnter={() => setHoveredCitation(id)}
              onMouseLeave={() => setHoveredCitation(null)}
              onClick={() => window.open(papers[id]?.url, '_blank')}
            >
              {papers[id]?.authors?.[0]?.split(' ').pop()} {/* Last name */}
              {' '}
              {papers[id] && new Date().getFullYear()} {/* Replace with actual year */}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}
```

---

## 2. Intent Confidence UI Feedback

**Priority:** High  
**Effort:** Low  
**Files:** `ai-service/intent_classifier.py`, `server/` (Socket.IO events), frontend chat input

### What To Build

When intent score is between 0.75–0.85 (ambiguous zone), surface the detected intent to the user with a one-click correction option before the agent runs.

### Backend — `ai-service/intent_classifier.py`

Change your classifier to return the confidence score alongside the intent:

```python
def classify_intent(query: str) -> dict:
    embedding = embed_query(query)
    scores = cosine_similarity([embedding], phrase_embeddings)[0]
    best_idx = scores.argmax()
    best_score = scores[best_idx]
    best_intent = INTENT_LABELS[best_idx]

    return {
        "intent": best_intent,
        "confidence": float(best_score),
        "ambiguous": 0.75 <= best_score < 0.85,
        "fallback": best_score < 0.75
    }
```

### Backend — Emit intent before running agent

In your `stream_task_events()` or task runner, emit the intent classification result first:

```python
# Before starting the agent
classification = classify_intent(user_query)

await sio.emit('intent_classified', {
    'session_id': session_id,
    'intent': classification['intent'],
    'confidence': classification['confidence'],
    'ambiguous': classification['ambiguous'],
    'alternatives': get_top_k_intents(query, k=3)  # Return top 3 for correction UI
}, room=session_id)

# If ambiguous, wait for user confirmation (or timeout after 5s and proceed)
if classification['ambiguous']:
    confirmed_intent = await wait_for_intent_confirmation(session_id, timeout=5)
    final_intent = confirmed_intent or classification['intent']
else:
    final_intent = classification['intent']
```

### Frontend — Intent Confirmation Banner

```tsx
// components/IntentBanner.tsx
const INTENT_LABELS: Record<string, string> = {
  literature_survey: '📚 Literature Survey',
  gap_analysis: '🔍 Gap Analysis',
  paper_retrieval: '📄 Paper Retrieval',
  fact_check: '✅ Fact Check',
  novelty_assessment: '💡 Novelty Assessment',
  research_mentor: '🎓 Research Mentor',
  paper_writing: '✍️ Paper Writing',
  research_planning: '🗺️ Research Planning',
  deep_research: '🔬 Deep Research',
};

export function IntentBanner({ intent, confidence, ambiguous, alternatives, onCorrect }) {
  if (!ambiguous) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 
                    rounded-lg text-sm mb-2">
      <span className="text-amber-600">⚡</span>
      <span className="text-amber-800">
        Detected: <strong>{INTENT_LABELS[intent]}</strong>
        <span className="text-amber-500 ml-1">({Math.round(confidence * 100)}% confident)</span>
      </span>
      <div className="flex gap-1 ml-auto">
        {alternatives.map(alt => (
          <button
            key={alt.intent}
            onClick={() => onCorrect(alt.intent)}
            className="px-2 py-0.5 rounded text-xs bg-white border border-amber-300 
                       hover:bg-amber-100 text-amber-700"
          >
            {INTENT_LABELS[alt.intent]}
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## 3. Methodology Extraction Matrix

**Priority:** High  
**Effort:** Medium  
**Files:** `ai-service/tools/` (new tool), `server/` (new endpoint), frontend (new component)

### What To Build

A new tool that extracts structured metadata from papers and returns a filterable comparison table. This is pure structured extraction — no complex retrieval needed.

### Backend — `ai-service/tools/methodology_extractor.py` (new file)

```python
from pydantic import BaseModel
from langchain_core.tools import tool
from typing import Optional

class StudyMetadata(BaseModel):
    paper_id: str
    title: str
    year: Optional[int]
    design: str                    # RCT, observational, meta-analysis, etc.
    sample_size: Optional[int]
    population: Optional[str]
    measures: list[str]
    statistical_methods: list[str]
    limitations: list[str]
    replication_risk: str          # low / medium / high
    doi: Optional[str]

EXTRACTION_PROMPT = """
Extract structured methodology information from this academic paper abstract/text.
Return ONLY valid JSON matching this schema exactly. If a field is unknown, use null.

Schema:
{
  "design": "study design type (RCT/observational/meta-analysis/systematic review/case study/etc)",
  "sample_size": integer or null,
  "population": "description of study population or null",
  "measures": ["list", "of", "outcome", "measures"],
  "statistical_methods": ["list", "of", "statistical", "methods", "used"],
  "limitations": ["list", "of", "stated", "limitations"],
  "replication_risk": "low|medium|high based on sample size, design, and field"
}

Paper text:
{text}
"""

@tool
async def extract_methodology(session_id: str) -> dict:
    """Extract and compare methodology across all papers in session."""
    papers = await get_session_papers(session_id)
    results = []
    
    for paper in papers:
        text = f"{paper.title}\n\n{paper.abstract}"
        response = await llm.ainvoke(EXTRACTION_PROMPT.format(text=text))
        
        try:
            metadata = json.loads(response.content)
            results.append(StudyMetadata(
                paper_id=paper.id,
                title=paper.title,
                year=paper.year,
                doi=paper.doi,
                **metadata
            ).dict())
        except Exception:
            continue  # Skip malformed extractions
    
    # Store in Postgres for persistence
    await store_methodology_matrix(session_id, results)
    return { "matrix": results, "count": len(results) }
```

### Frontend — `components/MethodologyMatrix.tsx`

Use TanStack Table for filtering/sorting:

```bash
npm install @tanstack/react-table
```

```tsx
import { useReactTable, getCoreRowModel, getFilteredRowModel, 
         getSortedRowModel, flexRender } from '@tanstack/react-table';

const columns = [
  { accessorKey: 'title', header: 'Paper', size: 200 },
  { accessorKey: 'year', header: 'Year', size: 60 },
  { accessorKey: 'design', header: 'Design', size: 120 },
  { accessorKey: 'sample_size', header: 'N', size: 60 },
  { accessorKey: 'population', header: 'Population', size: 150 },
  { 
    accessorKey: 'replication_risk', 
    header: 'Replic. Risk',
    cell: ({ getValue }) => {
      const risk = getValue() as string;
      const colors = { low: 'text-green-600', medium: 'text-amber-600', high: 'text-red-600' };
      return <span className={`font-medium ${colors[risk]}`}>{risk}</span>;
    }
  },
];

export function MethodologyMatrix({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');

  // Fetch on mount
  useEffect(() => { fetchMatrix(sessionId).then(setData); }, [sessionId]);

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-3">
      <input
        value={globalFilter}
        onChange={e => setGlobalFilter(e.target.value)}
        placeholder="Filter papers..."
        className="w-full px-3 py-2 border rounded-lg text-sm"
      />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} className="px-3 py-2 text-left font-medium text-gray-600 
                                            cursor-pointer hover:bg-gray-100"
                      onClick={h.column.getToggleSortingHandler()}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="border-t hover:bg-gray-50">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Add to intent classifier

```python
# intent_classifier.py — add new intent
'methodology_extraction': [
    "compare methodologies across papers",
    "extract study designs",
    "methodology matrix",
    "compare sample sizes",
    "research design comparison"
]
```

---

## 4. Embedding-Space Gap Finder

**Priority:** 🔥 Very High (your moat)  
**Effort:** Medium  
**Files:** `ai-service/tools/analyze_gaps.py`

### What To Build

Augment your existing `analyze_gaps` tool with geometric analysis of the SPECTER2 embedding space. Sparse regions = understudied areas. This makes gap detection data-driven rather than purely LLM-inferred.

### Backend — Add to `analyze_gaps.py`

```python
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_distances

async def find_embedding_space_gaps(session_id: str, query: str) -> list[dict]:
    """
    Cluster session paper embeddings and find sparse regions = research gaps.
    Returns list of gap descriptions with supporting evidence.
    """
    # Pull all paper embeddings for this session
    papers_with_embeddings = await get_session_paper_embeddings(session_id)
    
    if len(papers_with_embeddings) < 5:
        return []  # Not enough papers to cluster meaningfully
    
    embeddings = np.array([p['embedding'] for p in papers_with_embeddings])
    papers = [p['paper'] for p in papers_with_embeddings]
    
    # Determine optimal k (simple heuristic: sqrt of paper count)
    k = min(max(3, int(np.sqrt(len(papers)))), 10)
    
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = kmeans.fit_predict(embeddings)
    centers = kmeans.cluster_centers_
    
    # Find sparse clusters (small paper count = understudied area)
    cluster_sizes = np.bincount(labels)
    sparse_threshold = np.percentile(cluster_sizes, 30)  # Bottom 30% = sparse
    sparse_clusters = np.where(cluster_sizes <= sparse_threshold)[0]
    
    # For each sparse cluster, find what topics it represents
    gap_descriptions = []
    for cluster_idx in sparse_clusters:
        cluster_papers = [papers[i] for i, l in enumerate(labels) if l == cluster_idx]
        
        # Ask LLM to describe what this cluster represents
        cluster_titles = '\n'.join([p['title'] for p in cluster_papers[:5]])
        gap_prompt = f"""
        These papers represent an understudied cluster in the research space:
        {cluster_titles}
        
        Based on these papers and the research query "{query}":
        1. What specific research gap does this sparse cluster represent?
        2. What questions remain unanswered in this area?
        3. Rate the severity: low / medium / high
        
        Respond in JSON: {{"gap": "...", "questions": ["..."], "severity": "..."}}
        """
        
        response = await llm.ainvoke(gap_prompt)
        try:
            gap_data = json.loads(response.content)
            gap_descriptions.append({
                **gap_data,
                "paper_count": len(cluster_papers),
                "representative_papers": [p['title'] for p in cluster_papers[:3]]
            })
        except Exception:
            continue
    
    return sorted(gap_descriptions, key=lambda x: 
                  {'high': 0, 'medium': 1, 'low': 2}[x.get('severity', 'low')])


# In your main analyze_gaps tool, call this BEFORE the LLM pass and inject results:
async def analyze_gaps(query: str, session_id: str, context: str) -> str:
    # Existing gather context...
    gathered = await _gather_context(query)
    
    # NEW: Add geometric gap detection
    geometric_gaps = await find_embedding_space_gaps(session_id, query)
    
    gap_context = ""
    if geometric_gaps:
        gap_context = "\n\nGEOMETRIC ANALYSIS — Embedding space sparse regions:\n"
        for g in geometric_gaps:
            gap_context += f"- [{g['severity'].upper()}] {g['gap']} "
            gap_context += f"(only {g['paper_count']} papers found)\n"
    
    # Pass to your existing LLM gap analysis prompt
    final_prompt = GAPS_PROMPT.format(
        context=gathered + gap_context,
        query=query
    )
    # ... rest of existing code
```

---

## 5. Claim Lineage Tracker

**Priority:** High  
**Effort:** High  
**Files:** `ai-service/tools/fact_check.py`, new DB schema, frontend (React Flow)

### What To Build

Extend fact_check to build a citation graph per claim, tracing how it propagated through the literature. Visualize as an interactive tree.

### Database Schema — Add to your migrations

```sql
CREATE TABLE claim_lineage_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  claim TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  paper_title TEXT,
  paper_year INT,
  confidence FLOAT,  -- how strongly this paper asserts the claim
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE claim_lineage_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  claim_id UUID NOT NULL,
  from_paper_id TEXT NOT NULL,  -- paper that cites
  to_paper_id TEXT NOT NULL,    -- paper being cited for this claim
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Backend — Extend `fact_check.py`

```python
async def build_claim_lineage(claim: str, session_id: str, papers: list) -> dict:
    """
    Trace a claim backward through citations to find its origin.
    Returns a graph structure for React Flow.
    """
    nodes = []
    edges = []
    visited = set()
    
    async def trace_paper(paper, depth=0):
        if paper['id'] in visited or depth > 4:  # Max 4 hops
            return
        visited.add(paper['id'])
        
        # Check if this paper makes the claim (via semantic similarity)
        claim_embedding = await embed_text(claim)
        paper_embedding = await get_paper_embedding(paper['id'])
        similarity = cosine_similarity([claim_embedding], [paper_embedding])[0][0]
        
        if similarity > 0.65:  # Paper is relevant to claim
            nodes.append({
                'id': paper['id'],
                'data': {
                    'label': paper['title'][:60] + '...',
                    'year': paper.get('year'),
                    'confidence': float(similarity),
                    'authors': paper.get('authors', [])
                },
                'type': 'claimNode'
            })
            
            # Find papers this one cited (from your DB or ArXiv)
            citations = await get_paper_citations(paper['id'])
            for cited in citations:
                edges.append({
                    'id': f"{paper['id']}->{cited['id']}",
                    'source': cited['id'],  # Arrow FROM cited TO citing
                    'target': paper['id'],
                    'animated': depth == 0
                })
                await trace_paper(cited, depth + 1)
    
    # Start from all session papers that assert the claim
    relevant_papers = await find_papers_asserting_claim(claim, session_id)
    for paper in relevant_papers[:5]:
        await trace_paper(paper)
    
    return { 'nodes': nodes, 'edges': edges, 'claim': claim }
```

### Frontend — `components/ClaimLineageGraph.tsx`

```bash
npm install @xyflow/react
```

```tsx
import { ReactFlow, Background, Controls, MiniMap, 
         Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Custom node component
function ClaimNode({ data }) {
  const confidenceColor = data.confidence > 0.85 ? '#16a34a' : 
                          data.confidence > 0.70 ? '#d97706' : '#dc2626';
  return (
    <div className="px-3 py-2 bg-white border-2 rounded-lg shadow-sm max-w-[200px]"
         style={{ borderColor: confidenceColor }}>
      <Handle type="target" position={Position.Left} />
      <div className="text-xs font-medium text-gray-800 leading-tight">{data.label}</div>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-xs text-gray-400">{data.year}</span>
        <span className="text-xs ml-auto" style={{ color: confidenceColor }}>
          {Math.round(data.confidence * 100)}%
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function ClaimLineageGraph({ claim, sessionId }) {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClaimLineage(claim, sessionId)
      .then(setGraph)
      .finally(() => setLoading(false));
  }, [claim, sessionId]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">
    Tracing claim lineage...
  </div>;

  return (
    <div className="h-96 border rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium text-gray-700">
        📍 Claim: "{claim}"
      </div>
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={{ claimNode: ClaimNode }}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
```

---

## 6. Reviewer Anticipator

**Priority:** Medium-High  
**Effort:** Low  
**Files:** `ai-service/tools/` (new tool, or extend `provide_mentoring`)

### What To Build

Given the user's research question and the literature, predict the top 3–5 critiques a peer reviewer would raise, drawn from how other papers in the field describe limitations and open questions.

### Backend — Add as a new tool or extend mentoring

```python
REVIEWER_PROMPT = """
You are a rigorous peer reviewer for a top academic journal. 

The researcher is studying: {research_question}

Based on the following literature, which highlights common methodological critiques, 
limitations, and open questions in this field:

{literature_context}

Generate the 5 most likely reviewer critiques this paper will receive. For each:
1. State the critique clearly
2. Explain why reviewers commonly raise this issue (cite field patterns)
3. Suggest a preemptive response the author could include

Format as JSON array:
[{{"critique": "...", "reasoning": "...", "suggested_response": "...", "severity": "major|minor"}}]
"""

@tool
async def anticipate_reviewer_critiques(research_question: str, session_id: str) -> dict:
    """Predict peer reviewer critiques based on field patterns."""
    context = await _gather_context(research_question)
    
    response = await llm.ainvoke(
        REVIEWER_PROMPT.format(
            research_question=research_question,
            literature_context=context
        )
    )
    
    critiques = json.loads(response.content)
    return {
        "research_question": research_question,
        "critiques": critiques,
        "major_count": sum(1 for c in critiques if c['severity'] == 'major')
    }
```

### Frontend — Critique Cards

```tsx
export function ReviewerCritiques({ critiques }) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-800 flex items-center gap-2">
        🔬 Anticipated Reviewer Critiques
      </h3>
      {critiques.map((c, i) => (
        <div key={i} className={`p-3 rounded-lg border-l-4 ${
          c.severity === 'major' 
            ? 'border-red-400 bg-red-50' 
            : 'border-amber-400 bg-amber-50'
        }`}>
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-sm text-gray-800">{c.critique}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
              c.severity === 'major' 
                ? 'bg-red-100 text-red-700' 
                : 'bg-amber-100 text-amber-700'
            }`}>{c.severity}</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">{c.reasoning}</p>
          <details className="mt-2">
            <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
              💡 Suggested response
            </summary>
            <p className="text-xs text-gray-700 mt-1 bg-white rounded p-2 border">
              {c.suggested_response}
            </p>
          </details>
        </div>
      ))}
    </div>
  );
}
```

---

## 7. Artifact Relevance Scoring

**Priority:** Medium  
**Effort:** Low  
**Files:** `ai-service/agentic.py` or wherever you inject artifact context

### What To Build

Before injecting stored artifacts into agent context, score them by recency + semantic similarity to the current query and cap at top-5. Prevents context bloat and noise.

### Backend

```python
async def get_relevant_artifacts(session_id: str, current_query: str, top_k: int = 5) -> list:
    """Score and filter artifacts by relevance to current query."""
    all_artifacts = await load_session_artifacts(session_id)
    
    if not all_artifacts:
        return []
    
    query_embedding = await embed_text(current_query)
    now = datetime.utcnow()
    
    scored = []
    for artifact in all_artifacts:
        # Semantic similarity score (0-1)
        semantic_score = cosine_similarity(
            [query_embedding], 
            [artifact['embedding']]
        )[0][0]
        
        # Recency score — decay over 7 days (0-1)
        age_hours = (now - artifact['created_at']).total_seconds() / 3600
        recency_score = np.exp(-age_hours / 168)  # 168 hours = 7 days
        
        # Combined score (weight semantic more)
        combined = 0.7 * semantic_score + 0.3 * recency_score
        scored.append((combined, artifact))
    
    # Return top-k by combined score
    scored.sort(key=lambda x: x[0], reverse=True)
    return [artifact for _, artifact in scored[:top_k]]
```

Replace your current artifact injection with:

```python
# In agentic.py — before building agent context
relevant_artifacts = await get_relevant_artifacts(session_id, user_query, top_k=5)
artifact_context = format_artifacts(relevant_artifacts)  # your existing formatter
```

---

## 8. Stream/Tool Deduplication Refactor

**Priority:** Medium  
**Effort:** Medium  
**Files:** `ai-service/tools/survey_literature.py`, `ai-service/agentic.py`

### What To Build

Eliminate the duplicated survey pipeline in `stream_task_events()`. Make tools accept an optional streaming callback so the same code path handles both streaming and non-streaming.

### Pattern

```python
# In survey_literature.py
async def survey_literature(
    query: str, 
    session_id: str,
    stream_callback: Optional[Callable] = None  # NEW optional param
) -> dict:
    
    async def emit(event: str, data: dict):
        """Emit progress if streaming, otherwise no-op."""
        if stream_callback:
            await stream_callback(event, data)
    
    await emit('progress', {'phase': 'generating_queries', 'pct': 10})
    sub_queries = await generate_sub_queries(query)
    
    await emit('progress', {'phase': 'fetching_papers', 'pct': 30})
    papers = await fetch_papers(sub_queries)
    
    await emit('progress', {'phase': 'reranking', 'pct': 50})
    reranked = await rerank(papers, query)
    
    await emit('progress', {'phase': 'synthesizing', 'pct': 75})
    synthesis = await synthesize(reranked, query)
    
    await emit('complete', {'result': synthesis})
    return synthesis


# In agentic.py — stream_task_events()
# BEFORE: reimplemented the whole pipeline inline
# AFTER: just call the tool with a callback

async def stream_task_events(query, session_id, sio):
    async def callback(event, data):
        await sio.emit(event, {'session_id': session_id, **data})
    
    if intent == 'literature_survey':
        result = await survey_literature(query, session_id, stream_callback=callback)
    # ... other intents similarly
```

---

## 9. ReAct Short-Circuit for Single-Tool Intents

**Priority:** Medium  
**Effort:** Low  
**Files:** `ai-service/agentic.py`

### What To Build

Skip the ReAct loop for intents that only have one available tool. Call the tool directly, saving 1–2 LLM inference calls per request.

```python
# In agentic.py

SINGLE_TOOL_INTENTS = {
    'paper_retrieval': retrieve_papers,
    'fact_check': fact_check,
    'research_mentor': provide_mentoring,
    'research_planning': plan_research,
}

async def run_task(query: str, session_id: str, intent: str) -> dict:
    # Short-circuit for single-tool intents
    if intent in SINGLE_TOOL_INTENTS:
        tool_fn = SINGLE_TOOL_INTENTS[intent]
        result = await tool_fn(query=query, session_id=session_id)
        return { "output": result, "intent": intent, "short_circuited": True }
    
    # Multi-tool intents go through full ReAct loop
    agent = create_react_agent(llm, get_tools_for_intent(intent))
    result = await agent.ainvoke({
        "messages": build_messages(query, session_id)
    })
    return result
```

---

## ✅ Completion Checklist

### AI Service (`ai-service/`)
- [ ] **Citation anchoring** — add `anchor_citations()` to `survey_literature.py`
- [ ] **Intent confidence** — update `intent_classifier.py` to return score + ambiguous flag
- [ ] **Methodology extractor** — create `tools/methodology_extractor.py`
- [ ] **Add methodology intent** to classifier phrase embeddings
- [ ] **Embedding gap finder** — add `find_embedding_space_gaps()` to `analyze_gaps.py`
- [ ] **Claim lineage builder** — extend `fact_check.py`
- [ ] **Reviewer anticipator** — add `anticipate_reviewer_critiques` tool
- [ ] **Artifact scoring** — replace artifact injection in `agentic.py`
- [ ] **Stream deduplication** — add `stream_callback` param to `survey_literature.py`
- [ ] **ReAct short-circuit** — update `run_task()` in `agentic.py`

### Server (`server/`)
- [ ] **Expose methodology matrix endpoint** — `GET /api/sessions/:id/methodology`
- [ ] **Expose claim lineage endpoint** — `POST /api/sessions/:id/claim-lineage`
- [ ] **Emit `intent_classified` Socket.IO event** before agent runs
- [ ] **Handle intent correction** Socket.IO event from client

### Database
- [ ] **Add `methodology_matrix` table** (or JSONB column on sessions)
- [ ] **Add `claim_lineage_nodes` table**
- [ ] **Add `claim_lineage_edges` table**
- [ ] Run migrations

### Frontend (`client/`)
- [ ] **`CitationAnchoredText`** component — inline citation chips on survey output
- [ ] **`IntentBanner`** component — ambiguous intent correction UI
- [ ] **`MethodologyMatrix`** component — TanStack Table with filters
- [ ] **`ClaimLineageGraph`** component — React Flow visualization
- [ ] **`ReviewerCritiques`** component — critique cards with severity
- [ ] **Install deps:** `@tanstack/react-table`, `@xyflow/react`
- [ ] Wire new Socket.IO events (`intent_classified`) to UI state

---

## 📦 Dependencies to Install

```bash
# Frontend
cd client
npm install @tanstack/react-table @xyflow/react

# AI Service
cd ai-service
pip install scikit-learn  # for KMeans + cosine_similarity (likely already installed)
```

---

## 🧠 Vibe-Coding Tips

- **Build citation anchoring first** — it's the foundation for lineage tracking and the fastest win
- **Test gap finder with 10+ papers in a session** — it needs enough embeddings to cluster meaningfully
- **React Flow needs explicit node positions or use `fitView`** — always pass `fitView` prop
- **The ambiguous intent banner should auto-dismiss** after 5 seconds if user doesn't interact
- **Methodology extraction is slow** — run it in the background after papers are loaded, not on-demand
- **For claim lineage, start with 2-hop traversal** — 4 hops can get slow without caching

---

*Generated for vibecoding sprint — ship it 🚀*