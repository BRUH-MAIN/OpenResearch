'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, CardHeader, Badge } from '@/components/ui';
import { Search, BookMarked, ExternalLink, Calendar, Quote, Loader2, BookmarkCheck, Globe, Download } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Paper, ExternalPaper } from '@/lib/api';
import { toast } from '@/lib/toast';

interface SavedPaper extends Paper {
  savedAt: string;
  notes?: string;
}

type SearchSource = 'local' | 'semantic_scholar' | 'arxiv' | 'all';

export default function PaperPage() {
  const { accessToken } = useAuthStore();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [savedPapers, setSavedPapers] = useState<SavedPaper[]>([]);
  const [savedPaperIds, setSavedPaperIds] = useState<Set<string>>(new Set());
  const [externalResults, setExternalResults] = useState<ExternalPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [savingPaperId, setSavingPaperId] = useState<string | null>(null);
  const [importingPaperId, setImportingPaperId] = useState<string | null>(null);
  const [searchSource, setSearchSource] = useState<SearchSource>('local');
  
  // Fetch papers
  useEffect(() => {
    async function fetchPapers() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        setError(null);
        const [allPapers, userSavedPapers] = await Promise.all([
          api.getPapers(accessToken),
          api.getSavedPapers(accessToken),
        ]);
        setPapers(allPapers);
        setSavedPapers(userSavedPapers);
        setSavedPaperIds(new Set(userSavedPapers.map(p => p.id)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load papers');
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchPapers();
  }, [accessToken]);

  const displayPapers = showSaved ? savedPapers : papers;
  
  // Extract all unique tags
  const allTags = Array.from(
    new Set(papers.flatMap(paper => paper.tags || []))
  ).sort();
  
  // Filter papers
  const filteredPapers = displayPapers.filter(paper => {
    const matchesSearch = 
      paper.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      paper.abstract.toLowerCase().includes(searchQuery.toLowerCase()) ||
      paper.authors.some(author => author.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesTag = !selectedTag || (paper.tags || []).includes(selectedTag);
    
    return matchesSearch && matchesTag;
  });

  const handleSavePaper = async (paperId: string) => {
    if (!accessToken) return;
    
    try {
      setSavingPaperId(paperId);
      if (savedPaperIds.has(paperId)) {
        await api.unsavePaper(accessToken, paperId);
        setSavedPaperIds(prev => {
          const next = new Set(prev);
          next.delete(paperId);
          return next;
        });
        setSavedPapers(prev => prev.filter(p => p.id !== paperId));
        toast.info('Paper removed from saved');
      } else {
        await api.savePaper(accessToken, paperId);
        const paper = papers.find(p => p.id === paperId);
        if (paper) {
          setSavedPaperIds(prev => new Set(prev).add(paperId));
          setSavedPapers(prev => [...prev, { ...paper, savedAt: new Date().toISOString() }]);
        }
        toast.success('Paper saved successfully!');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save paper';
      setError(message);
      toast.error(message);
    } finally {
      setSavingPaperId(null);
    }
  };

  // Search external APIs
  const handleExternalSearch = async () => {
    if (!accessToken || !searchQuery.trim() || searchSource === 'local') return;
    
    try {
      setIsSearching(true);
      setError(null);
      const source = searchSource === 'all' ? 'all' : searchSource;
      const results = await api.searchExternalPapers(accessToken, searchQuery, source as 'all' | 'semantic_scholar' | 'arxiv');
      setExternalResults(results);
      if (results.length === 0) {
        toast.info('No papers found for this query');
      } else {
        toast.success(`Found ${results.length} papers`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      toast.error(message);
    } finally {
      setIsSearching(false);
    }
  };

  // Import paper from external source
  const handleImportPaper = async (paper: ExternalPaper) => {
    if (!accessToken) return;
    
    try {
      setImportingPaperId(paper.id);
      const imported = await api.importPaper(accessToken, paper);
      if (imported.alreadyExists) {
        toast.info('Paper already exists in library');
      } else {
        setPapers(prev => [imported, ...prev]);
        toast.success('Paper imported to library!');
      }
      // Also save it
      if (!savedPaperIds.has(imported.id)) {
        await api.savePaper(accessToken, imported.id);
        setSavedPaperIds(prev => new Set(prev).add(imported.id));
        setSavedPapers(prev => [...prev, { ...imported, savedAt: new Date().toISOString() }]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import paper');
    } finally {
      setImportingPaperId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#212121]">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Explore Papers</h1>
            <p className="text-gray-400 mt-1">Discover and save research papers</p>
          </div>
          <div className="flex space-x-2">
            <Button
              variant={showSaved ? 'ghost' : 'primary'}
              onClick={() => setShowSaved(false)}
            >
              All Papers
            </Button>
            <Button
              variant={showSaved ? 'primary' : 'ghost'}
              onClick={() => setShowSaved(true)}
            >
              <BookMarked size={18} className="mr-2" />
              Saved ({savedPapers.length})
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={20} />
              <input
                type="text"
                placeholder="Search papers by title, author, or content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchSource !== 'local' && handleExternalSearch()}
                className="w-full pl-10 pr-4 py-3 border border-[#0D7377] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14FFEC] bg-[#323232] text-white"
              />
            </div>
            {searchSource !== 'local' && (
              <Button onClick={handleExternalSearch} disabled={isSearching || !searchQuery.trim()}>
                {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Globe size={18} />}
                <span className="ml-2">Search</span>
              </Button>
            )}
          </div>
        </div>

        {/* Search Source Selector */}
        <div className="mb-6 flex flex-wrap gap-2 items-center">
          <span className="text-sm text-gray-400 mr-2">Search in:</span>
          <Button
            size="sm"
            variant={searchSource === 'local' ? 'primary' : 'ghost'}
            onClick={() => { setSearchSource('local'); setExternalResults([]); }}
          >
            Library
          </Button>
          <Button
            size="sm"
            variant={searchSource === 'all' ? 'primary' : 'ghost'}
            onClick={() => setSearchSource('all')}
          >
            <Globe size={14} className="mr-1" />
            All External
          </Button>
          <Button
            size="sm"
            variant={searchSource === 'semantic_scholar' ? 'primary' : 'ghost'}
            onClick={() => setSearchSource('semantic_scholar')}
          >
            Semantic Scholar
          </Button>
          <Button
            size="sm"
            variant={searchSource === 'arxiv' ? 'primary' : 'ghost'}
            onClick={() => setSearchSource('arxiv')}
          >
            arXiv
          </Button>
        </div>

        {/* Tag Filter */}
        <div className="mb-6 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={selectedTag === null ? 'primary' : 'ghost'}
            onClick={() => setSelectedTag(null)}
          >
            All Tags
          </Button>
          {allTags.map(tag => (
            <Button
              key={tag}
              size="sm"
              variant={selectedTag === tag ? 'primary' : 'outline'}
              onClick={() => setSelectedTag(tag)}
            >
              {tag}
            </Button>
          ))}
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
            <p className="text-gray-400">Loading papers...</p>
          </div>
        ) : (
          <>
            {/* External Search Results */}
            {searchSource !== 'local' && externalResults.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                  <Globe size={20} className="mr-2 text-[#14FFEC]" />
                  External Results ({externalResults.length})
                </h2>
                <div className="space-y-4">
                  {externalResults.map((paper) => (
                    <Card key={paper.id} className="border-[#14FFEC]/30">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div className="flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={paper.source === 'arxiv' ? 'warning' : 'primary'}>
                                {paper.source === 'arxiv' ? 'arXiv' : 'Semantic Scholar'}
                              </Badge>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">
                              {paper.title}
                            </h3>
                            <p className="text-sm text-gray-400 mb-2">
                              {paper.authors.slice(0, 5).join(', ')}{paper.authors.length > 5 ? ` +${paper.authors.length - 5} more` : ''}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                              {paper.publishedDate && (
                                <div className="flex items-center">
                                  <Calendar size={14} className="mr-1" />
                                  {paper.publishedDate}
                                </div>
                              )}
                              {paper.citations !== undefined && paper.citations > 0 && (
                                <div className="flex items-center">
                                  <Quote size={14} className="mr-1" />
                                  {paper.citations.toLocaleString()} citations
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col space-y-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(paper.url, '_blank')}
                            >
                              <ExternalLink size={14} className="mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleImportPaper(paper)}
                              disabled={importingPaperId === paper.id}
                            >
                              {importingPaperId === paper.id ? (
                                <Loader2 size={14} className="mr-1 animate-spin" />
                              ) : (
                                <Download size={14} className="mr-1" />
                              )}
                              Import
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardBody>
                        <p className="text-gray-400 text-sm line-clamp-3">{paper.abstract}</p>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Local Papers */}
            {searchSource === 'local' && (
              <>
                {filteredPapers.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-24 h-24 bg-[#323232] rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search size={40} className="text-gray-500" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">No papers found</h3>
                    <p className="text-gray-400">Try adjusting your search or filters, or search external sources</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {filteredPapers.map((paper) => (
                      <Card key={paper.id}>
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div className="flex-1 pr-4">
                              <h3 className="text-xl font-bold text-white mb-2">
                                {paper.title}
                              </h3>
                              <p className="text-sm text-gray-400 mb-2">
                                {paper.authors.join(', ')}
                              </p>
                              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                                {paper.publishedDate && (
                                  <div className="flex items-center">
                                    <Calendar size={16} className="mr-1" />
                                    {paper.publishedDate}
                                  </div>
                                )}
                                {paper.citations && (
                                  <div className="flex items-center">
                                    <Quote size={16} className="mr-1" />
                                    {paper.citations.toLocaleString()} citations
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col space-y-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(paper.url, '_blank')}
                              >
                                <ExternalLink size={16} className="mr-2" />
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant={savedPaperIds.has(paper.id) ? 'secondary' : 'primary'}
                                onClick={() => handleSavePaper(paper.id)}
                                disabled={savingPaperId === paper.id}
                              >
                                {savingPaperId === paper.id ? (
                                  <Loader2 size={16} className="mr-2 animate-spin" />
                                ) : savedPaperIds.has(paper.id) ? (
                                  <BookmarkCheck size={16} className="mr-2" />
                                ) : (
                                  <BookMarked size={16} className="mr-2" />
                                )}
                                {savedPaperIds.has(paper.id) ? 'Saved' : 'Save'}
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardBody>
                          <p className="text-gray-300 mb-4">{paper.abstract}</p>
                          <div className="flex flex-wrap gap-2">
                            {(paper.tags || []).map(tag => (
                              <Badge key={tag} variant="primary">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}