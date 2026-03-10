import { test, expect, Page } from 'playwright/test';

const BASE = 'http://localhost:3000';
const API = 'http://localhost:3001';

const TEST_EMAIL = 'jetski_tester@example.com';
const TEST_PASSWORD = 'Password123!';

async function loginViaAPI(page: Page) {
  const resp = await page.request.post(`${API}/api/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });

  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  const { accessToken, refreshToken, user } = body;

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
    { accessToken, refreshToken, user }
  );

  return { accessToken };
}

async function createGroupAPI(page: Page, token: string, name: string) {
  const resp = await page.request.post(`${API}/api/groups`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, description: 'Responsive test group' },
  });
  expect(resp.ok()).toBeTruthy();
  return (await resp.json()) as { id: string; name: string };
}

async function createSessionAPI(page: Page, token: string, groupId: string, title: string) {
  const resp = await page.request.post(`${API}/api/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { groupId, title },
  });
  expect(resp.ok()).toBeTruthy();
  return (await resp.json()) as { id: string };
}

test.describe('Responsive frontend smoke', () => {
  test('home modal and research mobile overlays render', async ({ page }) => {
    const { accessToken } = await loginViaAPI(page);
    const stamp = Date.now();
    const group = await createGroupAPI(page, accessToken, `Responsive Group ${stamp}`);
    const session = await createSessionAPI(page, accessToken, group.id, `Responsive Session ${stamp}`);

    await page.goto(`${BASE}/home`);
    await expect(page.getByRole('heading', { name: 'My Groups' })).toBeVisible();

    await page.getByRole('button', { name: /Create Group/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Create New Group', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close modal' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    await page.goto(`${BASE}/research?sessionId=${session.id}`);
    await expect(page.getByText('Research Workspace')).toBeVisible({ timeout: 15000 });

    const sourcesButton = page.getByRole('button', { name: /Sources/i }).first();
    await expect(sourcesButton).toBeVisible();
    await sourcesButton.click();
    await expect(page.getByRole('heading', { name: 'Sources', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close modal' }).click();

    const workspaceButton = page.getByRole('button', { name: /Workspace/i }).first();
    await expect(workspaceButton).toBeVisible();
    await workspaceButton.click();
    await expect(page.getByRole('heading', { name: 'Workspace', exact: true })).toBeVisible();
  });
});