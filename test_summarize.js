const fs = require('fs');

async function test() {
    const email = "track3_new@example.com";
    const password = "password123";

    // Login
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (!loginRes.ok) {
        console.error("Login failed:", await loginRes.text());
        return;
    }

    const loginData = await loginRes.json();
    const token = loginData.accessToken;
    const user = loginData.user;

    // Get groups
    const groupsRes = await fetch('http://localhost:3001/api/groups', {
        headers: { Authorization: `Bearer ${token}` }
    });
    const groupsData = await groupsRes.json();

    if (!groupsData.items || groupsData.items.length === 0) {
        console.error("No groups found");
        return;
    }

    const groupId = groupsData.items[0].id;

    // Get papers in group
    const papersRes = await fetch(`http://localhost:3001/api/groups/${groupId}/papers`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const papersData = await papersRes.json();

    if (!papersData || papersData.length === 0) {
        console.error("No papers found in group");
        return;
    }

    const paperId = papersData[0].paperId;

    console.log(`Testing summarize for Group: ${groupId}, Paper: ${paperId}`);

    // Summarize
    const summarizeRes = await fetch(`http://localhost:3001/api/groups/${groupId}/papers/${paperId}/summarize`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
    });

    console.log(`Summarize Status: ${summarizeRes.status}`);
    const result = await summarizeRes.json();
    console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);
