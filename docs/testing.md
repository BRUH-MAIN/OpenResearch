# Testing Guide

## Overview

OpenResearch maintains **≥90% test coverage** across all services. Tests run automatically in CI/CD pipelines.

## Test Stack

### Server (Node.js/TypeScript)
- **Framework**: Vitest
- **Coverage**: ≥90% (lines, functions, branches, statements)
- **Test Types**: Unit, Integration, E2E

### AI Service (Python)
- **Framework**: pytest
- **Coverage**: ≥90% (lines, branches, statements)
- **Test Types**: Unit, Integration

### Client (Next.js/React)
- **Framework**: Jest + React Testing Library (when added)
- **Test Types**: Component, Integration

## Running Tests

### Server Tests

```bash
cd server

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test -- tests/auth.test.ts

# Run tests matching pattern
npm test -- -t "should register new user"
```

### AI Service Tests

```bash
cd ai-service

# Activate virtual environment
source venv/bin/activate

# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=term-missing

# Run with coverage threshold check
pytest --cov=app --cov-report=term-missing --cov-fail-under=90

# Run specific test file
pytest tests/test_main.py

# Run specific test
pytest tests/test_main.py::test_health_check

# Run tests matching pattern
pytest -k "embedding"

# Verbose output
pytest -v

# Show print statements
pytest -s
```

### Client Tests (Future)

```bash
cd client

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Test Coverage Requirements

All services must maintain minimum coverage thresholds:

| Metric | Threshold | Description |
|--------|-----------|-------------|
| Lines | 90% | Executable code lines |
| Functions | 90% | Function/method coverage |
| Branches | 90% | Conditional branches (if/else) |
| Statements | 90% | Individual statements |

### Viewing Coverage Reports

**Server:**
```bash
npm run test:coverage
# Opens HTML report in ./coverage/index.html
```

**AI Service:**
```bash
pytest --cov=app --cov-report=html
# Opens HTML report in ./htmlcov/index.html
```

## Test Structure

### Server Test Files

Located in `server/tests/`:

```
tests/
├── auth.test.ts              # Authentication & JWT
├── groups.test.ts            # Group CRUD operations
├── papers.test.ts            # Paper management
├── groupPapers.test.ts       # Group papers & AI features
├── reports.test.ts           # PDF report generation
├── recommendations.test.ts   # Paper recommendations
└── socket.test.ts            # Socket.IO real-time events
```

### AI Service Test Files

Located in `ai-service/tests/`:

```
tests/
├── test_main.py              # FastAPI endpoints
├── test_embeddings.py        # Embedding generation
├── test_vector_store.py      # pgvector operations
└── test_report_generator.py # PDF generation
```

## Writing Tests

### Server Test Example

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { db } from '../src/db';

describe('Authentication', () => {
  beforeAll(async () => {
    // Setup test database
    await db.delete(users).where(eq(users.email, 'test@example.com'));
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(users).where(eq(users.email, 'test@example.com'));
  });

  it('should register a new user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('accessToken');
    expect(response.body.user).toMatchObject({
      email: 'test@example.com',
      name: 'Test User',
    });
  });

  it('should not register duplicate email', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User 2',
        email: 'test@example.com',
        password: 'password123',
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('already exists');
  });
});
```

### AI Service Test Example

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "groq_configured" in data
    assert "database_connected" in data

@pytest.mark.asyncio
async def test_group_ai_chat_missing_trigger():
    """Test AI chat without @ai trigger returns 400."""
    response = client.post(
        "/groups/test-group-id/ai-chat",
        json={"prompt": "What is machine learning?"}
    )
    assert response.status_code == 400
    assert "@ai trigger" in response.json()["detail"]

@pytest.mark.asyncio
async def test_group_ai_chat_with_trigger():
    """Test AI chat with @ai trigger."""
    response = client.post(
        "/groups/test-group-id/ai-chat",
        json={"prompt": "@ai What is machine learning?"}
    )
    # Assuming Groq is configured
    if response.status_code == 200:
        data = response.json()
        assert "text" in data
        assert len(data["text"]) > 0
```

## Testing Best Practices

### 1. Test Isolation

Each test should be independent and not rely on other tests:

```typescript
// ✅ Good - test creates its own data
it('should create group', async () => {
  const user = await createTestUser();
  const group = await createGroup(user.id);
  expect(group).toBeDefined();
  // Cleanup
  await deleteGroup(group.id);
});

// ❌ Bad - relies on previous test
it('should get group', async () => {
  const group = await getGroup('hardcoded-id');
  expect(group).toBeDefined();
});
```

### 2. Use Test Fixtures

```python
# conftest.py
import pytest
from app.database import database

@pytest.fixture
async def db_connection():
    """Provide database connection for tests."""
    await database.connect()
    yield database
    await database.disconnect()

@pytest.fixture
def sample_paper():
    """Provide sample paper data."""
    return {
        "paper_id": "test-paper-1",
        "title": "Test Paper",
        "abstract": "This is a test paper abstract.",
    }
```

### 3. Mock External Services

```typescript
import { vi } from 'vitest';

