/**
 * AI Service Client
 *
 * HTTP client for communicating with the FastAPI AI service.
 * Handles chat Q&A, summarization, group AI chat, paper Q&A, and vector operations.
 *
 * CRITICAL: AI only responds when @ai trigger is present.
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
export interface GroupAIChatRequest {
    prompt: string;
    group_id: string;
    session_id?: string;
    user_id: string;
}
export interface GroupAIChatResponse {
    id: string;
    text: string;
    metadata: Record<string, unknown>;
    sources: Array<{
        id: string;
        type: string;
        similarity?: number;
    }>;
    latency_ms: number;
}
export interface PaperQuestionRequest {
    paper_id: string;
    question: string;
    group_id: string;
    session_id?: string;
    user_id: string;
}
export interface PaperAnswerResponse {
    id: string;
    answer: string;
    paper_id: string;
    sources: Array<{
        id: string;
        type: string;
        chunk?: number;
    }>;
    metadata: Record<string, unknown>;
    latency_ms: number;
}
export interface PaperSummarizeRequest {
    paper_id: string;
    group_id: string;
    session_id?: string;
    user_id: string;
    trigger?: string;
}
export interface PaperSummaryResponse {
    id: string;
    summary: string;
    key_points: string[];
    paper_id: string;
    metadata: Record<string, unknown>;
    latency_ms: number;
}
export interface AddPaperToGroupRequest {
    paper_id: string;
    group_id: string;
    user_id: string;
    title: string;
    abstract: string;
    full_text?: string;
    metadata?: Record<string, unknown>;
}
export interface AddPaperResponse {
    success: boolean;
    paper_id: string;
    group_id: string;
    vectors_created: number;
    message: string;
}
export interface GenerateReportRequest {
    group_id: string;
    user_id?: string;
    report_type?: 'weekly' | 'monthly' | 'custom';
    date_range?: {
        start?: string;
        end?: string;
    };
    sections?: string[];
    custom_title?: string;
    paper_ids?: string[];
    include_sessions?: boolean;
    include_papers?: boolean;
    include_summaries?: boolean;
    prompt?: string;
}
export interface ReportResponse {
    id?: string;
    report_id?: string;
    report_path?: string;
    url?: string;
    filename?: string;
    file_size?: number;
    group_id: string;
    summary?: string;
    created_at?: string;
}
export interface RecommendationsRequest {
    group_id: string;
    limit?: number;
    exclude_paper_ids?: string[];
}
export interface RecommendationsResponse {
    recommendations: Array<{
        id: string;
        title: string;
        abstract?: string;
        score: number;
        reason: string;
    }>;
    total: number;
    source: string;
}
export interface VectorSearchRequest {
    group_id: string;
    query: string;
    limit?: number;
    content_types?: string[];
    paper_id?: string;
}
export interface VectorSearchResponse {
    results: Array<{
        id: string;
        group_id: string;
        paper_id: string;
        content_type: string;
        content: string;
        similarity: number;
    }>;
    total: number;
    group_id: string;
    latency_ms: number;
}
export interface HealthResponse {
    status: string;
    gemini_configured: boolean;
    database_connected: boolean;
    vector_store_connected: boolean;
    timestamp: string;
}
export interface AIServiceError {
    detail: string;
}
/**
 * Validate that content contains @ai trigger.
 * @throws Error if @ai trigger is missing
 */
export declare function validateAiTrigger(content: string, fieldName?: string): void;
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
     * Legacy chat Q&A with session context
     */
    chat(request: ChatRequest): Promise<ChatResponse>;
    /**
     * Legacy summarize a session
     */
    summarize(request: SummarizeRequest): Promise<SummaryResponse>;
    /**
     * Group AI Chat with @ai trigger (uses group-isolated RAG)
     */
    groupAIChat(request: GroupAIChatRequest): Promise<GroupAIChatResponse>;
    /**
     * Paper Q&A with @ai trigger
     */
    paperQuestion(request: PaperQuestionRequest): Promise<PaperAnswerResponse>;
    /**
     * Paper summarization with @ai trigger
     */
    paperSummarize(request: PaperSummarizeRequest): Promise<PaperSummaryResponse>;
    /**
     * Add paper to group and generate embeddings
     */
    addPaperToGroup(request: AddPaperToGroupRequest): Promise<AddPaperResponse>;
    /**
     * Search group vectors
     */
    searchVectors(request: VectorSearchRequest): Promise<VectorSearchResponse>;
    /**
     * Get AI-powered recommendations for a group
     * Note: This endpoint may not be implemented in AI service - fallback logic handles this
     */
    getRecommendations(request: RecommendationsRequest): Promise<RecommendationsResponse>;
    /**
     * Generate group report
     */
    generateReport(request: GenerateReportRequest): Promise<ReportResponse>;
    /**
     * Process an @ai message and return the AI response
     */
    processAtAiMessage(content: string, sessionId: string, userId: string, groupId?: string): Promise<GroupAIChatResponse | ChatResponse | null>;
}
export declare const aiClient: AIClient;
export { AIClient };
//# sourceMappingURL=aiClient.d.ts.map