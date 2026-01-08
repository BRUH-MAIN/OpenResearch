#!/bin/bash
# OpenResearch AI Service Verification Script
# Run this to verify all AI features are working correctly

set -e

echo "=========================================="
echo "OpenResearch AI Service Verification"
echo "=========================================="

AI_SERVICE_URL="${AI_SERVICE_URL:-http://localhost:8000}"
SERVER_URL="${SERVER_URL:-http://localhost:3001}"

echo ""
echo "Testing AI Service at: $AI_SERVICE_URL"
echo "Testing Server at: $SERVER_URL"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
}

fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
}

warn() {
    echo -e "${YELLOW}⚠ WARN${NC}: $1"
}

# 1. Test AI Service Health
echo "1. Testing AI Service Health Endpoint..."
HEALTH_RESPONSE=$(curl -s "$AI_SERVICE_URL/health" 2>/dev/null || echo '{"error": "Connection failed"}')

if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
    pass "AI Service is healthy"
    
    # Check Gemini configuration
    if echo "$HEALTH_RESPONSE" | grep -q '"gemini_configured":true'; then
        pass "Gemini API is configured"
    else
        fail "Gemini API is NOT configured - set GEMINI_API_KEY"
    fi
    
    # Check database connection
    if echo "$HEALTH_RESPONSE" | grep -q '"database_connected":true'; then
        pass "Database is connected"
    else
        warn "Database is not connected - context features limited"
    fi
    
    # Check vector store
    if echo "$HEALTH_RESPONSE" | grep -q '"vector_store_connected":true'; then
        pass "Vector store is connected"
    else
        warn "Vector store is not connected - RAG features limited"
    fi
else
    fail "AI Service health check failed: $HEALTH_RESPONSE"
fi

echo ""

# 2. Test Simple Generation (no auth required)
echo "2. Testing AI Generation (Test Endpoint)..."
TEST_RESPONSE=$(curl -s -X POST "$AI_SERVICE_URL/test?question=What%20is%20machine%20learning" 2>/dev/null || echo '{"error": "Connection failed"}')

if echo "$TEST_RESPONSE" | grep -q '"answer"'; then
    pass "AI generation is working"
    LATENCY=$(echo "$TEST_RESPONSE" | grep -o '"latency_ms":[0-9]*' | head -1 | cut -d: -f2)
    echo "   Response latency: ${LATENCY}ms"
else
    if echo "$TEST_RESPONSE" | grep -q '"detail"'; then
        DETAIL=$(echo "$TEST_RESPONSE" | grep -o '"detail":"[^"]*"' | cut -d'"' -f4)
        fail "AI generation failed: $DETAIL"
    else
        fail "AI generation failed: $TEST_RESPONSE"
    fi
fi

echo ""

# 3. Test Backend Server Health
echo "3. Testing Backend Server Health..."
SERVER_HEALTH=$(curl -s "$SERVER_URL/health" 2>/dev/null || echo '{"error": "Connection failed"}')

if echo "$SERVER_HEALTH" | grep -q '"status":"ok"'; then
    pass "Backend server is healthy"
else
    fail "Backend server health check failed: $SERVER_HEALTH"
fi

echo ""

# 4. Test Paper Search
echo "4. Testing Paper Search (arXiv API)..."
# Note: This requires authentication in production, but we can check if endpoint responds
SEARCH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/api/papers/search/external?query=machine%20learning" 2>/dev/null || echo "000")

if [ "$SEARCH_RESPONSE" = "401" ]; then
    pass "Paper search endpoint exists (requires auth)"
elif [ "$SEARCH_RESPONSE" = "200" ]; then
    pass "Paper search is working"
else
    warn "Paper search returned HTTP $SEARCH_RESPONSE"
fi

echo ""
echo "=========================================="
echo "Verification Complete"
echo "=========================================="
echo ""
echo "Next steps if issues found:"
echo "1. Ensure GEMINI_API_KEY is set in ai-service/.env"
echo "2. Ensure DATABASE_URL is set for both services"
echo "3. Check that all services are running:"
echo "   - AI Service: cd ai-service && uvicorn app.main:app --reload"
echo "   - Backend: cd server && npm run dev"
echo "   - Frontend: cd client && npm run dev"
echo ""