// Mock AI service
vi.mock('../src/services/aiClient', () => ({
  aiClient: {
    groupAIChat: vi.fn().mockResolvedValue({
      text: 'Mocked AI response',
      sources: [],
    }),
  },
}));

it('should handle AI chat request', async () => {
  const response = await request(app)
    .post('/api/groups/group-id/chat')
    .send({ prompt: '@ai test' });
  
  expect(response.status).toBe(200);
});
```

### 4. Test Error Cases

```python
def test_missing_api_key():
    """Test behavior when API key is not configured."""
    # Temporarily unset API key
    import os
    original = os.environ.get('GROQ_API_KEY')
    os.environ['GROQ_API_KEY'] = ''
    
    response = client.post("/chat", json={"question": "@ai test"})
    assert response.status_code == 503
    
    # Restore
    if original:
        os.environ['GROQ_API_KEY'] = original
```

### 5. Test Authentication

```typescript
// Helper to get auth token
async function getAuthToken() {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'test@example.com', password: 'password123' });
  return response.body.accessToken;
}

it('should require authentication', async () => {
  const response = await request(app)
    .get('/api/groups');
  expect(response.status).toBe(401);
});

it('should allow authenticated access', async () => {
  const token = await getAuthToken();
  const response = await request(app)
    .get('/api/groups')
    .set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(200);
});
```

## CI/CD Integration

Tests run automatically on push and pull requests.

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test-server:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - name: Install dependencies
        run: cd server && npm install
      - name: Run tests
        run: cd server && npm run test:coverage
      - name: Check coverage
        run: |
          cd server
          npm run test:coverage | grep "All files" | grep -E "[0-9]+\.[0-9]+" | awk '{if ($2 < 90) exit 1}'

  test-ai-service:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: 3.12
      - name: Install dependencies
        run: |
          cd ai-service
          pip install -r requirements.txt
      - name: Run tests
        run: |
          cd ai-service
          pytest --cov=app --cov-report=term-missing --cov-fail-under=90
```

## Test Data Management

### Using Seed Data

```bash
# Seed test database
cd server
npm run db:seed

# This creates:
# - 3 test users
# - 2 test groups
# - 1 test session per group
# - Sample messages and papers
```

### Cleanup After Tests

```typescript
afterEach(async () => {
  // Clean up test data
  await db.delete(messages).where(like(messages.content, 'test-%'));
  await db.delete(sessions).where(like(sessions.title, 'Test%'));
});

afterAll(async () => {
  // Disconnect database
  await db.$client.end();
});
```

## Debugging Tests

### Server Tests

```bash
# Run with debug output
DEBUG=* npm test

# Run specific test with verbose output
npm test -- -t "should create group" --reporter=verbose
```

### AI Service Tests

```bash
# Run with print statements
pytest -s

# Run with debug logging
pytest --log-cli-level=DEBUG

# Drop into debugger on failure
pytest --pdb
```

### Using VS Code Debugger

**Server (.vscode/launch.json):**
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["test", "--", "--no-coverage"],
  "cwd": "${workspaceFolder}/server",
  "console": "integratedTerminal"
}
```

**AI Service (.vscode/launch.json):**
```json
{
  "type": "python",
  "request": "launch",
  "name": "Debug pytest",
  "module": "pytest",
  "args": ["-s", "-v"],
  "cwd": "${workspaceFolder}/ai-service",
  "console": "integratedTerminal"
}
```

## Performance Testing

### Load Testing with Artillery

```bash
npm install -g artillery

# Create test script: load-test.yml
# Run load test
artillery run load-test.yml
```

**Example load-test.yml:**
```yaml
config:
  target: 'http://localhost:3001'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Create and list groups"
    flow:
      - post:
          url: "/api/auth/login"
          json:
            email: "test@example.com"
            password: "password123"
          capture:
            json: "$.accessToken"
            as: "token"
      - get:
          url: "/api/groups"
          headers:
            Authorization: "Bearer {{ token }}"
```

## Troubleshooting

### Tests Timing Out

Increase timeout in test configuration:

```typescript
// vitest.config.ts
export default {
  test: {
    testTimeout: 10000, // 10 seconds
  },
};
```

```python
# pytest.ini
[pytest]
timeout = 10
```

### Database Connection Issues

Ensure test database is running:

```bash
# Check database connection
psql $DATABASE_URL -c "SELECT 1"

# Reset database for clean tests
npm run db:push
```

### AI Service Tests Failing

Check environment variables:

```bash
# Verify keys are set
echo $GROQ_API_KEY
echo $OPENAI_API_KEY

# Use test mode if keys not available
export GROQ_API_KEY=test-key
export OPENAI_API_KEY=test-key
```

## Coverage Exemptions

Some code may be exempt from coverage requirements:

```typescript
/* istanbul ignore next */
if (process.env.NODE_ENV === 'development') {
  console.log('Debug info');
}
```

```python
# pragma: no cover
if __name__ == "__main__":
    # Development-only code
    pass
```

## Continuous Improvement

- Add tests for new features before merging
- Review coverage reports regularly
- Refactor tests to reduce duplication
- Update tests when requirements change
- Document complex test scenarios
- Run tests locally before pushing
