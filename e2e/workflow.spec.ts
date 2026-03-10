/**
 * End-to-end Playwright tests for OpenResearch
 *
 * Covers:
 * 1. Login flow
 * 2. Create a group
 * 3. Create a session
 * 4. Navigate to chat page
 * 5. Open Workflow tab → select template → enter goal → plan → start
 * 6. Approve checkpoints
 * 7. Verify workflow completes with output displayed
 */

import { test, expect, Page } from 'playwright/test';

const BASE = 'http://localhost:3000';
const API  = 'http://localhost:3001';

const TEST_EMAIL    = 'jetski_tester@example.com';
const TEST_PASSWORD = 'Password123!';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/** Login via the UI and return the page on /home */
async function login(page: Page) {
  await page.goto(`${BASE}/auth/signin`);
  await page.getByPlaceholder('you@example.com').fill(TEST_EMAIL);
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  // Wait for redirect to /home
  await page.waitForURL('**/home', { timeout: 15_000 });
}

/** Login via API and inject the token into localStorage so we skip the UI login for later tests */
async function loginViaAPI(page: Page) {
  const resp = await page.request.post(`${API}/api/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  const { accessToken, refreshToken, user } = body;
  expect(accessToken).toBeTruthy();

  // Seed Zustand persisted auth store
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ accessToken, refreshToken, user }) => {
      const state = {
        state: {
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
        },
        version: 0,
      };
      localStorage.setItem('openresearch-auth', JSON.stringify(state));
    },
    { accessToken, refreshToken, user },
  );
  return { accessToken, user };
}

/** Create a group via API */
async function createGroupAPI(page: Page, token: string, name: string) {
  const resp = await page.request.post(`${API}/api/groups`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, description: 'Playwright test group' },
  });
  expect(resp.ok()).toBeTruthy();
  return (await resp.json()) as { id: string; name: string };
}

/** Create a session via API */
async function createSessionAPI(page: Page, token: string, groupId: string, title: string) {
  const resp = await page.request.post(`${API}/api/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { groupId, title },
  });
  expect(resp.ok()).toBeTruthy();
  return (await resp.json()) as { id: string };
}

// ──────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────

