/**
 * AI Service Client
 * 
 * HTTP client for communicating with the FastAPI AI service.
 * Handles chat Q&A, summarization, group AI chat, paper Q&A, and vector operations.
 * 
 * CRITICAL: AI only responds when @ai trigger is present.
 */

import logger from '../utils/logger.js';

// Get AI service URL from environment (with fallback)
function getAiServiceUrl(): string {
  return process.env.AI_SERVICE_URL || 'http://localhost:8000';
}

// Types matching FastAPI models
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
  sources: Array<{ id: string; type: string; similarity?: number }>;
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
  sources: Array<{ id: string; type: string; chunk?: number }>;
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

export type AgenticTaskType =
  | 'paper_retrieval'
  | 'literature_survey'
  | 'gap_analysis'
  | 'fact_check'
  | 'novelty_assessment'
  | 'research_mentor'
  | 'paper_writing'
  | 'research_planning'
  | 'deep_research';

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

export interface AgenticChatResponse {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
  sources: Array<{ id: string; type: string; similarity?: number }>;
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

/**
 * Validate that content contains @ai trigger.
 * @throws Error if @ai trigger is missing
 */
export function validateAiTrigger(content: string, fieldName: string = 'prompt'): void {
  if (!content || !content.toLowerCase().includes('@ai')) {
    throw new Error(`${fieldName} must contain @ai trigger. AI only responds when triggered by @ai.`);
  }
}

/**
 * AI Service Client class
 */
class AIClient {
  private timeout: number;

  constructor(timeout: number = 120000) {
    this.timeout = timeout;
  }

  private get baseUrl(): string {
    return getAiServiceUrl();
  }

