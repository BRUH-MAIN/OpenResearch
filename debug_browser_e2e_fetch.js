const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log("Navigating to login...");
    await page.goto('http://localhost:3000/auth/signin');

    await page.fill('input[type="email"]', 'track3_final@example.com');
    // fill passwords using placeholder
    const pwInputs = await page.$$('input[type="password"]');
    await pwInputs[0].fill('password123');
    await page.click('button[type="submit"]');

    console.log("Waiting for dashboard...");
    await page.waitForURL('http://localhost:3000/home', { timeout: 10000 });

    console.log("Getting auth token...");
    const token = await page.evaluate(() => {
        const auth = localStorage.getItem('openresearch-auth');
        return auth ? JSON.parse(auth).state.accessToken : null;
    });

    console.log("Tokens fetched:", token ? (token.substring(0, 10) + "...") : "null");

    const groupId = "5fc2e012-0884-4223-b706-33d2ad24fc1a";
    const paperId = "0d35140a-c492-540f-a996-6c78651fbdac";

    const resultText = await page.evaluate(async ({ groupId, paperId, token }) => {
        try {
            const sumRes = await fetch(`http://localhost:3001/api/groups/${groupId}/papers/${paperId}/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({})
            });
            return await sumRes.text();
        } catch (e) {
            return `Error: ${e.message}\n${e.stack}`;
        }
    }, { groupId, paperId, token });

    fs.writeFileSync('d:\\Openresearch\\debug_fetch_result.txt', resultText);
    console.log("Wrote direct response to d:\\Openresearch\\debug_fetch_result.txt");

    await browser.close();
})();
