const fs = require('fs');

async function testAgents() {
    console.log("=== Testing All AI Agents ===");

    // 1. Login
    const email = "track3_new@example.com";
    const password = "password123";
    const loginRes = await fetch("http://localhost:3001/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    if (!loginRes.ok) {
        console.error("Login failed:", await loginRes.text());
        process.exit(1);
    }

    const loginData = await loginRes.json();
    const token = loginData.accessToken;

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

    const papersRes = await fetch(`http://localhost:3001/api/groups/${groupId}/papers`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    const papersData = await papersRes.json();
    const paperIds = papersData.slice(0, 2).map(p => p.paperId);

    console.log(`Using Group ID: ${groupId}`);
    console.log(`Available Papers in Group: ${paperIds.length > 0 ? paperIds : 'None'}`);

    const AGENTIC_TASK_LABELS = {
        paper_retrieval: 'Paper Retrieval',
        literature_survey: 'Literature Survey',
        gap_analysis: 'Gap Analysis',
        fact_check: 'Fact Check',
        novelty_assessment: 'Novelty Assessment',
        research_mentor: 'Research Mentor',
        paper_writing: 'Paper Writing',
        research_planning: 'Research Planning',
        deep_research: 'Deep Research',
    };

    const PROMPTS = {
        paper_retrieval: "@ai retrieve papers on quantum computing",
        literature_survey: "@ai write a literature survey on attention mechanisms",
        gap_analysis: "@ai perform gap analysis on the current papers",
        fact_check: "@ai fact check: is neighborhood attention faster?",
        novelty_assessment: "@ai assess novelty of this approach",
        research_mentor: "@ai guide me on how to present my findings",
        paper_writing: "@ai draft a methodology section",
        research_planning: "@ai plan my next experiments for sparse attention",
        deep_research: "@ai perform deep research on vision transformers",
    };

    const results = {};

    for (const [taskType, label] of Object.entries(AGENTIC_TASK_LABELS)) {
        console.log(`\n\n--- Testing Agent: ${label} ---`);
        const prompt = PROMPTS[taskType];

        try {
            const timestampStart = Date.now();
            const res = await fetch("http://localhost:3001/api/ai/agentic/run", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    taskType,
                    prompt,
                    groupId,
                    paperIds: paperIds.length > 0 ? paperIds : undefined
                })
            });

            const timeTaken = Date.now() - timestampStart;

            if (res.ok) {
                const data = await res.json();
                console.log(`✅ Success in ${timeTaken}ms!`);
                if (data.artifacts) {
                    console.log(`Artifacts generated: ${data.artifacts.length}`);
                }
                results[taskType] = "SUCCESS";
            } else {
                console.error(`❌ Failed with status ${res.status}:`, await res.text());
                results[taskType] = "FAILED";
            }
        } catch (e) {
            console.error(`❌ Error communicating with backend:`, e.message);
            results[taskType] = "ERROR";
        }

        // Wait to respect Groq rate limits
        console.log("Waiting 35 seconds to respect Groq rate limits...");
        await new Promise(resolve => setTimeout(resolve, 35000));
    }

    console.log("\n\n=== Final Report ===");
    console.table(results);
}

testAgents().catch(console.error);
