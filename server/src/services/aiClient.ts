/**
 * AI Service Client
 * 
 * HTTP client for communicating with the FastAPI AI service.
 * Handles chat Q&A, summarization, and health checks.
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
      return health.status === 'healthy' && health.gemini_configured;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`AI service not available: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Chat Q&A with session context
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
   * Summarize a session
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
   * Process an @ai message and return the AI response
   */
  async processAtAiMessage(
    content: string,
    sessionId: string,
    userId: string
  ): Promise<ChatResponse | null> {
    // Check if message starts with @ai
    const trimmed = content.trim();
    if (!trimmed.toLowerCase().startsWith('@ai')) {
      return null;
    }

    // Extract the question (remove @ai prefix)
    const question = trimmed.slice(3).trim();
    
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
