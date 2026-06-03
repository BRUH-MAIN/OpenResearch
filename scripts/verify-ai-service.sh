#!/bin/bash
# OpenResearch AI Service Verification Script
# Run this to verify the Docker or local AI-enabled chat stack.

set -euo pipefail

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

json_has_true() {
    local payload="$1"
    local key="$2"
    echo "$payload" | grep -Eq '"'"$key"'"[[:space:]]*:[[:space:]]*true'
}

json_has_value() {
    local payload="$1"
    local key="$2"
    local value="$3"
    echo "$payload" | grep -Eq '"'"$key"'"[[:space:]]*:[[:space:]]*"'"$value"'"'
}

# 1. Test AI Service Health
echo "1. Testing AI Service Health Endpoint..."
HEALTH_RESPONSE=$(curl -s "$AI_SERVICE_URL/health" 2>/dev/null || echo '{"error": "Connection failed"}')

if json_has_value "$HEALTH_RESPONSE" "status" "healthy"; then
    pass "AI Service is healthy"
    
    # Check Groq configuration
    if json_has_true "$HEALTH_RESPONSE" "groq_configured"; then
        pass "Groq API is configured"
    else
        fail "Groq API is NOT configured - set GROQ_API_KEY"
    fi
    
    # Check database connection
    if json_has_true "$HEALTH_RESPONSE" "database_connected"; then
        pass "Database is connected"
    else
        warn "Database is not connected - context features limited"
    fi
    
    # Check vector store
    if json_has_true "$HEALTH_RESPONSE" "vector_store_connected"; then
        pass "Vector store is connected"
    else
        warn "Vector store is not connected - RAG features limited"
    fi
else
    fail "AI Service health check failed: $HEALTH_RESPONSE"
fi

echo ""

# 2. Test Simple Generation (no auth required)
echo "2. Testing AI HTTP reachability..."
OPENAPI_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$AI_SERVICE_URL/docs" 2>/dev/null || echo "000")

if [ "$OPENAPI_STATUS" = "200" ]; then
    pass "AI documentation endpoint is reachable"
else
    warn "AI documentation endpoint returned HTTP $OPENAPI_STATUS"
fi

echo ""

# 3. Test Backend Server Health
echo "3. Testing Backend Server Health..."
SERVER_HEALTH=$(curl -s "$SERVER_URL/health" 2>/dev/null || echo '{"error": "Connection failed"}')

if json_has_value "$SERVER_HEALTH" "status" "healthy"; then
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
echo "1. Ensure GROQ_API_KEY is set in .env.docker or ai-service/.env"
echo "2. Ensure PostgreSQL, server, client, and ai-service are all running"
echo "3. For Docker on Windows, use scripts/start-multiuser-chat.ps1"
echo "4. Seed test users with: docker compose exec server npm run db:seed"
echo ""
