# AI Features Documentation

## Overview

OpenResearch provides AI-powered features that help research groups collaborate more effectively. All AI features require the `@ai` trigger to activate.

## Features

### 1. Group AI Chat

Real-time AI assistance within group chat sessions, with context from all papers and discussions in the group.

**How to Use:**
```
@ai What papers in our group discuss transformer architectures?
@ai Can you summarize the key findings from our recent papers?
@ai How does Paper A relate to Paper B?
```

**API:**
```typescript
// HTTP (via AI service proxy)
POST /api/ai/groups/:groupId/chat
{
  "prompt": "@ai your question here",
  "session_id": "optional-session-id",
  "user_id": "user-uuid"
}

// Socket.IO (recommended for real-time)
socket.emit('message:send', {
  sessionId: 'session-id',
  content: '@ai your question here'
});
```

### 2. Paper Q&A

Ask specific questions about papers in your group's collection.

**How to Use:**
- Navigate to a paper in your group
- Click "Ask @ai" button
- Type your question

**Questions you can ask:**
```
@ai What is the main contribution of this paper?
@ai What methodology was used?
@ai What are the limitations mentioned?
@ai How does this compare to previous work?
@ai What datasets were used for evaluation?
```

**API:**
```typescript
// HTTP
POST /api/groups/:groupId/papers/:paperId/question
{
  "question": "@ai What is the methodology?",
  "session_id": "optional-session-id"
}

// Socket.IO (includes groupId for context isolation)
socket.emit('paper:question', {
  paperId: 'paper-id',
  groupId: 'group-id',
  question: '@ai What is the methodology?',
  sessionId: 'optional-session-id'
});
```

### 3. Paper Summarization

Generate AI summaries of papers with key points extraction.

**How to Use:**
- Navigate to a paper in your group
- Click "Summarize" button
- View generated summary and key points

**API:**
```typescript
// HTTP
POST /api/groups/:groupId/papers/:paperId/summarize
{
  "session_id": "optional-session-id"
}

// Socket.IO
socket.emit('paper:summarize', {
  paperId: 'paper-id'
});
```

**Response:**
```json
{
  "summary": "This paper presents a novel approach to...",
  "key_points": [
    "Introduces new transformer variant",
    "Achieves state-of-the-art on GLUE benchmark",
    "Reduces training time by 40%"
  ],
  "paper_id": "paper-123",
  "group_id": "group-456"
}
```

### 4. Paper Discovery & Recommendations

AI-powered paper recommendations based on group context and interests.

**Types of Recommendations:**

1. **Trending Papers**: Popular across all groups
2. **Personal Recommendations**: Based on your interests and saved papers
3. **Group Recommendations**: Based on your group's paper collection

**API:**
```typescript
// Trending papers
GET /api/recommendations/trending

// Personal recommendations
GET /api/recommendations/user?limit=10

// Group recommendations
GET /api/recommendations/group/:groupId?limit=10

// Similar papers
GET /api/recommendations/similar/:paperId?groupId=optional
```

### 5. Vector Semantic Search

Search across group papers, summaries, and notes using semantic similarity.

**How to Use:**
- Search by meaning, not just keywords
- Find related content across papers
- Discover connections between research

**API:**
```typescript
POST /api/groups/:groupId/search
{
  "query": "transformer attention mechanisms",
  "limit": 10,
  "content_types": ["paper", "summary", "qa"]
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "vector-uuid",
      "content": "Paper abstract about transformers...",
      "content_type": "paper",
      "paper_id": "paper-uuid",
      "similarity": 0.92,
      "metadata": {}
    }
  ],
  "total": 10
}
```

### 6. Group Report Generation

Generate PDF reports summarizing group activity and research.

**Report Types:**
- **Weekly**: Past 7 days of activity
- **Monthly**: Past 30 days of activity
- **Custom**: Custom date range and sections

**Available Sections:**
- Overview: Group statistics and highlights
- Papers: List of papers with summaries
- Discussions: Key chat highlights
- Insights: AI-generated analysis
- Summary: Executive summary
- Citations: Bibliography format

**API:**
```typescript
POST /api/reports/group/:groupId/generate
{
  "report_type": "weekly",
  "sections": ["overview", "papers", "insights"],
  "custom_title": "Q1 Research Summary"  // optional
}
```

**Response:**
```json
{
  "report_id": "report-123",
  "title": "Q1 Research Summary",
  "status": "completed",
  "download_url": "/api/reports/report-123/download",
  "summary": "Generated report covering..."
}
```

## @ai Trigger Requirement

**All AI interactions require the `@ai` trigger.**

### Why?
1. **Intentional Activation**: Prevents accidental AI queries
2. **Cost Control**: Only processes intentional requests
3. **Clear Interactions**: Makes AI responses explicit
4. **Auditability**: Easy to track AI usage

### Valid Triggers
```javascript
"@ai what is this about?"      // Start
"Hey @ai can you help?"        // Middle  
"Explain this @ai"             // End
"@AI UPPERCASE"                // Case insensitive
"@Ai Mixed case"               // Also works
```

### Invalid (Will Return 400 Error)
```javascript
"what is this about?"          // Missing @ai
"ai what is this?"             // Missing @ symbol
"@aibot help me"               // Different trigger (partial match works)
```

## Context & RAG

### How Context Works

1. **Paper Embeddings**: When papers are added, their content is embedded
2. **Summary Storage**: Generated summaries are embedded for future retrieval
3. **Q&A History**: Question-answer pairs are stored and embedded
4. **Chat Context**: Relevant chat history is available for context

### Group Isolation

All context is isolated by group:
- Group A cannot see Group B's papers
- Recommendations are group-specific
- AI responses only use the group's context

## Best Practices

### 1. Add Relevant Papers
The more papers in your group, the better the AI context.

### 2. Use Specific Questions
```
// ✅ Good
"@ai What specific techniques does Paper X use for data augmentation?"

// ❌ Less effective
"@ai Tell me about this paper"
```

### 3. Reference Papers by Name
```
"@ai How does the methodology in 'Attention is All You Need' compare to 'BERT'?"
```

### 4. Generate Summaries
Summaries improve future RAG retrieval.

### 5. Ask Follow-up Questions
Context from previous questions is retained in the session.

## Error Handling

### Common Errors

**400: Missing @ai Trigger**
```json
{
  "error": "Question must contain @ai trigger. AI only responds when triggered by @ai."
}
```

**404: Paper Not Found**
```json
{
  "error": "Paper not found or not in group"
}
```

**403: Not a Group Member**
```json
{
  "error": "Group not found or access denied"
}
```

**500: AI Service Error**
```json
{
  "error": "AI service temporarily unavailable"
}
```

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Group Chat | 60/minute |
| Paper Q&A | 30/minute |
| Summarize | 10/minute |
| Report Generation | 5/hour |
| Recommendations | 60/minute |

## Configuration

### Server Environment Variables
```env
AI_SERVICE_URL=http://ai-service:8000
```

### AI Service Environment Variables
```env
GROQ_API_KEY=your-groq-api-key
OPENAI_API_KEY=your-openai-api-key-for-embeddings
DATABASE_URL=postgresql://...
GROQ_MODEL=llama-3.3-70b-versatile
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
DEBUG=false
```
