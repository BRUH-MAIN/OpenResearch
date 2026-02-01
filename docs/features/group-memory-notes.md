# Group Memory Notes Feature

## Overview

Group Memory Notes provide a persistent knowledge base for research groups. Unlike chat messages that flow chronologically, memory notes are organized, structured facts, decisions, guidelines, and observations that groups want to retain and reference.

## Purpose

Memory notes serve as:
- **Knowledge Repository**: Store important facts and findings
- **Decision Log**: Record research decisions and rationale
- **Guidelines**: Document team conventions and workflows
- **Context for AI**: Enhance AI responses with group-specific knowledge

## Use Cases

### 1. Research Decisions
```
Type: decision
Content: "We decided to focus on transformer architectures rather than RNNs 
          because of better parallelization and state-of-the-art results."
```

### 2. Important Facts
```
Type: fact
Content: "Our dataset contains 10,000 samples with 95% accuracy validation.
          Collected from January-March 2026."
```

### 3. Team Guidelines
```
Type: guideline
Content: "When adding papers, always tag them with relevant topics and 
          include a brief summary note explaining relevance to our research."
```

### 4. General Notes
```
Type: note
Content: "Interesting observation: papers from ACL 2025 show emerging trend 
          toward few-shot learning approaches."
```

## Database Schema

Memory notes are stored in the `group_memory_notes` table:

```sql
CREATE TABLE group_memory_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  note_type VARCHAR(50) NOT NULL DEFAULT 'note',
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Note Types

| Type | Purpose | Example |
|------|---------|---------|
| `note` | General observation or note | "Interesting paper trend observed" |
| `decision` | Research decision made | "Chose BERT over GPT for our task" |
| `guideline` | Team guideline or convention | "Always cite sources in summaries" |
| `fact` | Important fact or finding | "Dataset has 95% accuracy baseline" |

## API Endpoints

### Create Memory Note

```http
POST /api/groups/:groupId/memory-notes
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "We decided to focus on BERT-based models",
  "note_type": "decision",
  "metadata": {
    "related_papers": ["paper-id-1", "paper-id-2"],
    "tags": ["architecture", "decision"]
  }
}
```

**Response:**
```json
{
  "id": "note-uuid",
  "groupId": "group-uuid",
  "userId": "user-uuid",
  "content": "We decided to focus on BERT-based models",
  "noteType": "decision",
  "metadata": {
    "related_papers": ["paper-id-1", "paper-id-2"],
    "tags": ["architecture", "decision"]
  },
  "createdAt": "2026-02-01T10:00:00Z",
  "updatedAt": "2026-02-01T10:00:00Z"
}
```

### List Memory Notes

```http
GET /api/groups/:groupId/memory-notes
Authorization: Bearer <token>
Query Parameters:
  - type: filter by note_type (optional)
  - limit: max results (default: 50)
  - offset: pagination offset (default: 0)
