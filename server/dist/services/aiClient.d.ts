/**
 * AI Service Client
 *
 * HTTP client for communicating with the FastAPI AI service.
 * Handles chat Q&A, summarization, group AI chat, paper Q&A, and vector operations.
 *
 * CRITICAL: AI only responds when @ai trigger is present.
 */
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
export type AgenticTaskType = 'paper_retrieval' | 'literature_survey' | 'gap_analysis' | 'fact_check' | 'novelty_assessment' | 'research_mentor' | 'paper_writing' | 'deep_research' | 'methodology_extraction' | 'reviewer_anticipation';
export interface AgenticRunRequest {
    task_type: AgenticTaskType;
    prompt: string;
    group_id?: string;
    user_id?: string;
    session_id?: string;
    paper_ids?: string[];
    options?: Record<string, unknown>;
}
export interface AgenticRunResponse {
    task_type: AgenticTaskType;
    result: Record<string, unknown>;
    artifacts: string[];
    metadata: Record<string, unknown>;
    latency_ms: number;
}
export interface IntentClassifyRequest {
    prompt: string;
}
export interface IntentClassifyResponse {
    task_type?: AgenticTaskType | null;
    similarity: number;
    threshold: number;
    matched_phrase?: string | null;
}
export interface IntentClassifyDetailedResponse {
    task_type?: string | null;
    similarity: number;
    threshold: number;
    matched_phrase?: string | null;
    ambiguous: boolean;
    fallback: boolean;
    alternatives: Array<{
        intent: string;
        score: number;
    }>;
}
export interface AgenticChatResponse {
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
export interface HealthResponse {
    status: string;
    groq_configured: boolean;
    database_connected: boolean;
    vector_store_connected: boolean;
    timestamp: string;
}
export interface AIServiceError {
    detail: string;
}
export interface WorkflowTemplateInfo {
    template_id: string;
    title: string;
    description: string;
    research_type: string;
    estimated_minutes: number;
    step_count: number;
    steps: Array<Record<string, unknown>>;
}
export interface WorkflowPlanRequest {
    goal: string;
    group_id?: string;
    user_id: string;
    session_id?: string;
    preferred_template?: string;
}
export interface WorkflowPlanResponse {
    workflow_id: string;
    template_id?: string;
    title: string;
    description: string;
    research_type: string;
    estimated_minutes: number;
    steps: Array<Record<string, unknown>>;
    status: string;
}
export interface WorkflowStartRequest {
    workflow_id: string;
    user_feedback?: string;
}
export interface WorkflowStepApprovalRequest {
    workflow_id: string;
    step_index: number;
    approved: boolean;
    feedback?: string;
}
export interface WorkflowStatusResponse {
    workflow_id: string;
    status: string;
    current_step_index: number;
    total_steps: number;
    steps: Array<Record<string, unknown>>;
    final_output?: Record<string, unknown>;
}
export interface WorkflowEvent {
    type: string;
    workflow_id?: string;
    step_index?: number;
    step_name?: string;
    agent_type?: string;
    content?: string;
    message?: string;
    error?: string;
    result?: Record<string, unknown>;
    [key: string]: unknown;
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
     * Group AI Chat with @ai trigger (uses group-isolated RAG)
     */
    groupAIChat(request: GroupAIChatRequest): Promise<GroupAIChatResponse>;
    /**
     * Stream Group AI Chat tokens via NDJSON
     * Yields objects: { token: string } or { done: true, latency_ms, sources, ... }
     */
    groupAIChatStream(request: GroupAIChatRequest): AsyncGenerator<{
        token?: string;
        done?: boolean;
        latency_ms?: number;
        sources?: Array<{
            id: string;
            type: string;
            similarity?: number;
        }>;
        model?: string;
        error?: string;
    }>;
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
     * Run an agentic research task (LangGraph orchestration)
     */
    runAgenticTask(request: AgenticRunRequest): Promise<AgenticRunResponse>;
    /**
     * Run an agentic research task and stream progress
     */
    runAgenticTaskStream(request: AgenticRunRequest, onProgress: (message: string) => void, onToken?: (token: string) => void): Promise<AgenticRunResponse>;
    /**
     * Classify an @ai prompt into an agentic task using embeddings
     */
    classifyAgenticIntent(request: IntentClassifyRequest): Promise<IntentClassifyResponse>;
    /**
     * Classify intent with ambiguity detection and alternatives
     */
    classifyAgenticIntentDetailed(request: IntentClassifyRequest): Promise<IntentClassifyDetailedResponse>;
    /**
     * Generate group report
     */
    generateReport(request: GenerateReportRequest): Promise<ReportResponse>;
    /**
     * Build a citation relationship graph
     */
    buildCitationGraph(request: {
        query: string;
        group_id?: string;
    }): Promise<{
        graph: {
            nodes: any[];
            edges: any[];
        };
        source_count: number;
    }>;
    /**
     * List available workflow templates
     */
    listWorkflowTemplates(): Promise<WorkflowTemplateInfo[]>;
    /**
     * Plan a research workflow from a goal
     */
    planWorkflow(request: WorkflowPlanRequest): Promise<WorkflowPlanResponse>;
    /**
     * Start an approved workflow — returns NDJSON stream.
     * Calls onEvent for each workflow event.
     */
    startWorkflowStream(request: WorkflowStartRequest, onEvent: (event: WorkflowEvent) => void): Promise<void>;
    /**
     * Approve a workflow checkpoint step and resume — returns NDJSON stream.
     */
    approveWorkflowStepStream(request: WorkflowStepApprovalRequest, onEvent: (event: WorkflowEvent) => void): Promise<void>;
    /**
     * Cancel a workflow
     */
    cancelWorkflow(workflowId: string): Promise<{
        status: string;
        workflow_id: string;
    }>;
    /**
     * Get workflow status and steps
     */
    getWorkflowStatus(workflowId: string): Promise<WorkflowStatusResponse>;
    /**
     * List workflows for a group
     */
    listGroupWorkflows(groupId: string, limit?: number): Promise<{
        workflows: any[];
        total: number;
    }>;
    /**
     * Internal helper: stream a workflow NDJSON endpoint and dispatch events.
     */
    private _streamWorkflowRequest;
    /**
     * Process an @ai message and return the AI response
     */
    processAtAiMessage(content: string, sessionId: string, userId: string, groupId?: string): Promise<GroupAIChatResponse | null>;
}
export declare const aiClient: AIClient;
export { AIClient };
//# sourceMappingURL=aiClient.d.ts.map