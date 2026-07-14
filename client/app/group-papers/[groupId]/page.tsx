'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, CardHeader, Badge, Input, Modal } from '@/components/ui';
import {
  BookOpen,
  Search,
  Loader2,
  ArrowLeft,
  MessageSquare,
  FileText,
  Trash2,
  Send,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, GroupPaper, Group } from '@/lib/api';
import { toast } from '@/lib/toast';

function GroupPapersPageContent() {
  const params = useParams();
  const groupId = params.groupId as string;
  const { accessToken } = useAuthStore();

  const [group, setGroup] = useState<(Group & { memberCount: number; userRole: string }) | null>(null);
  const [papers, setPapers] = useState<GroupPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [removingPaper, setRemovingPaper] = useState<string | null>(null);

  // Q&A State
  const [selectedPaper, setSelectedPaper] = useState<GroupPaper | null>(null);
  const [qaMode, setQaMode] = useState<'question' | 'summarize' | null>(null);
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [qaResponse, setQaResponse] = useState<{ answer?: string; summary?: string; keyPoints?: string[] } | null>(null);

  useEffect(() => {
    if (accessToken && groupId) {
      loadData();
    }
  }, [accessToken, groupId]);

  const loadData = async () => {
    if (!accessToken || !groupId) return;
    try {
      setIsLoading(true);
      const [groupData, papersData] = await Promise.all([
        api.getGroup(accessToken, groupId),
        api.getGroupPapers(accessToken, groupId),
      ]);
      setGroup(groupData);
      setPapers(papersData);
    } catch (err) {
      toast.error('Failed to load papers');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemovePaper = async (paperId: string) => {
    if (!accessToken || !groupId) return;
    try {
      setRemovingPaper(paperId);
      await api.removePaperFromGroup(accessToken, groupId, paperId);
      setPapers((prev) => prev.filter((p) => p.paperId !== paperId));
      toast.success('Paper removed from group');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove paper');
    } finally {
      setRemovingPaper(null);
    }
  };

  const handleAskQuestion = async () => {
    if (!accessToken || !groupId || !selectedPaper || !question.trim()) return;

    // Ensure @ai trigger is present
    let questionWithTrigger = question.trim();
    if (!questionWithTrigger.toLowerCase().includes('@ai')) {
      questionWithTrigger = `@ai ${questionWithTrigger}`;
    }

    try {
      setIsAsking(true);
      setQaResponse(null);
      const response = await api.askPaperQuestion(
        accessToken,
        groupId,
        selectedPaper.paperId,
        questionWithTrigger
      );
      setQaResponse({ answer: response.answer });
      setQuestion('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get answer');
    } finally {
      setIsAsking(false);
    }
  };

  const handleSummarize = async (paperIdParam?: string) => {
    const targetPaperId = paperIdParam || selectedPaper?.paperId;
    if (!accessToken || !groupId || !targetPaperId) return;

    try {
      setIsAsking(true);
      setQaResponse(null);
      const response = await api.summarizePaper(accessToken, groupId, targetPaperId);
      setQaResponse({
        summary: response.summary,
        keyPoints: response.key_points
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setIsAsking(false);
    }
  };

  const openQaModal = (paper: GroupPaper, mode: 'question' | 'summarize') => {
    setSelectedPaper(paper);
    setQaMode(mode);
    setQaResponse(null);
    setQuestion('');
    if (mode === 'summarize') {
      handleSummarize(paper.paperId);
    }
  };

  const closeQaModal = () => {
    setSelectedPaper(null);
    setQaMode(null);
    setQaResponse(null);
    setQuestion('');
  };

  const filteredPapers = papers.filter((paper) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      paper.title.toLowerCase().includes(query) ||
      paper.abstract?.toLowerCase().includes(query) ||
      paper.authors?.some((a) => a.toLowerCase().includes(query)) ||
      paper.tags?.some((t) => t.toLowerCase().includes(query))
    );
  });

  if (!accessToken) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Sign in to view group papers</h1>
          <Link href="/auth/signin">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!groupId) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">No group selected</h1>
          <Link href="/home">
            <Button>Go to Groups</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <Navbar />
        <div className="flex flex-col justify-center items-center h-[60vh]">
          <Loader2 className="w-10 h-10 animate-spin text-[var(--color-accent-primary)] mb-4" />
          <p className="text-[var(--color-text-secondary)] text-sm">Loading papers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <Link href={`/group/${groupId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Group
              </Button>
            </Link>
            <div className="h-6 w-px bg-[var(--color-border-primary)]" />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-[var(--color-accent-primary)]" />
                {group?.name} Papers
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {papers.length} paper{papers.length !== 1 ? 's' : ''} • Ask questions or get summaries
              </p>
            </div>
          </div>
          <Link href="/paper">
            <Button>
              <Sparkles className="w-4 h-4 mr-2" />
              Discover Papers
            </Button>
          </Link>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[var(--color-text-tertiary)] w-5 h-5" />
            <input
              type="text"
              placeholder="Search papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-[var(--color-brand-secondary)] focus:ring-2 focus:ring-[var(--color-brand-secondary)]/20 focus:outline-none transition-all hover:border-[var(--color-border-hover)]"
            />
          </div>
        </div>

        {/* Papers List */}
        {filteredPapers.length === 0 ? (
          <Card>
            <CardBody className="py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] flex items-center justify-center mx-auto mb-6">
                <BookOpen className="w-8 h-8 text-[var(--color-text-tertiary)]" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-[var(--color-text-primary)]">
                {searchQuery ? 'No papers match your search' : 'No papers in this group yet'}
              </h3>
              <p className="text-[var(--color-text-secondary)] mb-6 max-w-sm mx-auto">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Add papers from the Discover page to start collaborating'}
              </p>
              {!searchQuery && (
                <Link href="/paper">
                  <Button>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Discover Papers
                  </Button>
                </Link>
              )}
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredPapers.map((paper) => (
              <Card key={paper.id}>
                <CardBody>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-[var(--color-text-primary)] text-lg mb-1">{paper.title}</h3>
                      <p className="text-sm text-[var(--color-text-secondary)] mb-2">
                        {paper.authors?.slice(0, 3).join(', ')}
                        {paper.authors?.length > 3 && ` +${paper.authors.length - 3} more`}
                      </p>
                      <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2 mb-3">{paper.abstract}</p>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {paper.tags?.slice(0, 5).map((tag) => (
                          <Badge key={tag} variant="outline" size="sm">
                            {tag}
                          </Badge>
                        ))}
                      </div>

                      {/* Notes */}
                      {paper.notes && (
                        <div className="bg-[var(--color-accent-primary)]/10 border border-[var(--color-accent-primary)]/30 rounded-lg px-3 py-2 mb-3">
                          <p className="text-xs text-[var(--color-accent-primary)] italic">
                            Note: {paper.notes}
                          </p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openQaModal(paper, 'question')}
                        >
                          <MessageSquare className="w-3 h-3 mr-1" />
                          Ask @ai
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openQaModal(paper, 'summarize')}
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          Summarize
                        </Button>
                        {paper.url && (
                          <a href={paper.url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline">
                              View Paper
                            </Button>
                          </a>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemovePaper(paper.paperId)}
                          disabled={removingPaper === paper.paperId}
                          className="text-[#ef4444] hover:text-[#f87171] hover:bg-[#ef4444]/10 ml-auto"
                        >
                          {removingPaper === paper.paperId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* Q&A Modal */}
        <Modal
          isOpen={!!selectedPaper && !!qaMode}
          onClose={closeQaModal}
          title={qaMode === 'question' ? 'Ask a Question' : 'Paper Summary'}
          size="xl"
          className="max-w-3xl"
          bodyClassName="space-y-5 max-h-[70dvh]"
        >
          {selectedPaper && qaMode && (
            <>
              <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2">
                {selectedPaper.title}
              </p>

                {/* Question Input (for question mode) */}
                {qaMode === 'question' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                      Your Question <span className="text-[var(--color-text-tertiary)]">(will be sent with @ai trigger)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="e.g., What are the main findings?"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAskQuestion();
                          }
                        }}
                        disabled={isAsking}
                        className="flex-1 px-4 py-2.5 bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] rounded-xl text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-[var(--color-brand-secondary)] focus:ring-2 focus:ring-[var(--color-brand-secondary)]/20 focus:outline-none transition-all hover:border-[var(--color-border-hover)] disabled:opacity-50"
                      />
                      <Button
                        onClick={handleAskQuestion}
                        disabled={isAsking || !question.trim()}
                      >
                        {isAsking ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Loading State */}
                {isAsking && (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-3 text-[var(--color-accent-primary)]">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span>{qaMode === 'question' ? 'AI is analyzing...' : 'Generating summary...'}</span>
                    </div>
                  </div>
                )}

                {/* Response - AI styled */}
                {qaResponse && (
                  <div className="bg-gradient-to-br from-[var(--color-brand-primary)]/10 to-[var(--color-brand-secondary)]/5 border border-[var(--color-brand-primary)]/30 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1.5 rounded-lg bg-[var(--color-brand-primary)]/20">
                        <Sparkles className="w-4 h-4 text-[var(--color-brand-secondary)]" />
                      </div>
                      <span className="text-sm font-medium text-[var(--color-brand-secondary)]">AI Response</span>
                    </div>

                    {qaResponse.answer && (
                      <p className="text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">{qaResponse.answer}</p>
                    )}

                    {qaResponse.summary && (
                      <div>
                        <p className="text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed mb-4">{qaResponse.summary}</p>
                        {qaResponse.keyPoints && qaResponse.keyPoints.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-[var(--color-brand-primary)]/30">
                            <h4 className="text-sm font-medium text-[var(--color-brand-secondary)] mb-3">Key Points:</h4>
                            <ul className="space-y-2">
                              {qaResponse.keyPoints.map((point, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
                                  <span className="text-[var(--color-brand-secondary)] mt-1">•</span>
                                  {point}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Suggested Questions (for question mode) */}
                {qaMode === 'question' && !qaResponse && !isAsking && (
                  <div className="mt-4">
                    <p className="text-sm text-[var(--color-text-secondary)] mb-3">Suggested questions:</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        'What are the main findings?',
                        'What methodology was used?',
                        'What are the limitations?',
                        'How does this relate to other work?',
                      ].map((q) => (
                        <button
                          key={q}
                          onClick={() => setQuestion(q)}
                          className="px-3 py-1.5 text-sm bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] rounded-full hover:bg-[var(--color-bg-hover)] hover:text-white transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </>
          )}
        </Modal>
      </div>
    </div>
  );
}

export default function GroupPapersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-[var(--color-accent-primary)] mb-4" />
          <p className="text-[var(--color-text-secondary)] text-sm">Loading...</p>
        </div>
      }
    >
      <GroupPapersPageContent />
    </Suspense>
  );
}