```

**Response:**
```json
{
  "notes": [
    {
      "id": "note-uuid",
      "groupId": "group-uuid",
      "userId": "user-uuid",
      "userName": "Alice Smith",
      "content": "We decided to focus on BERT-based models",
      "noteType": "decision",
      "metadata": {},
      "createdAt": "2026-02-01T10:00:00Z",
      "updatedAt": "2026-02-01T10:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### Get Single Memory Note

```http
GET /api/groups/:groupId/memory-notes/:noteId
Authorization: Bearer <token>
```

### Update Memory Note

```http
PATCH /api/groups/:groupId/memory-notes/:noteId
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Updated content",
  "note_type": "fact",
  "metadata": {
    "tags": ["updated"]
  }
}
```

### Delete Memory Note

```http
DELETE /api/groups/:groupId/memory-notes/:noteId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Memory note deleted"
}
```

## Vector Embeddings

Memory notes are automatically embedded and stored in the vector database:

```typescript
// When creating a note
const note = await createMemoryNote(groupId, content, noteType);

// Automatically embed and store in vector store
await aiClient.embedMemoryNote({
  group_id: groupId,
  content_id: note.id,
  content: note.content,
  content_type: 'memory',
  metadata: {
    note_type: noteType,
    ...note.metadata,
  },
});
```

This enables:
- **Semantic Search**: Find relevant notes by meaning, not just keywords
- **AI Context**: Memory notes are included in AI responses
- **Cross-Reference**: Link related notes, papers, and discussions

## AI Integration

Memory notes are automatically included in group AI context:

### Group AI Chat

When you ask `@ai` a question, the system:
1. Searches relevant memory notes via vector similarity
2. Includes top matching notes in AI context
3. AI references these notes in responses

**Example:**
```
User: "@ai What architecture did we decide to use?"

AI: "Based on your group's memory notes, you decided to focus on 
     BERT-based models rather than GPT architectures [DECISION note]."
```

### Paper Q&A

Memory notes relevant to a paper are included:

```
User: "@ai How does this paper relate to our research?"

AI: "This paper on transformer optimization aligns with your guideline 
     to focus on efficient architectures [GUIDELINE note]. It could 
     complement your decision to use BERT-based models [DECISION note]."
```

## Best Practices

### 1. Use Descriptive Content

✅ **Good:**
```
Type: decision
Content: "We chose LSTM over GRU because our sequences are long (>1000 tokens) 
         and we need to capture long-range dependencies. Benchmarks showed 
         2% accuracy improvement with LSTM on our validation set."
```

❌ **Bad:**
```
Type: decision
Content: "Use LSTM"
```

### 2. Choose Appropriate Types

- Use `decision` for choices that need rationale
- Use `fact` for measurable observations
- Use `guideline` for team conventions
- Use `note` for general observations

### 3. Add Metadata

Enhance notes with structured metadata:

```json
{
  "content": "Dataset validation accuracy: 95.2%",
  "note_type": "fact",
  "metadata": {
    "dataset_name": "custom_dataset_v2",
    "date_measured": "2026-02-01",
    "related_papers": ["paper-id"],
    "tags": ["baseline", "accuracy", "validation"]
  }
}
```

### 4. Link to Papers

Reference papers in metadata:

```json
{
  "content": "The approach in 'Attention Is All You Need' aligns with our goals",
  "note_type": "note",
  "metadata": {
    "related_papers": ["arxiv-1706-03762"],
    "relevance": "architecture_choice"
  }
}
```

### 5. Regular Maintenance

- Review notes periodically
- Update outdated information
- Archive resolved decisions
- Remove obsolete guidelines

## Frontend Integration

### Creating a Note

```typescript
import { api } from '@/lib/api';

async function createNote(groupId: string, content: string, noteType: string) {
  try {
    const note = await api.createMemoryNote(
      accessToken,
      groupId,
      {
        content,
        note_type: noteType,
        metadata: {
          tags: ['important'],
        },
      }
    );
    console.log('Note created:', note);
  } catch (error) {
    console.error('Failed to create note:', error);
  }
}
```

### Displaying Notes

```tsx
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

function MemoryNotesList({ groupId }: { groupId: string }) {
  const [notes, setNotes] = useState([]);
  
  useEffect(() => {
    async function loadNotes() {
      const response = await api.getMemoryNotes(accessToken, groupId);
      setNotes(response.notes);
    }
    loadNotes();
  }, [groupId]);

  return (
    <div>
      {notes.map((note) => (
        <div key={note.id} className="note-card">
          <div className="note-type">{note.noteType}</div>
          <div className="note-content">{note.content}</div>
          <div className="note-meta">
            By {note.userName} • {new Date(note.createdAt).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Filtering by Type

```tsx
function MemoryNotesPage() {
  const [filter, setFilter] = useState<string>('all');
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    async function loadNotes() {
      const params = filter === 'all' ? {} : { type: filter };
      const response = await api.getMemoryNotes(accessToken, groupId, params);
      setNotes(response.notes);
    }
    loadNotes();
  }, [filter, groupId]);

  return (
    <div>
      <select value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="all">All Notes</option>
        <option value="decision">Decisions</option>
        <option value="fact">Facts</option>
        <option value="guideline">Guidelines</option>
        <option value="note">Notes</option>
      </select>
      {/* Render notes */}
    </div>
  );
}
```

## Use Cases by Research Stage

### Literature Review
```
Type: note
Content: "Survey paper 'A Survey of Deep Learning' provides excellent overview.
         Should be required reading for new team members."
```

### Methodology Selection
```
Type: decision
Content: "Chose cross-validation with k=5 based on dataset size (n=10000).
         Larger k would be too computationally expensive."
```

### Experimentation
```
Type: fact
Content: "Experiment #23 results: Model A achieves 0.92 F1-score on test set.
         Best result so far. Hyperparameters: lr=0.001, batch=32, epochs=50."
```

### Paper Writing
```
Type: guideline
Content: "When citing methods, always include implementation details and
         hyperparameters. Link to our experiment tracking notes."
```

## Permissions

Memory notes follow group permissions:
- **View**: All group members can view notes
- **Create**: All group members can create notes
- **Update**: Only note author or group owner can update
- **Delete**: Only note author or group owner can delete

## Analytics

Track note usage:

```sql
-- Most referenced note types
SELECT note_type, COUNT(*) as count
FROM group_memory_notes
WHERE group_id = $group_id
GROUP BY note_type;

-- Recent notes
SELECT *
FROM group_memory_notes
WHERE group_id = $group_id
ORDER BY created_at DESC
LIMIT 10;

-- Notes by user
SELECT u.name, COUNT(*) as note_count
FROM group_memory_notes n
JOIN users u ON n.user_id = u.id
WHERE n.group_id = $group_id
GROUP BY u.id, u.name;
```

## Future Enhancements

Potential features:
- [ ] Note templates for common types
- [ ] Note linking (reference other notes)
- [ ] Note versioning/history
- [ ] Rich text formatting
- [ ] Attachments (images, files)
- [ ] Note categories/folders
- [ ] Export notes to markdown
- [ ] Collaborative editing
- [ ] Note mentions (@user, @paper)
- [ ] Scheduled reminders for note review

## Migration from Chat Messages

If you have important information in chat messages that should be memory notes:

1. Identify key messages (decisions, facts, guidelines)
2. Create structured memory notes with proper types
3. Add relevant metadata
4. Link to related papers if applicable

This makes information more discoverable and useful for AI context.
