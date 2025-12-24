"""
OpenResearch AI Server
Uses Google Gemini for session summarization, task extraction, and Q&A
"""

import os
from contextlib import asynccontextmanager
from typing import Optional

import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Load environment variables
load_dotenv()

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY not set. AI features will not work.")
else:
    genai.configure(api_key=GEMINI_API_KEY)

# Initialize Gemini model
model = genai.GenerativeModel("gemini-1.5-flash") if GEMINI_API_KEY else None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    print("🤖 AI Server starting up...")
    if GEMINI_API_KEY:
        print("✅ Gemini API configured")
    else:
        print("⚠️  Gemini API key not configured")
    yield
    print("🤖 AI Server shutting down...")


app = FastAPI(
    title="OpenResearch AI Server",
    description="AI-powered features for OpenResearch platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models
class Message(BaseModel):
    id: str
    content: str
    user_name: Optional[str] = None
    type: str = "user"  # 'user' or 'ai'
    created_at: str


class SummarizeRequest(BaseModel):
    session_title: str
    messages: list[Message]


class SummarizeResponse(BaseModel):
    summary: str
    key_points: list[str]
    participant_count: int


class TaskExtractionRequest(BaseModel):
    session_title: str
    messages: list[Message]


class Task(BaseModel):
    title: str
    description: Optional[str] = None
    assignee: Optional[str] = None
    priority: str = "medium"  # low, medium, high


class TaskExtractionResponse(BaseModel):
    tasks: list[Task]


class QARequest(BaseModel):
    question: str
    session_title: str
    messages: list[Message]


class QAResponse(BaseModel):
    answer: str
    sources: list[str]  # Message IDs that were most relevant


class HealthResponse(BaseModel):
    status: str
    gemini_configured: bool


# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        gemini_configured=GEMINI_API_KEY is not None
    )


# Session Summarization
@app.post("/api/summarize", response_model=SummarizeResponse)
async def summarize_session(request: SummarizeRequest):
    """Generate a summary of the session conversation"""
    if not model:
        raise HTTPException(status_code=503, detail="AI service not configured")
    
    if not request.messages:
        raise HTTPException(status_code=400, detail="No messages provided")
    
    # Format messages for the prompt
    conversation = "\n".join([
        f"[{msg.user_name or 'Unknown'}]: {msg.content}"
        for msg in request.messages
        if msg.type == "user"
    ])
    
    # Get unique participants
    participants = set(msg.user_name for msg in request.messages if msg.user_name and msg.type == "user")
    
    prompt = f"""You are an AI assistant helping to summarize research discussions.

Session Title: {request.session_title}

Conversation:
{conversation}

Please provide:
1. A concise summary of the discussion (2-3 paragraphs)
2. Key points discussed (as a bullet list, max 5 points)

Format your response as:
SUMMARY:
[Your summary here]

KEY POINTS:
- Point 1
- Point 2
- Point 3
"""

    try:
        response = model.generate_content(prompt)
        text = response.text
        
        # Parse response
        summary = ""
        key_points = []
        
        if "SUMMARY:" in text:
            parts = text.split("KEY POINTS:")
            summary = parts[0].replace("SUMMARY:", "").strip()
            if len(parts) > 1:
                points_text = parts[1].strip()
                key_points = [
                    point.strip().lstrip("- ").lstrip("• ")
                    for point in points_text.split("\n")
                    if point.strip() and point.strip() not in ["-", "•"]
                ]
        else:
            summary = text.strip()
        
        return SummarizeResponse(
            summary=summary,
            key_points=key_points[:5],
            participant_count=len(participants)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


# Task Extraction
@app.post("/api/extract-tasks", response_model=TaskExtractionResponse)
async def extract_tasks(request: TaskExtractionRequest):
    """Extract action items and tasks from the conversation"""
    if not model:
        raise HTTPException(status_code=503, detail="AI service not configured")
    
    if not request.messages:
        raise HTTPException(status_code=400, detail="No messages provided")
    
    # Format messages
    conversation = "\n".join([
        f"[{msg.user_name or 'Unknown'}]: {msg.content}"
        for msg in request.messages
        if msg.type == "user"
    ])
    
    prompt = f"""You are an AI assistant that extracts action items from research discussions.

Session Title: {request.session_title}

Conversation:
{conversation}

Extract all action items, tasks, and to-dos mentioned in the conversation.
For each task, identify:
- The task title (what needs to be done)
- A brief description (if applicable)
- Who should do it (if mentioned)
- Priority (low/medium/high based on context)

Format your response as a list of tasks, one per line:
TASK: [title] | DESCRIPTION: [description] | ASSIGNEE: [name or "unassigned"] | PRIORITY: [low/medium/high]

If no tasks are found, respond with:
NO_TASKS_FOUND
"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        
        tasks = []
        
        if "NO_TASKS_FOUND" not in text:
            for line in text.split("\n"):
                if "TASK:" in line:
                    task_data = {"title": "", "description": None, "assignee": None, "priority": "medium"}
                    
                    parts = line.split("|")
                    for part in parts:
                        part = part.strip()
                        if part.startswith("TASK:"):
                            task_data["title"] = part.replace("TASK:", "").strip()
                        elif part.startswith("DESCRIPTION:"):
                            desc = part.replace("DESCRIPTION:", "").strip()
                            if desc and desc.lower() not in ["none", "n/a", ""]:
                                task_data["description"] = desc
                        elif part.startswith("ASSIGNEE:"):
                            assignee = part.replace("ASSIGNEE:", "").strip()
                            if assignee.lower() not in ["unassigned", "none", "n/a", ""]:
                                task_data["assignee"] = assignee
                        elif part.startswith("PRIORITY:"):
                            priority = part.replace("PRIORITY:", "").strip().lower()
                            if priority in ["low", "medium", "high"]:
                                task_data["priority"] = priority
                    
                    if task_data["title"]:
                        tasks.append(Task(**task_data))
        
        return TaskExtractionResponse(tasks=tasks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


# Q&A with Session Context
@app.post("/api/ask", response_model=QAResponse)
async def ask_question(request: QARequest):
    """Answer a question based on the session context"""
    if not model:
        raise HTTPException(status_code=503, detail="AI service not configured")
    
    if not request.messages:
        raise HTTPException(status_code=400, detail="No messages provided")
    
    # Format messages with IDs for reference
    conversation = "\n".join([
        f"[MSG-{i}] [{msg.user_name or 'Unknown'}]: {msg.content}"
        for i, msg in enumerate(request.messages)
        if msg.type == "user"
    ])
    
    prompt = f"""You are an AI research assistant. Answer the user's question based ONLY on the context from this research session.

Session Title: {request.session_title}

Conversation Context:
{conversation}

User Question: {request.question}

Instructions:
1. Answer the question based on the conversation context
2. If the answer cannot be found in the context, say so clearly
3. Reference specific messages when relevant (use MSG-X format)
4. Be concise and helpful

Format your response as:
ANSWER:
[Your answer here]

SOURCES:
[List message references like MSG-0, MSG-2, etc., or "none" if not applicable]
"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        
        answer = text
        sources = []
        
        if "ANSWER:" in text:
            parts = text.split("SOURCES:")
            answer = parts[0].replace("ANSWER:", "").strip()
            if len(parts) > 1:
                sources_text = parts[1].strip()
                # Extract MSG-X references
                import re
                sources = re.findall(r'MSG-(\d+)', sources_text)
                # Map back to actual message IDs
                sources = [
                    request.messages[int(idx)].id
                    for idx in sources
                    if int(idx) < len(request.messages)
                ]
        
        return QAResponse(answer=answer, sources=sources)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
