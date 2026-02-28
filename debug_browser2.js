const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.type()}: ${msg.text()}`));

    page.on('request', request => {
        if (request.url().includes('/api/groups')) {
            console.log(`>> [REQ] ${request.method()} ${request.url()}`);
        }
    });

    page.on('response', async response => {
        if (response.url().includes('/api/groups')) {
            console.log(`<< [RES] ${response.status()} ${response.url()}`);
        }
    });

    console.log("Navigating to login...");
    await page.goto('http://localhost:3000/auth/signin');

    await page.fill('input[type="email"]', 'track3_final@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    console.log("Waiting for dashboard...");
    await page.waitForURL('http://localhost:3000/home');

    // Create group
    await page.click('button:has-text("Create Group")');
    await page.fill('input[placeholder="e.g., Quantum Computing Research"]', 'Playwright Group');
    await page.fill('textarea[placeholder="What is this group about?"]', 'Testing');
    await page.click('button[type="submit"]:has-text("Create Group")');

    await page.waitForURL(/\/group\?id=/);
    const groupId = page.url().split('id=')[1];
    console.log(`Group ID: ${groupId}`);

    // Get token
    const token = await page.evaluate(() => localStorage.getItem('token'));

    // Inject script to add paper and summarize
    await page.evaluate(async ({ groupId, token }) => {
        console.log("Adding paper...");
        const res = await fetch(`http://localhost:3001/api/groups/${groupId}/papers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                paperId: '0d35140a-c492-540f-a996-6c78651fbdac',
                notes: ''
            })
        });

        console.log("Added paper status:", res.status);

        console.log("Summarizing paper...");
        try {
            const sumRes = await fetch(`http://localhost:3001/api/groups/${groupId}/papers/0d35140a-c492-540f-a996-6c78651fbdac/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({})
            });
            console.log("Summarize status:", sumRes.status);
            const text = await sumRes.text();
            console.log("Summary result:", text.substring(0, 100));
        } catch (e) {
            console.error("Summarize failed:", e);
        }
    }, { groupId, token });

    await page.waitForTimeout(15000);
    console.log("Done.");
    await browser.close();
})();
