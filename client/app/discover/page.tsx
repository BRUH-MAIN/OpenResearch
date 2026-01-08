'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, CardHeader, Badge, Input } from '@/components/ui';
import {
  Search,
  Loader2,
  TrendingUp,
  Sparkles,
  BookOpen,
  ExternalLink,
  Plus,
  Users,
  Filter,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Paper, PaperRecommendation, Group } from '@/lib/api';
import { toast } from '@/lib/toast';
import Link from 'next/link';

export default function DiscoverPage() {
  const { accessToken } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'trending' | 'forYou' | 'forGroup'>('trending');
  const [trendingPapers, setTrendingPapers] = useState<Array<Paper & { trendScore: number; groupCount?: number; reason: string }>>([]);
  const [personalRecommendations, setPersonalRecommendations] = useState<PaperRecommendation[]>([]);
  const [groupRecommendations, setGroupRecommendations] = useState<PaperRecommendation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken) {
      loadTrending();
      loadGroups();
    }
  }, [accessToken]);

  useEffect(() => {
    if (activeTab === 'forYou' && personalRecommendations.length === 0) {
      loadPersonalRecommendations();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'forGroup' && selectedGroupId) {
      loadGroupRecommendations(selectedGroupId);
    }
  }, [activeTab, selectedGroupId]);

  const loadTrending = async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const response = await api.getTrendingPapers(accessToken);
      setTrendingPapers(response.trending);
    } catch (err) {
      toast.error('Failed to load trending papers');
    } finally {
      setIsLoading(false);
    }
  };

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

  const loadPersonalRecommendations = async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const response = await api.getRecommendationsForUser(accessToken, 20);
      setPersonalRecommendations(response.recommendations);
    } catch (err) {
      toast.error('Failed to load recommendations');
    } finally {
      setIsLoading(false);
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

  const currentPapers =
    activeTab === 'trending'
      ? filteredPapers(trendingPapers)
      : activeTab === 'forYou'
      ? filteredPapers(personalRecommendations)
      : filteredPapers(groupRecommendations);

  if (!accessToken) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Sign in to discover papers</h1>
          <Link href="/auth/signin">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-purple-400" />
            Discover Papers
          </h1>
          <p className="text-gray-400">
            Find relevant research papers recommended by AI based on your interests and group context
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('trending')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'trending'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Trending
          </button>
          <button
            onClick={() => setActiveTab('forYou')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'forYou'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            For You
          </button>
          <button
            onClick={() => setActiveTab('forGroup')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'forGroup'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Users className="w-4 h-4" />
            For Group
          </button>
        </div>

        {/* Group Selector (for group tab) */}
        {activeTab === 'forGroup' && (
          <div className="mb-6 flex gap-4 items-center">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-2"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

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

        {/* Papers Grid */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          </div>
        ) : currentPapers.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-16 h-16 mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">
              {searchQuery ? 'No papers match your search' : 'No recommendations yet'}
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
    <Card className="bg-gray-800 border-gray-700 hover:border-purple-500 transition">
      <CardHeader>
        <div className="flex justify-between items-start gap-2">
          <h3 className="font-semibold text-white line-clamp-2">{paper.title}</h3>
          {(paper.score || paper.trendScore) && (
            <Badge variant="secondary" className="shrink-0">
              {Math.round((paper.score || paper.trendScore || 0) * 100)}%
            </Badge>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-1">{paper.authors.slice(0, 3).join(', ')}</p>
      </CardHeader>
      <CardBody className="pt-0">
        <p className="text-sm text-gray-300 line-clamp-3 mb-3">{paper.abstract}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {paper.tags?.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Reason */}
        {paper.reason && (
          <p className="text-xs text-purple-400 mb-3 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            {paper.reason}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
          {paper.url && (
            <a href={paper.url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-1">
                <ExternalLink className="w-3 h-3" />
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
              className="gap-1"
            >
              {isAdding ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              Add to Group
            </Button>

            {showGroupMenu && (
              <div className="absolute bottom-full left-0 mb-2 bg-gray-700 rounded-lg shadow-lg py-2 min-w-[150px] z-10">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => {
                      onAddToGroup(paper.id, group.id);
                      setShowGroupMenu(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
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
