/**
 * AI Service Client
 *
 * HTTP client for communicating with the FastAPI AI service.
 * Handles chat Q&A, summarization, group AI chat, paper Q&A, and vector operations.
 *
 * CRITICAL: AI only responds when @ai trigger is present.
 */
import logger from '../utils/logger.js';
import { setTimeout, clearTimeout } from 'timers';
import { TextDecoder } from 'util';
// Get AI service URL from environment (with fallback)
function getAiServiceUrl() {
    return process.env.AI_SERVICE_URL || 'http://localhost:8000';
}
/**
 * Validate that content contains @ai trigger.
 * @throws Error if @ai trigger is missing
 */
export function validateAiTrigger(content, fieldName = 'prompt') {
    if (!content || !content.toLowerCase().includes('@ai')) {
        throw new Error(`${fieldName} must contain @ai trigger. AI only responds when triggered by @ai.`);
    }
}
/**
 * AI Service Client class
 */
class AIClient {
    timeout;
    constructor(timeout = 300000) {
        this.timeout = timeout;
    }
    get baseUrl() {
        return getAiServiceUrl();
    }
    /**
     * Make a request to the AI service
     */
    async request(endpoint, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {}),
                },
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Request failed' }));
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }
            return response.json();
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('AI service request timed out');
            }
            throw error;
        }
    }
    /**
     * Check AI service health
     */
    async health() {
        return this.request('/health');
    }
    /**
     * Check if AI service is available and configured
     */
    async isAvailable() {
        try {
            const health = await this.health();
            return health.status === 'healthy' && health.groq_configured;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.warn(`AI service not available: ${errorMessage}`);
            return false;
        }
    }
    /**
     * Group AI Chat with @ai trigger (uses group-isolated RAG)
     */
    async groupAIChat(request) {
        // Validate @ai trigger
        validateAiTrigger(request.prompt);
        logger.info(`Group AI chat for group: ${request.group_id}, session: ${request.session_id || 'none'}`);
        const response = await this.request(`/groups/${request.group_id}/ai-chat`, {
            method: 'POST',
            body: JSON.stringify(request),
        });
        logger.info(`Group AI response in ${response.latency_ms}ms, ${response.sources.length} sources`);
        return response;
    }
    /**
     * Stream Group AI Chat tokens via NDJSON
     * Yields objects: { token: string } or { done: true, latency_ms, sources, ... }
     */
    async *groupAIChatStream(request) {
        // Note: @ai trigger validation removed — explicit agent selection bypasses @ai requirement
        logger.info(`Group AI chat stream for group: ${request.group_id}, session: ${request.session_id || 'none'}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(`${this.baseUrl}/groups/${request.group_id}/ai-chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
                signal: controller.signal,
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Request failed' }));
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }
            if (!response.body) {
                throw new Error('No response body');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    try {
                        const data = JSON.parse(line);
                        yield data;
                    }
                    catch {
                        // Ignore malformed chunks
                    }
                }
            }
            // Process remaining buffer
            if (buffer.trim()) {
                try {
                    yield JSON.parse(buffer);
                }
                catch {
                    // Ignore
                }
            }
            clearTimeout(timeoutId);
        }
        catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    /**
     * Paper Q&A with @ai trigger
     */
    async paperQuestion(request) {
        // Validate @ai trigger
        validateAiTrigger(request.question, 'question');
        logger.info(`Paper Q&A for paper: ${request.paper_id}, group: ${request.group_id}`);
        const response = await this.request('/papers/question', {
            method: 'POST',
            body: JSON.stringify(request),
        });
        logger.info(`Paper answer generated in ${response.latency_ms}ms`);
        return response;
    }
    /**
     * Paper summarization with @ai trigger
     */
    async paperSummarize(request) {
        // Ensure trigger is set
        const trigger = request.trigger || '@ai summarize';
        validateAiTrigger(trigger, 'trigger');
        logger.info(`Paper summarize for paper: ${request.paper_id}, group: ${request.group_id}`);
        const response = await this.request('/papers/summarize', {
            method: 'POST',
            body: JSON.stringify({ ...request, trigger }),
        });
        logger.info(`Paper summary generated in ${response.latency_ms}ms`);
        return response;
    }
    /**
     * Add paper to group and generate embeddings
     */
    async addPaperToGroup(request) {
        logger.info(`Adding paper ${request.paper_id} to group ${request.group_id}`);
        const response = await this.request(`/groups/${request.group_id}/papers`, {
            method: 'POST',
            body: JSON.stringify(request),
        });
        logger.info(`Paper added with ${response.vectors_created} vectors`);
        return response;
    }
    /**
     * Search group vectors
     */
    async searchVectors(request) {
        logger.info(`Vector search in group: ${request.group_id}`);
        const response = await this.request('/vectors/search', {
            method: 'POST',
            body: JSON.stringify(request),
        });
        logger.info(`Vector search returned ${response.total} results in ${response.latency_ms}ms`);
        return response;
    }
    /**
     * Run an agentic research task (LangGraph orchestration)
     */
    async runAgenticTask(request) {
        logger.info(`Agentic task: ${request.task_type}`);
        const response = await this.request('/agentic/run', {
            method: 'POST',
            body: JSON.stringify(request),
        });
        logger.info(`Agentic task completed in ${response.latency_ms}ms`);
        return response;
    }
    /**
     * Run an agentic research task and stream progress
     */
    async runAgenticTaskStream(request, onProgress, onToken) {
        logger.info(`Agentic task stream: ${request.task_type}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(`${this.baseUrl}/agentic/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
                signal: controller.signal,
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Request failed' }));
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }
            if (!response.body) {
                throw new Error('No response body');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalResult = null;
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.type === 'progress') {
                            onProgress(data.message);
                        }
                        else if (data.type === 'token') {
                            if (onToken && data.content) {
                                onToken(data.content);
                            }
                        }
                        else if (data.type === 'complete') {
                            finalResult = data;
                        }
                        else if (data.type === 'error') {
                            throw new Error(data.error || 'AI service returned an error');
                        }
                    }
                    catch (e) {
                        // Re-throw intentional errors (from error events), only ignore JSON parse errors
                        if (e instanceof SyntaxError) {
                            // Ignore parse errors for incomplete chunks
                            continue;
                        }
                        throw e;
                    }
                }
            }
            clearTimeout(timeoutId);
            if (!finalResult) {
                throw new Error('Stream ended without complete event');
            }
            logger.info(`Agentic task stream completed in ${finalResult.latency_ms}ms`);
            return finalResult;
        }
        catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    /**
     * Classify an @ai prompt into an agentic task using embeddings
     */
    async classifyAgenticIntent(request) {
        validateAiTrigger(request.prompt, 'prompt');
        const response = await this.request('/agentic/classify-intent', {
            method: 'POST',
            body: JSON.stringify(request),
        });
        return response;
    }
    /**
     * Classify intent with ambiguity detection and alternatives
     */
    async classifyAgenticIntentDetailed(request) {
        // Note: @ai trigger validation removed — explicit agent selection bypasses @ai requirement
        const response = await this.request('/agentic/classify-intent-detailed', {
            method: 'POST',
            body: JSON.stringify(request),
        });
        return response;
    }
    /**
     * Generate group report
     */
    async generateReport(request) {
        if (request.prompt) {
            validateAiTrigger(request.prompt);
        }
        logger.info(`Generating report for group: ${request.group_id}`);
        const response = await this.request(`/reports/group/${request.group_id}/generate`, {
            method: 'POST',
            body: JSON.stringify(request),
        });
        logger.info(`Report generated: ${response.filename} (${response.file_size} bytes)`);
        return response;
    }
    /**
     * Build a citation relationship graph
     */
    async buildCitationGraph(request) {
        logger.info('Building citation graph');
        const response = await this.request('/citation-graph/build', {
            method: 'POST',
            body: JSON.stringify(request),
        });
        return response;
    }
    // ============ Workflow Methods ============
    /**
     * List available workflow templates
     */
    async listWorkflowTemplates() {
        return this.request('/workflows/templates');
    }
    /**
     * Plan a research workflow from a goal
     */
    async planWorkflow(request) {
        logger.info(`Planning workflow for group: ${request.group_id}, goal: ${request.goal.slice(0, 80)}...`);
        return this.request('/workflows/plan', {
            method: 'POST',
            body: JSON.stringify(request),
        });
    }
    /**
     * Start an approved workflow — returns NDJSON stream.
     * Calls onEvent for each workflow event.
     */
    async startWorkflowStream(request, onEvent) {
        logger.info(`Starting workflow stream: ${request.workflow_id}`);
        await this._streamWorkflowRequest('/workflows/start', request, onEvent);
    }
    /**
     * Approve a workflow checkpoint step and resume — returns NDJSON stream.
     */
    async approveWorkflowStepStream(request, onEvent) {
        if (!request.approved) {
            // Non-streaming rejection
            const result = await this.request('/workflows/approve-step', {
                method: 'POST',
                body: JSON.stringify(request),
            });
            onEvent({ type: 'workflow:step:rejected', workflow_id: request.workflow_id, ...result });
            return;
        }
        logger.info(`Approving step ${request.step_index} for workflow: ${request.workflow_id}`);
        await this._streamWorkflowRequest('/workflows/approve-step', request, onEvent);
    }
    /**
     * Cancel a workflow
     */
    async cancelWorkflow(workflowId) {
        return this.request('/workflows/cancel', {
            method: 'POST',
            body: JSON.stringify({ workflow_id: workflowId }),
        });
    }
    /**
     * Get workflow status and steps
     */
    async getWorkflowStatus(workflowId) {
        return this.request(`/workflows/${workflowId}/status`);
    }
    /**
     * List workflows for a group
     */
    async listGroupWorkflows(groupId, limit = 20) {
        return this.request(`/workflows/group/${groupId}?limit=${limit}`);
    }
    /**
     * Internal helper: stream a workflow NDJSON endpoint and dispatch events.
     */
    async _streamWorkflowRequest(endpoint, body, onEvent) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'Request failed' }));
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }
            if (!response.body) {
                throw new Error('No response body for workflow stream');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    try {
                        const event = JSON.parse(line);
                        onEvent(event);
                    }
                    catch {
                        // Ignore malformed lines
                    }
                }
            }
            // Remaining buffer
            if (buffer.trim()) {
                try {
                    onEvent(JSON.parse(buffer));
                }
                catch {
                    // Ignore
                }
            }
            clearTimeout(timeoutId);
        }
        catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    /**
     * Process an @ai message and return the AI response
     */
    async processAtAiMessage(content, sessionId, userId, groupId) {
        // Check if message contains @ai
        const trimmed = content.trim();
        if (!trimmed.toLowerCase().includes('@ai')) {
            return null;
        }
        if (!groupId) {
            throw new Error('AI chat is only supported within research groups');
        }
        return this.groupAIChat({
            prompt: content,
            group_id: groupId,
            session_id: sessionId,
            user_id: userId,
        });
    }
}
// Export singleton instance
export const aiClient = new AIClient();
// Export class for testing
export { AIClient };
//# sourceMappingURL=aiClient.js.map