'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, CardHeader, Avatar, Badge, Input } from '@/components/ui';
import { Plus, MessageSquare, Calendar, Archive, ArrowLeft, Search, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Group, Session } from '@/lib/api';
import { toast } from '@/lib/toast';

function GroupPageContent() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get('id');
  const { accessToken, user } = useAuthStore();
  
  const [group, setGroup] = useState<(Group & { memberCount: number; userRole: string }) | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newSession, setNewSession] = useState({
    title: '',
  });
  
  // Fetch group and sessions
  useEffect(() => {
    async function fetchData() {
      if (!accessToken || !groupId) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        setError(null);
        const [groupData, sessionsData] = await Promise.all([
          api.getGroup(accessToken, groupId),
          api.getGroupSessions(accessToken, groupId),
        ]);
        setGroup(groupData);
        setSessions(sessionsData);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load group';
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchData();
  }, [accessToken, groupId]);
  
  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const activeSessions = filteredSessions.filter(s => s.status === 'active');
  const archivedSessions = filteredSessions.filter(s => s.status === 'archived');

  const handleCreateSession = async () => {
    if (!accessToken || !groupId || !newSession.title.trim()) return;
    
    try {
      setIsCreating(true);
      const created = await api.createSession(accessToken, groupId, newSession.title.trim());
      setSessions(prev => [...prev, created]);
      setShowCreateModal(false);
      setNewSession({ title: '' });
      toast.success('Session created successfully!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      setError(message);
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#212121]">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
          <p className="text-gray-400">Loading group...</p>
        </div>
      </div>
    );
  }

  // Error or not found state
  if (error || !group || !groupId) {
    return (
      <div className="min-h-screen bg-[#212121]">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          {error && (
            <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 mb-6 inline-block">
              <p className="text-red-400">{error}</p>
            </div>
          )}
          <h2 className="text-2xl font-bold text-white">Group not found</h2>
          <Link href="/home">
            <Button className="mt-4">Back to Groups</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = group.ownerId === user?.id;

  return (
    <div className="min-h-screen bg-[#212121]">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link href="/home">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft size={20} className="mr-2" />
            Back to Groups
          </Button>
        </Link>

        {/* Group Header */}
        <div className="bg-[#323232] rounded-xl shadow-md border border-[#0D7377] p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <Avatar src={group.avatar} alt={group.name} size="xl" />
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white">{group.name}</h1>
              <p className="text-gray-300 mt-1">{group.description}</p>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-400">
                <span>{isOwner ? 'Owner: You' : `Role: ${group.userRole}`}</span>
                <span>•</span>
                <span>{group.memberCount} members</span>
                <span>•</span>
                <span>Created {new Date(group.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus size={20} className="mr-2" />
              New Session
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={20} />
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-[#0D7377] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14FFEC] bg-[#323232] text-white"
          />
        </div>

        {/* Active Sessions */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
            <MessageSquare size={24} className="mr-2" />
            Active Sessions
          </h2>
          {activeSessions.length === 0 ? (
            <div className="bg-[#323232] rounded-lg border border-[#0D7377] p-8 text-center">
              <p className="text-gray-300">
                {searchQuery ? 'No active sessions found' : 'No active sessions yet'}
              </p>
              {!searchQuery && (
                <Button onClick={() => setShowCreateModal(true)} className="mt-4">
                  <Plus size={20} className="mr-2" />
                  Create First Session
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeSessions.map((session) => (
                <Link key={session.id} href={`/chat?sessionId=${session.id}`}>
                  <Card hover>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 flex-1">
                          {session.title}
                        </h3>
                        <Badge variant="success">Active</Badge>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center">
                          <MessageSquare size={16} className="mr-2" />
                          <span>{session.messageCount} messages</span>
                        </div>
                        <div className="flex items-center">
                          <Calendar size={16} className="mr-2" />
                          <span>
                            Last active:{' '}
                            {new Date(session.lastActivityAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Archived Sessions */}
        {archivedSessions.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
              <Archive size={24} className="mr-2" />
              Archived Sessions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {archivedSessions.map((session) => (
                <Link key={session.id} href={`/chat?sessionId=${session.id}`}>
                  <Card hover>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 flex-1">
                          {session.title}
                        </h3>
                        <Badge variant="secondary">Archived</Badge>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center">
                          <MessageSquare size={16} className="mr-2" />
                          <span>{session.messageCount} messages</span>
                        </div>
                        <div className="flex items-center">
                          <Calendar size={16} className="mr-2" />
                          <span>
                            Archived:{' '}
                            {new Date(session.lastActivityAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Create Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#323232] rounded-xl shadow-2xl max-w-md w-full p-6 border border-[#0D7377]">
            <h2 className="text-2xl font-bold text-white mb-4">Create New Session</h2>
            <div className="space-y-4">
              <Input
                label="Session Title"
                placeholder="e.g., BERT Implementation Discussion"
                value={newSession.title}
                onChange={(e) => setNewSession({ title: e.target.value })}
              />
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewSession({ title: '' });
                }}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateSession}
                disabled={!newSession.title.trim() || isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 size={20} className="mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Session'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GroupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#212121]">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <GroupPageContent />
    </Suspense>
  );
}