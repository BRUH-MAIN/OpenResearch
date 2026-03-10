'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, CardHeader, Badge, Input } from '@/components/ui';
import {
  Search,
  Loader2,
  BookOpen,
  ExternalLink,
  Plus,
  Users,
  Filter,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Paper, PaperRecommendation, Group } from '@/lib/api';
import { toast } from '@/lib/toast';
import Link from 'next/link';

export default function DiscoverPage() {
  const { accessToken } = useAuthStore();
  const [groupRecommendations, setGroupRecommendations] = useState<PaperRecommendation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken) {
      loadGroups();
    }
  }, [accessToken]);

  useEffect(() => {
    if (selectedGroupId) {
      loadGroupRecommendations(selectedGroupId);
    }
  }, [selectedGroupId]);

  const loadGroups = async () => {
    if (!accessToken) return;
    try {
      const groupsData = await api.getGroups(accessToken);
      setGroups(groupsData);
      if (groupsData.length > 0 && !selectedGroupId) {
        setSelectedGroupId(groupsData[0].id);
      }
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  };

  const loadGroupRecommendations = async (groupId: string) => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const response = await api.getRecommendationsForGroup(accessToken, groupId, 20);
      setGroupRecommendations(response.recommendations);
    } catch (err) {
      toast.error('Failed to load group recommendations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToGroup = async (paperId: string, groupId: string) => {
    if (!accessToken) return;
    try {
      setAddingToGroup(paperId);
      await api.addPaperToGroup(accessToken, groupId, paperId);
      toast.success('Paper added to group');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add paper');
    } finally {
      setAddingToGroup(null);
    }
  };

  const filteredPapers = (papers: (Paper & { score?: number; reason?: string })[]) => {
    if (!searchQuery.trim()) return papers;
    const query = searchQuery.toLowerCase();
    return papers.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        p.abstract.toLowerCase().includes(query) ||
        p.authors.some((a) => a.toLowerCase().includes(query)) ||
        p.tags?.some((t) => t.toLowerCase().includes(query))
    );
  };

  const currentPapers = filteredPapers(groupRecommendations);

  if (!accessToken) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Sign in to discover papers</h1>
          <Link href="/auth/signin">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#0D7377]/20">
              <Sparkles className="w-7 h-7 text-[#14FFEC]" />
            </div>
            Discover Papers
          </h1>
          <p className="text-[var(--color-text-secondary)]">
            Find relevant research papers recommended by AI based on your interests and group context
          </p>
        </div>

        {/* Group Selector */}
        <div className="mb-6 flex gap-4 items-center">
          <Users className="w-5 h-5 text-[#14FFEC]" />
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-primary)] rounded-xl px-4 py-2.5 focus:border-[#14FFEC] focus:ring-2 focus:ring-[#14FFEC]/20 focus:outline-none transition-all hover:border-[var(--color-border-hover)]"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
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
              className="w-full pl-12 pr-4 py-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-[#14FFEC] focus:ring-2 focus:ring-[#14FFEC]/20 focus:outline-none transition-all hover:border-[var(--color-border-hover)]"
            />
          </div>
        </div>

        {/* Papers Grid */}
        {isLoading ? (
          <div className="flex flex-col justify-center items-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-[#14FFEC] mb-4" />
            <p className="text-[var(--color-text-secondary)] text-sm">Loading papers...</p>
          </div>
        ) : currentPapers.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] flex items-center justify-center mb-6">
              <BookOpen className="w-8 h-8 text-[var(--color-text-tertiary)]" />
            </div>
            <h3 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
              {searchQuery ? 'No papers found' : 'No recommendations yet'}
            </h3>
            <p className="text-[var(--color-text-secondary)] text-center max-w-sm">
              {searchQuery ? 'Try adjusting your search query' : 'Check back later for personalized recommendations'}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {currentPapers.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                groups={groups}
                onAddToGroup={handleAddToGroup}
                isAdding={addingToGroup === paper.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface PaperCardProps {
  paper: Paper & { score?: number; reason?: string; trendScore?: number; groupCount?: number };
  groups: Group[];
  onAddToGroup: (paperId: string, groupId: string) => void;
  isAdding: boolean;
}

function PaperCard({ paper, groups, onAddToGroup, isAdding }: PaperCardProps) {
  const [showGroupMenu, setShowGroupMenu] = useState(false);

  return (
    <Card hover>
      <CardHeader>
        <div className="flex justify-between items-start gap-2">
          <h3 className="font-semibold text-[var(--color-text-primary)] line-clamp-2">{paper.title}</h3>
          {(paper.score || paper.trendScore) && (
            <Badge variant="primary" className="shrink-0">
              {Math.round((paper.score || paper.trendScore || 0) * 100)}%
            </Badge>
          )}
        </div>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{paper.authors.slice(0, 3).join(', ')}</p>
      </CardHeader>
      <CardBody className="pt-0">
        <p className="text-sm text-[var(--color-text-secondary)] line-clamp-3 mb-3">{paper.abstract}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {paper.tags?.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="outline" size="sm">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Reason - AI recommendation */}
        {paper.reason && (
          <div className="bg-[#0D7377]/10 border border-[#0D7377]/30 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-[#14FFEC] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              {paper.reason}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
          {paper.url && (
            <a href={paper.url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline">
                <ExternalLink className="w-3 h-3 mr-1" />
                View
              </Button>
            </a>
          )}

          <div className="relative">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowGroupMenu(!showGroupMenu)}
              disabled={isAdding || groups.length === 0}
            >
              {isAdding ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Plus className="w-3 h-3 mr-1" />
              )}
              Add to Group
            </Button>

            {showGroupMenu && (
              <div className="absolute bottom-full left-0 mb-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-xl shadow-xl py-2 min-w-[150px] z-10">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => {
                      onAddToGroup(paper.id, group.id);
                      setShowGroupMenu(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
