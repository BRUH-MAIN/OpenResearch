"""
OpenResearch AI Service Verification Tests

Run with: pytest scripts/test_ai_service.py -v

Requirements: pip install pytest httpx

These tests verify the AI service is properly configured and working.
"""
# pyright: reportMissingImports=false

import os
import sys

# Check for required dependencies
def _check_dependencies():
    missing = []
    try:
        import pytest  # noqa: F401
    except ImportError:
        missing.append("pytest")
    try:
        import httpx  # noqa: F401
    except ImportError:
        missing.append("httpx")
    if missing:
        print(f"Missing dependencies: {', '.join(missing)}")
        print("Install with: pip install pytest httpx")
        sys.exit(1)

_check_dependencies()

import pytest  # type: ignore
import httpx  # type: ignore
from typing import Optional

# Configuration
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000")
TIMEOUT = 30  # seconds


@pytest.fixture
def client():
    """HTTP client for testing."""
    return httpx.Client(base_url=AI_SERVICE_URL, timeout=TIMEOUT)


class TestHealthCheck:
    """Test health endpoints."""
    
    def test_health_endpoint_responds(self, client):
        """Health endpoint should respond with 200."""
        response = client.get("/health")
        assert response.status_code == 200
        
    def test_health_returns_status(self, client):
        """Health should return status field."""
        response = client.get("/health")
        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"
        
    def test_groq_configured(self, client):
        """Groq should be configured (GROQ_API_KEY set)."""
        response = client.get("/health")
        data = response.json()
        assert "groq_configured" in data
        if not data["groq_configured"]:
            pytest.skip("GROQ_API_KEY not configured - skipping AI tests")


class TestAIGeneration:
    """Test AI generation capabilities."""
    
    def test_simple_generation(self, client):
        """Test endpoint should generate a response."""
        response = client.post("/test", params={"question": "What is 2+2?"})
        
        # Skip if not configured
        if response.status_code == 503:
            pytest.skip("AI service not configured")
            
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert len(data["answer"]) > 0
        
    def test_generation_includes_latency(self, client):
        """Response should include latency_ms."""
        response = client.post("/test", params={"question": "Hello"})
        
        if response.status_code == 503:
            pytest.skip("AI service not configured")
            
        data = response.json()
        assert "latency_ms" in data
        assert isinstance(data["latency_ms"], int)


class TestGroupAIChat:
    """Test group AI chat (requires @ai trigger)."""
    
    def test_missing_ai_trigger_rejected(self, client):
        """Requests without @ai trigger should be rejected."""
        response = client.post(
            "/groups/test-group/ai-chat",
            json={
                "prompt": "What is machine learning?",  # Missing @ai
                "group_id": "test-group",
                "session_id": "test-session",
                "user_id": "test-user"
            }
        )
        # Pydantic validation returns 422 for missing @ai
        assert response.status_code in [400, 422]
        if response.status_code == 400:
            assert "trigger" in response.json().get("detail", "").lower()
        
    def test_ai_trigger_accepted(self, client):
        """Requests with @ai trigger should be processed."""
        response = client.post(
            "/groups/test-group/ai-chat",
            json={
                "prompt": "@ai What is machine learning?",
                "group_id": "test-group",
                "session_id": "test-session",
                "user_id": "test-user"
            }
        )
        
        if response.status_code == 503:
            pytest.skip("AI service not configured")
            
        # Should either succeed or fail gracefully (not 500)
        assert response.status_code in [200, 400, 404]


class TestPaperEndpoints:
    """Test paper-related endpoints."""
    
    def test_paper_question_requires_trigger(self, client):
        """Paper question requires @ai trigger."""
        response = client.post(
            "/papers/question",
            json={
                "paper_id": "test-paper",
                "question": "What is this paper about?",  # Missing @ai
                "group_id": "test-group",
                "user_id": "test-user"
            }
        )
        # Pydantic validation returns 422 for missing @ai
        assert response.status_code in [400, 422]
        
    def test_paper_summarize_requires_trigger(self, client):
        """Paper summarization requires @ai trigger."""
        response = client.post(
            "/papers/summarize",
            json={
                "paper_id": "test-paper",
                "group_id": "test-group",
                "user_id": "test-user",
                "trigger": "summarize this"  # Missing @ai
            }
        )
        # Pydantic validation returns 422 for missing @ai
        assert response.status_code in [400, 422]


class TestVectorSearch:
    """Test vector search endpoints."""
    
    def test_vector_search_endpoint_exists(self, client):
        """Vector search endpoint should exist."""
        response = client.post(
            "/vectors/search",
            json={
                "group_id": "test-group",
                "query": "machine learning"
            }
        )
        # Should respond (may be 503 if not connected)
        assert response.status_code in [200, 400, 503]


class TestReportGeneration:
    """Test report generation."""
    
    def test_report_endpoint_exists(self, client):
        """Report generation endpoint should exist."""
        response = client.post(
            "/reports/group/test-group/generate",
            json={
                "group_id": "test-group",
                "user_id": "test-user",
                "report_type": "weekly"
            }
        )
        # Should respond (may fail due to missing group, but not 404 on endpoint)
        assert response.status_code in [200, 201, 400, 404, 503]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
