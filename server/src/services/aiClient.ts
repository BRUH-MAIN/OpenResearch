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

  constructor(timeout: number = 30000) {
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
  ): Promise<GroupAIChatResponse | ChatResponse | null> {
    // Check if message contains @ai
    const trimmed = content.trim();
    if (!trimmed.toLowerCase().includes('@ai')) {
      return null;
    }

    // If groupId is provided, use group AI chat (with RAG)
    if (groupId) {
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
