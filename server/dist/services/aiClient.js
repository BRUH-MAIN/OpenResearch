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
    constructor(timeout = 120000) {
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