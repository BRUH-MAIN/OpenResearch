/**
 * AI Service Client
 *
 * HTTP client for communicating with the FastAPI AI service.
 * Handles chat Q&A, summarization, and health checks.
 */
export interface ChatRequest {
    question: string;
    session_id?: string;
    user_id?: string;
    include_papers?: boolean;
    max_context_messages?: number;
}
export interface ChatResponse {
    answer: string;
    sources: string[];
    model: string;
    latency_ms: number;
    context_messages_used: number;
    papers_used: number;
}
export interface SummarizeRequest {
    session_id: string;
    max_messages?: number;
}
export interface SummaryResponse {
    summary: string;
    key_points: string[];
    participant_count: number;
    message_count: number;
    model: string;
    latency_ms: number;
}
export interface HealthResponse {
    status: string;
    gemini_configured: boolean;
    database_connected: boolean;
    timestamp: string;
}
export interface AIServiceError {
    detail: string;
}
/**
 * AI Service Client class
 */
declare class AIClient {
    private timeout;
    constructor(timeout?: number);
    private get baseUrl();
    /**
     * Make a request to the AI service
     */
    private request;
    /**
     * Check AI service health
     */
    health(): Promise<HealthResponse>;
    /**
     * Check if AI service is available and configured
     */
    isAvailable(): Promise<boolean>;
    /**
     * Chat Q&A with session context
     */
    chat(request: ChatRequest): Promise<ChatResponse>;
    /**
     * Summarize a session
     */
    summarize(request: SummarizeRequest): Promise<SummaryResponse>;
    /**
     * Process an @ai message and return the AI response
     */
    processAtAiMessage(content: string, sessionId: string, userId: string): Promise<ChatResponse | null>;
}
export declare const aiClient: AIClient;
export { AIClient };
//# sourceMappingURL=aiClient.d.ts.map