  /**
   * Make a request to the AI service
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Request failed' })) as { detail?: string };
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      return response.json() as Promise<T>;
    } catch (error: unknown) {
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
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  /**
   * Check if AI service is available and configured
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.health();
      return health.status === 'healthy' && health.groq_configured;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`AI service not available: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Legacy chat Q&A with session context
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    logger.info(`AI chat request for session: ${request.session_id || 'none'}`);

    const response = await this.request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    logger.info(`AI chat response in ${response.latency_ms}ms, ${response.context_messages_used} messages used`);

    return response;
  }

  /**
   * Legacy summarize a session
   */
  async summarize(request: SummarizeRequest): Promise<SummaryResponse> {
    logger.info(`AI summarize request for session: ${request.session_id}`);

    const response = await this.request<SummaryResponse>('/summarize', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    logger.info(`AI summary generated in ${response.latency_ms}ms`);

    return response;
  }

  /**
   * Group AI Chat with @ai trigger (uses group-isolated RAG)
   */
  async groupAIChat(request: GroupAIChatRequest): Promise<GroupAIChatResponse> {
    // Validate @ai trigger
    validateAiTrigger(request.prompt);

    logger.info(`Group AI chat for group: ${request.group_id}, session: ${request.session_id || 'none'}`);

    const response = await this.request<GroupAIChatResponse>(
      `/groups/${request.group_id}/ai-chat`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    logger.info(`Group AI response in ${response.latency_ms}ms, ${response.sources.length} sources`);

    return response;
  }

  /**
   * Paper Q&A with @ai trigger
   */
  async paperQuestion(request: PaperQuestionRequest): Promise<PaperAnswerResponse> {
    // Validate @ai trigger
    validateAiTrigger(request.question, 'question');

    logger.info(`Paper Q&A for paper: ${request.paper_id}, group: ${request.group_id}`);

    const response = await this.request<PaperAnswerResponse>('/papers/question', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    logger.info(`Paper answer generated in ${response.latency_ms}ms`);

    return response;
  }

  /**
   * Paper summarization with @ai trigger
   */
  async paperSummarize(request: PaperSummarizeRequest): Promise<PaperSummaryResponse> {
    // Ensure trigger is set
    const trigger = request.trigger || '@ai summarize';
    validateAiTrigger(trigger, 'trigger');

    logger.info(`Paper summarize for paper: ${request.paper_id}, group: ${request.group_id}`);

    const response = await this.request<PaperSummaryResponse>('/papers/summarize', {
      method: 'POST',
      body: JSON.stringify({ ...request, trigger }),
    });

    logger.info(`Paper summary generated in ${response.latency_ms}ms`);

    return response;
  }

  /**
   * Add paper to group and generate embeddings
   */
  async addPaperToGroup(request: AddPaperToGroupRequest): Promise<AddPaperResponse> {
    logger.info(`Adding paper ${request.paper_id} to group ${request.group_id}`);

    const response = await this.request<AddPaperResponse>(
      `/groups/${request.group_id}/papers`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    logger.info(`Paper added with ${response.vectors_created} vectors`);

    return response;
  }

  /**
   * Search group vectors
   */
  async searchVectors(request: VectorSearchRequest): Promise<VectorSearchResponse> {
    logger.info(`Vector search in group: ${request.group_id}`);

    const response = await this.request<VectorSearchResponse>('/vectors/search', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    logger.info(`Vector search returned ${response.total} results in ${response.latency_ms}ms`);

    return response;
  }

  /**
   * Run an agentic research task (LangGraph orchestration)
   */
  async runAgenticTask(request: AgenticRunRequest): Promise<AgenticRunResponse> {
    logger.info(`Agentic task: ${request.task_type}`);

    const response = await this.request<AgenticRunResponse>('/agentic/run', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    logger.info(`Agentic task completed in ${response.latency_ms}ms`);

    return response;
  }

  /**
   * Classify an @ai prompt into an agentic task using embeddings
   */
  async classifyAgenticIntent(request: IntentClassifyRequest): Promise<IntentClassifyResponse> {
    validateAiTrigger(request.prompt, 'prompt');

    const response = await this.request<IntentClassifyResponse>('/agentic/classify-intent', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    return response;
  }

  /**
   * Get AI-powered recommendations for a group
   * Note: This endpoint may not be implemented in AI service - fallback logic handles this
   */
  async getRecommendations(request: RecommendationsRequest): Promise<RecommendationsResponse> {
    logger.info(`Getting recommendations for group: ${request.group_id}`);

    // AI service doesn't have this endpoint yet - throw to trigger fallback
    throw new Error('AI recommendations endpoint not implemented');
  }

  /**
   * Generate group report
   */
  async generateReport(request: GenerateReportRequest): Promise<ReportResponse> {
    if (request.prompt) {
      validateAiTrigger(request.prompt);
    }

    logger.info(`Generating report for group: ${request.group_id}`);

    const response = await this.request<ReportResponse>(
      `/reports/group/${request.group_id}/generate`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    logger.info(`Report generated: ${response.filename} (${response.file_size} bytes)`);

    return response;
  }

  /**
   * Process an @ai message and return the AI response
   */
  async processAtAiMessage(
    content: string,
    sessionId: string,
    userId: string,
    groupId?: string
  ): Promise<GroupAIChatResponse | ChatResponse | AgenticChatResponse | null> {
    // Check if message contains @ai
    const trimmed = content.trim();
    if (!trimmed.toLowerCase().includes('@ai')) {
      return null;
    }

    // If groupId is provided, classify intent and route
    if (groupId) {
      try {
        const intent = await this.classifyAgenticIntent({ prompt: content });
        if (intent.task_type === 'deep_research') {
          const response = await this.runAgenticTask({
            task_type: 'deep_research',
            prompt: content,
            group_id: groupId,
            user_id: userId,
            session_id: sessionId,
            options: {
              intent_similarity: intent.similarity,
              intent_threshold: intent.threshold,
              matched_phrase: intent.matched_phrase,
            },
          });

          const deepResearch =
            (response.result?.deep_research as string | undefined) ||
            (response.result?.report as string | undefined) ||
            JSON.stringify(response.result || {}, null, 2);

          const artifacts = response.artifacts?.length
            ? `\n\n**Artifacts**\n${response.artifacts.map((artifactId) => `- ${artifactId}`).join('\n')}`
            : '';

          const text = `### Deep Research Report\n\n${deepResearch}${artifacts}\n\n_Completed in ${response.latency_ms}ms_`;

          return {
            id: `agentic-${Date.now()}`,
            text,
            sources: [],
            latency_ms: response.latency_ms,
            metadata: {
              task_type: response.task_type,
              artifacts: response.artifacts,
              model: 'groq',
              intent_similarity: intent.similarity,
              intent_threshold: intent.threshold,
              matched_phrase: intent.matched_phrase,
            },
          };
        }
      } catch (error) {
        logger.warn(`Intent classification failed, falling back to group chat: ${String(error)}`);
      }

      return this.groupAIChat({
        prompt: content,
        group_id: groupId,
        session_id: sessionId,
        user_id: userId,
      });
    }

    // Fallback to legacy chat
    const question = trimmed.replace(/@ai/gi, '').trim();

    if (!question) {
      throw new Error('Please provide a question after @ai');
    }

    return this.chat({
      question,
      session_id: sessionId,
      user_id: userId,
      include_papers: true,
      max_context_messages: 30,
    });
  }
}

// Export singleton instance
export const aiClient = new AIClient();

// Export class for testing
export { AIClient };
