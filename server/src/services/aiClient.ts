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
import { getEnv } from '../config/env.js';
import { getCorrelationId } from '../middleware/correlationId.js';

function getAiServiceUrl(): string {
  return getEnv().AI_SERVICE_URL;
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
  llm_configured: boolean;
  database_connected: boolean;
  vector_store_connected: boolean;
  timestamp: string;
}

export interface AIServiceError {
  detail: string;
}

export function validateAiTrigger(content: string, fieldName: string = 'prompt'): void {
  if (!content || !content.toLowerCase().includes('@ai')) {
    throw new Error(`${fieldName} must contain @ai trigger. AI only responds when triggered by @ai.`);
  }
}

// Per-call timeouts: quick calls (health, vector search) vs LLM-backed calls
// (chat, Q&A, summaries, reports) which can legitimately take a while.
const QUICK_TIMEOUT_MS = 15_000;
const LLM_TIMEOUT_MS = 120_000;

/**
 * AI Service Client class
 */
class AIClient {
  private get baseUrl(): string {
    return getAiServiceUrl();
  }

  private buildHeaders(extra?: RequestInit['headers']): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(extra as Record<string, string> | undefined),
    };
    const correlationId = getCorrelationId();
    if (correlationId) {
      headers['X-Correlation-Id'] = correlationId;
    }
    return headers;
  }

  /**
   * Make a request to the AI service
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = LLM_TIMEOUT_MS
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: this.buildHeaders(options.headers),
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
    return this.request<HealthResponse>('/health', {}, QUICK_TIMEOUT_MS);
  }

  /**
   * Check if AI service is available and configured
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.health();
      return health.status === 'healthy' && health.llm_configured;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`AI service not available: ${errorMessage}`);
      return false;
    }
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
   * Stream Group AI Chat tokens via NDJSON
   * Yields objects: { token: string } or { done: true, latency_ms, sources, ... }
   */
  async *groupAIChatStream(
    request: GroupAIChatRequest
  ): AsyncGenerator<{ token?: string; done?: boolean; latency_ms?: number; sources?: Array<{ id: string; type: string; similarity?: number }>; model?: string; error?: string }> {
    logger.info(`Group AI chat stream for group: ${request.group_id}, session: ${request.session_id || 'none'}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}/groups/${request.group_id}/ai-chat/stream`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Request failed' })) as { detail?: string };
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
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            yield data;
          } catch {
            // Ignore malformed chunks
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          yield JSON.parse(buffer);
        } catch {
          // Ignore
        }
      }

      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
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
    }, QUICK_TIMEOUT_MS);

    logger.info(`Vector search returned ${response.total} results in ${response.latency_ms}ms`);

    return response;
  }

  /**
   * Generate a group activity report (PDF)
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
  ): Promise<GroupAIChatResponse | null> {
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
