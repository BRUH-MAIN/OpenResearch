'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, CardHeader, Badge, Input } from '@/components/ui';
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
  X,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, GroupPaper, Group } from '@/lib/api';
import { toast } from '@/lib/toast';

function GroupPapersPageContent() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get('groupId');
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

  const handleSummarize = async () => {
    if (!accessToken || !groupId || !selectedPaper) return;

    try {
      setIsAsking(true);
      setQaResponse(null);
      const response = await api.summarizePaper(accessToken, groupId, selectedPaper.paperId);
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
      // Auto-trigger summarization
      setTimeout(() => {
        if (mode === 'summarize') {
          handleSummarize();
        }
      }, 100);
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
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar />
        <div className="container mx-auto px-4 py-16 text-center">
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
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar />
        <div className="container mx-auto px-4 py-16 text-center">
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
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar />
        <div className="flex justify-center items-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href={`/group?id=${groupId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Group
              </Button>
            </Link>
            <div className="h-6 w-px bg-gray-700" />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-purple-400" />
                {group?.name} Papers
              </h1>
              <p className="text-sm text-gray-400">
                {papers.length} paper{papers.length !== 1 ? 's' : ''} • Ask questions or get summaries
              </p>
            </div>
          </div>
          <Link href="/discover">
            <Button className="gap-2">
              <Sparkles className="w-4 h-4" />
              Discover Papers
            </Button>
          </Link>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Papers List */}
        {filteredPapers.length === 0 ? (
          <Card className="bg-gray-800 border-gray-700">
            <CardBody className="py-16 text-center">
              <BookOpen className="w-16 h-16 mx-auto text-gray-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                {searchQuery ? 'No papers match your search' : 'No papers in this group yet'}
              </h3>
              <p className="text-gray-400 mb-6">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Add papers from the Discover page to start collaborating'}
              </p>
              {!searchQuery && (
                <Link href="/discover">
                  <Button className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Discover Papers
                  </Button>
                </Link>
              )}
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredPapers.map((paper) => (
              <Card key={paper.id} className="bg-gray-800 border-gray-700">
                <CardBody>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-white text-lg mb-1">{paper.title}</h3>
                      <p className="text-sm text-gray-400 mb-2">
                        {paper.authors?.slice(0, 3).join(', ')}
                        {paper.authors?.length > 3 && ` +${paper.authors.length - 3} more`}
                      </p>
                      <p className="text-sm text-gray-300 line-clamp-2 mb-3">{paper.abstract}</p>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {paper.tags?.slice(0, 5).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>

                      {/* Notes */}
                      {paper.notes && (
                        <p className="text-xs text-purple-400 italic mb-3">
                          Note: {paper.notes}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openQaModal(paper, 'question')}
                          className="gap-1"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Ask @ai
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openQaModal(paper, 'summarize')}
                          className="gap-1"
                        >
                          <FileText className="w-3 h-3" />
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
                          className="text-red-400 hover:text-red-300 hover:bg-red-400/10 ml-auto"
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
        {selectedPaper && qaMode && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <Card className="bg-gray-800 border-gray-700 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      {qaMode === 'question' ? (
                        <>
                          <MessageSquare className="w-5 h-5 text-purple-400" />
                          Ask a Question
                        </>
                      ) : (
                        <>
                          <FileText className="w-5 h-5 text-purple-400" />
                          Paper Summary
                        </>
                      )}
                    </h2>
                    <p className="text-sm text-gray-400 line-clamp-1">
                      {selectedPaper.title}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={closeQaModal}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="overflow-y-auto flex-1">
                {/* Question Input (for question mode) */}
                {qaMode === 'question' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Your Question <span className="text-gray-500">(will be sent with @ai trigger)</span>
                    </label>
                    <div className="flex gap-2">
                      <Input
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
                      />
                      <Button
                        onClick={handleAskQuestion}
                        disabled={isAsking || !question.trim()}
                        className="gap-1"
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
                    <div className="flex items-center gap-3 text-purple-400">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span>{qaMode === 'question' ? 'Thinking...' : 'Generating summary...'}</span>
                    </div>
                  </div>
                )}

                {/* Response */}
                {qaResponse && (
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-medium text-purple-400">AI Response</span>
                    </div>

                    {qaResponse.answer && (
                      <p className="text-gray-200 whitespace-pre-wrap">{qaResponse.answer}</p>
                    )}

                    {qaResponse.summary && (
                      <div>
                        <p className="text-gray-200 whitespace-pre-wrap mb-4">{qaResponse.summary}</p>
                        {qaResponse.keyPoints && qaResponse.keyPoints.length > 0 && (
                          <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-300 mb-2">Key Points:</h4>
                            <ul className="list-disc list-inside space-y-1">
                              {qaResponse.keyPoints.map((point, i) => (
                                <li key={i} className="text-sm text-gray-300">
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
                    <p className="text-sm text-gray-400 mb-3">Suggested questions:</p>
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
                          className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded-full hover:bg-gray-600"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GroupPapersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      }
    >
      <GroupPapersPageContent />
    </Suspense>
  );
}