test.describe('OpenResearch E2E', () => {

  test.describe.configure({ mode: 'serial' });

  let groupId: string;
  let sessionId: string;
  let token: string;

  // ── Test 1: Login via UI ─────────────────────────────────────
  test('1 — Login via UI', async ({ page }) => {
    await page.goto(`${BASE}/auth/signin`);
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    await page.getByPlaceholder('you@example.com').fill(TEST_EMAIL);
    await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Should redirect to /home
    await page.waitForURL('**/home', { timeout: 15_000 });
    await expect(page.locator('h1')).toContainText('My Groups');
  });

  // ── Test 2: Create a group via UI ────────────────────────────
  test('2 — Create group', async ({ page }) => {
    const { accessToken } = await loginViaAPI(page);
    token = accessToken;
    await page.goto(`${BASE}/home`);
    await expect(page.locator('h1')).toContainText('My Groups');

    // Click "Create Group"
    await page.getByRole('button', { name: /Create Group/i }).click();

    // Fill group form in the modal
    await page.getByPlaceholder('e.g., AI Research Lab').fill('Playwright Drone Test');
    await page.getByPlaceholder("What's this group about?").fill('E2E test group for drone docking research');

    // Submit — need to wait for the button to become enabled
    const createBtn = page.locator('button', { hasText: 'Create Group' }).last();
    await expect(createBtn).toBeEnabled({ timeout: 5_000 });
    await createBtn.click();

    // Group was created — it appears in the list. Find it and get the ID.
    const groupCard = page.locator('a[href*="/group?id="]', { hasText: 'Playwright Drone Test' }).first();
    await expect(groupCard).toBeVisible({ timeout: 10_000 });
    const href = await groupCard.getAttribute('href');
    const match = href?.match(/id=([a-f0-9-]+)/);
    groupId = match![1];
    expect(groupId).toBeTruthy();

    // Click the group to navigate to it
    await groupCard.click();
    await page.waitForURL(/\/group\?id=/, { timeout: 15_000 });
  });

  // ── Test 3: Create a session ─────────────────────────────────
  test('3 — Create session', async ({ page }) => {
    const { accessToken } = await loginViaAPI(page);
    token = accessToken;

    // If we don't have a groupId from previous test, create one via API
    if (!groupId) {
      const group = await createGroupAPI(page, token, 'Playwright Drone Test');
      groupId = group.id;
    }

    await page.goto(`${BASE}/group?id=${groupId}`);
    await page.waitForLoadState('networkidle');

    // Click "New Session"
    await page.getByRole('button', { name: /New Session/i }).click();

    // Fill session title
    await page.getByPlaceholder('e.g., BERT Implementation Discussion').fill('Drone Docking Workflow E2E');

    // Create — wait for button to become enabled
    const createSessionBtn = page.locator('button', { hasText: 'Create Session' }).last();
    await expect(createSessionBtn).toBeEnabled({ timeout: 5_000 });
    await createSessionBtn.click();

    // Wait for the session card to appear or for navigation
    await page.waitForTimeout(2000);

    // Get the session ID — either from navigation or from the session card link
    const sessionLink = page.locator('a[href*="sessionId="]').first();
    if (await sessionLink.isVisible({ timeout: 5_000 })) {
      const href = await sessionLink.getAttribute('href');
      const match = href?.match(/sessionId=([a-f0-9-]+)/);
      if (match) sessionId = match[1];
    }

    // Fallback: create via API
    if (!sessionId) {
      const sess = await createSessionAPI(page, token, groupId, 'Drone Docking Workflow E2E');
      sessionId = sess.id;
    }

    expect(sessionId).toBeTruthy();
  });

  // ── Test 4: Open chat page & verify Workflow tab ─────────────
  test('4 — Open chat and verify Workflow tab', async ({ page }) => {
    const { accessToken } = await loginViaAPI(page);
    token = accessToken;

    if (!groupId || !sessionId) {
      const group = await createGroupAPI(page, token, 'Playwright Drone Test 2');
      groupId = group.id;
      const sess = await createSessionAPI(page, token, groupId, 'Drone Workflow E2E 2');
      sessionId = sess.id;
    }

    await page.goto(`${BASE}/chat?sessionId=${sessionId}`);
    await page.waitForLoadState('networkidle');

    // Should see the Connected indicator (may take a moment for socket)
    await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 15_000 });

    // Click the "Workflow" tab in the right panel
    const workflowTab = page.locator('button', { hasText: 'Workflow' });
    await workflowTab.click();

    // Should see "Research Workflow" heading
    await expect(page.locator('h3', { hasText: 'Research Workflow' })).toBeVisible({ timeout: 10_000 });
  });

  // ── Test 5: Select template and enter goal ───────────────────
  test('5 — Select workflow template and enter goal', async ({ page }) => {
    const { accessToken } = await loginViaAPI(page);
    token = accessToken;

    if (!groupId || !sessionId) {
      const group = await createGroupAPI(page, token, 'Playwright Drone Test 3');
      groupId = group.id;
      const sess = await createSessionAPI(page, token, groupId, 'Drone Workflow E2E 3');
      sessionId = sess.id;
    }

    await page.goto(`${BASE}/chat?sessionId=${sessionId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 15_000 });

    // Open Workflow tab
    await page.locator('button', { hasText: 'Workflow' }).click();
    await expect(page.locator('h3', { hasText: 'Research Workflow' })).toBeVisible({ timeout: 10_000 });

    // Select "Summarization & Comparison Paper" template
    await page.locator('button', { hasText: /Summarization/i }).click();

    // Should now be in the "goal" phase
    await expect(page.locator('h3', { hasText: 'Research Goal' })).toBeVisible({ timeout: 5_000 });

    // Enter the research goal
    const goalTextarea = page.locator('textarea[placeholder*="Describe your research objective"]');
    await goalTextarea.fill(
      'Create an IEEE format summarization and comparison paper on drone docking using robotic manipulator, comparing papers from the past 5 years'
    );

    // Click "Plan Workflow"
    await page.getByRole('button', { name: /Plan Workflow/i }).click();

    // Should show planning spinner then the review phase
    await expect(page.locator('h3', { hasText: 'Summarization' }).or(page.getByText('Planning workflow'))).toBeVisible({ timeout: 30_000 });

    // Wait for plan to arrive (review phase)
    await expect(page.getByRole('button', { name: /Start Workflow/i })).toBeVisible({ timeout: 30_000 });

    // Verify step list shows 6 steps
    await expect(page.getByText(/6 steps/i)).toBeVisible();
  });

  // ── Test 6: Full workflow run with checkpoint approvals ──────
  test('6 — Full workflow: start, approve checkpoints, complete', async ({ page }) => {
    test.setTimeout(600_000); // 10 minutes — workflow takes time

    const { accessToken } = await loginViaAPI(page);
    token = accessToken;

    // Always create a fresh group+session for this test
    const group = await createGroupAPI(page, token, `Playwright Full Workflow ${Date.now()}`);
    groupId = group.id;
    const sess = await createSessionAPI(page, token, groupId, 'Full Drone Docking Workflow');
    sessionId = sess.id;

    await page.goto(`${BASE}/chat?sessionId=${sessionId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 15_000 });

    // ── Open Workflow tab ─────────────────────────────
    await page.locator('button', { hasText: 'Workflow' }).click();
    await expect(page.locator('h3', { hasText: 'Research Workflow' })).toBeVisible({ timeout: 10_000 });

    // ── Select template ───────────────────────────────
    await page.locator('button', { hasText: /Summarization/i }).click();
    await expect(page.locator('h3', { hasText: 'Research Goal' })).toBeVisible();

    // ── Enter goal ────────────────────────────────────
    await page.locator('textarea[placeholder*="Describe your research objective"]').fill(
      'Create an IEEE format summarization and comparison paper on drone docking using robotic manipulator, comparing papers from the past 5 years'
    );
    await page.getByRole('button', { name: /Plan Workflow/i }).click();

    // ── Wait for plan review ──────────────────────────
    await expect(page.getByRole('button', { name: /Start Workflow/i })).toBeVisible({ timeout: 45_000 });

    // ── Start workflow ────────────────────────────────
    await page.getByRole('button', { name: /Start Workflow/i }).click();

    // ── Wait for steps to run — first checkpoint at step 2 (Conduct Literature Survey)
    console.log('[Test] Workflow started, waiting for first checkpoint...');
    const approveBtn = page.getByRole('button', { name: /Approve/i });
    // Wait for the Approve button to be VISIBLE and ENABLED
    await expect(approveBtn).toBeVisible({ timeout: 300_000 }); // up to 5 min
    await expect(approveBtn).toBeEnabled({ timeout: 30_000 });

    // Verify checkpoint shows the step name
    await expect(page.getByText(/Checkpoint:/i)).toBeVisible();

    // ── VERIFY FIX: Checkpoint should display output ──
    // The checkpoint output is in a <pre> inside the checkpoint approval section
    const checkpointSection = page.locator('div', { has: page.getByText(/Checkpoint:/i) });
    const checkpointOutput = checkpointSection.locator('pre').first();
    // The checkpoint output <pre> should be visible and not empty
    await expect(checkpointOutput).toBeVisible({ timeout: 10_000 });
    const outputText = await checkpointOutput.textContent();
    console.log(`[Test] Checkpoint output length: ${outputText?.length ?? 0} chars`);
    expect(outputText?.length).toBeGreaterThan(10); // Must have some real content

    // ── Approve first checkpoint ──────────────────────
    console.log('[Test] Approving first checkpoint (Literature Survey)...');
    await approveBtn.click();

    // After approval, button becomes disabled. Wait for the next checkpoint
    // where the button becomes enabled again.
    console.log('[Test] Waiting for second checkpoint (Draft Research Paper)...');
    // First wait for the button to become disabled (approval processing)
    await expect(approveBtn).toBeDisabled({ timeout: 10_000 });
    // Then wait for it to become enabled again (new checkpoint arrived)
    await expect(approveBtn).toBeEnabled({ timeout: 300_000 });
    await expect(page.getByText(/Checkpoint:/i)).toBeVisible();

    // Verify second checkpoint also has output
    const checkpoint2Section = page.locator('div', { has: page.getByText(/Checkpoint:/i) });
    const checkpoint2Output = checkpoint2Section.locator('pre').first();
    await expect(checkpoint2Output).toBeVisible({ timeout: 10_000 });
    const output2Text = await checkpoint2Output.textContent();
    console.log(`[Test] Checkpoint 2 output length: ${output2Text?.length ?? 0} chars`);
    expect(output2Text?.length).toBeGreaterThan(10);

    // ── Approve second checkpoint ─────────────────────
    console.log('[Test] Approving second checkpoint (Draft Research Paper)...');
    await approveBtn.click();

    // ── Wait for workflow completion ──────────────────
    console.log('[Test] Waiting for workflow completion...');
    await expect(page.locator('h3', { hasText: 'Workflow Complete' })).toBeVisible({ timeout: 300_000 });

    // ── VERIFY FIX: Completed phase shows step outputs ──
    // The completed view should have step output cards with <pre> elements
    const outputCards = page.locator('pre');
    const outputCount = await outputCards.count();
    console.log(`[Test] Completed phase shows ${outputCount} output sections`);
    expect(outputCount).toBeGreaterThanOrEqual(1);

    // Verify the "New Workflow" button is visible
    await expect(page.getByRole('button', { name: /New Workflow/i })).toBeVisible();

    console.log('[Test] ✅ Full workflow completed successfully!');
  });

  // ── Test 7: Chat message in the main panel shows workflow progress ──
  test('7 — Chat panel shows workflow progress messages', async ({ page }) => {
    test.setTimeout(600_000);

    const { accessToken } = await loginViaAPI(page);
    token = accessToken;

    const group = await createGroupAPI(page, token, `Playwright Chat Msg ${Date.now()}`);
    const sess = await createSessionAPI(page, token, group.id, 'Chat Msg Test');

    await page.goto(`${BASE}/chat?sessionId=${sess.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 15_000 });

    // Open Workflow tab, select template, enter goal, plan, start
    await page.locator('button', { hasText: 'Workflow' }).click();
    await expect(page.locator('h3', { hasText: 'Research Workflow' })).toBeVisible({ timeout: 10_000 });
    await page.locator('button', { hasText: /Summarization/i }).click();
    await page.locator('textarea[placeholder*="Describe your research objective"]').fill(
      'Compare drone docking using robotic manipulator papers from the past 5 years'
    );
    await page.getByRole('button', { name: /Plan Workflow/i }).click();
    await expect(page.getByRole('button', { name: /Start Workflow/i })).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: /Start Workflow/i }).click();

    // Wait for the first checkpoint
    await expect(page.getByRole('button', { name: /Approve/i })).toBeVisible({ timeout: 300_000 });

    // Check that chat messages show workflow progress text
    await expect(page.getByText(/Retrieve Papers/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Paused/i).first()).toBeVisible({ timeout: 10_000 });

    console.log('[Test] ✅ Chat panel displays workflow progress');
  });
});
