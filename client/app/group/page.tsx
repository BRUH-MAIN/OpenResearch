'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, CardHeader, Avatar, Badge, Input } from '@/components/ui';
import { Plus, MessageSquare, Calendar, Archive, ArrowLeft, Search, Loader2, Trash2, UserPlus, Users, Mail } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Group, Session, GroupMember } from '@/lib/api';
import { toast } from '@/lib/toast';

function GroupPageContent() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get('id');
  const { accessToken, user } = useAuthStore();
  
  const [group, setGroup] = useState<(Group & { memberCount: number; userRole: string }) | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
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
        const [groupData, sessionsData, membersData] = await Promise.all([
          api.getGroup(accessToken, groupId),
          api.getGroupSessions(accessToken, groupId),
          api.getGroupMembers(accessToken, groupId),
        ]);
        setGroup(groupData);
        setSessions(sessionsData);
        setMembers(membersData);
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

  const handleInviteByEmail = async () => {
    if (!accessToken || !groupId || !inviteEmail.trim()) return;
    
    try {
      setIsInviting(true);
      await api.inviteToGroupByEmail(accessToken, groupId, inviteEmail.trim());
      toast.success('Invitation sent!');
      setInviteEmail('');
      setShowInviteModal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };
  
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

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!accessToken) return;
    
    if (!confirm('Are you sure you want to delete this session? All messages will be lost.')) return;
    
    try {
      setDeletingSession(sessionId);
      await api.deleteSession(accessToken, sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      toast.success('Session deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setDeletingSession(null);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f]">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
          <p className="text-[#71717a]">Loading group...</p>
        </div>
      </div>
    );
  }

  // Error or not found state
  if (error || !group || !groupId) {
    return (
      <div className="min-h-screen bg-[#0f0f0f]">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          {error && (
            <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-xl p-4 mb-6 inline-block">
              <p className="text-[#f87171]">{error}</p>
            </div>
          )}
          <h2 className="text-2xl font-bold text-white">Group not found</h2>
          <Link href="/home">
            <Button className="mt-6">Back to Groups</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = group.ownerId === user?.id;

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link href="/home">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft size={20} className="mr-2" />
            Back to Groups
          </Button>
        </Link>

        {/* Group Header */}
        <div className="bg-[#1a1a1a] rounded-2xl shadow-lg border border-[#2a2a2a] p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Avatar src={group.avatar} alt={group.name} size="xl" />
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white">{group.name}</h1>
              <p className="text-[#a1a1aa] mt-2">{group.description}</p>
              <div className="flex flex-wrap items-center gap-3 mt-4 text-sm text-[#71717a]">
                <span className="px-2 py-1 rounded-lg bg-[#0D7377]/20 text-[#14FFEC] text-xs font-medium">
                  {isOwner ? 'Owner' : group.userRole}
                </span>
                <span>•</span>
                <button 
                  onClick={() => setShowMembersModal(true)}
                  className="hover:text-[#14FFEC] transition-colors cursor-pointer"
                >
                  {group.memberCount} members
                </button>
                <span>•</span>
                <span>Created {new Date(group.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowInviteModal(true)}>
                <UserPlus size={18} className="mr-2" />
                Invite
              </Button>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus size={20} className="mr-2" />
                New Session
              </Button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-8 relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#52525b]" size={20} />
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-[#2a2a2a] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#14FFEC]/40 focus:border-[#14FFEC] bg-[#1a1a1a] text-white placeholder:text-[#52525b] transition-all hover:border-[#3a3a3a]"
          />
        </div>

        {/* Active Sessions */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
            <MessageSquare size={24} className="mr-3 text-[#14FFEC]" />
            Active Sessions
          </h2>
          {activeSessions.length === 0 ? (
            <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-10 text-center">
              <p className="text-[#a1a1aa]">
                {searchQuery ? 'No active sessions found' : 'No active sessions yet'}
              </p>
              {!searchQuery && (
                <Button onClick={() => setShowCreateModal(true)} className="mt-6">
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
                        <h3 className="text-lg font-semibold text-white flex-1">
                          {session.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <Badge variant="success" dot>Active</Badge>
                          <button
                            onClick={(e) => handleDeleteSession(session.id, e)}
                            className="p-1.5 rounded-lg hover:bg-[#ef4444]/20 text-[#71717a] hover:text-[#ef4444] transition-all"
                            title="Delete session"
                          >
                            {deletingSession === session.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <div className="space-y-2 text-sm text-[#71717a]">
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
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <Archive size={24} className="mr-3 text-[#71717a]" />
              Archived Sessions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {archivedSessions.map((session) => (
                <Link key={session.id} href={`/chat?sessionId=${session.id}`}>
                  <Card hover>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <h3 className="text-lg font-semibold text-white flex-1">
                          {session.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">Archived</Badge>
                          <button
                            onClick={(e) => handleDeleteSession(session.id, e)}
                            className="p-1.5 rounded-lg hover:bg-[#ef4444]/20 text-[#71717a] hover:text-[#ef4444] transition-all"
                            title="Delete session"
                          >
                            {deletingSession === session.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <div className="space-y-2 text-sm text-[#71717a]">
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[500] p-4 animate-fade-in">
          <div className="bg-[#1a1a1a] rounded-2xl shadow-2xl max-w-md w-full p-6 border border-[#2a2a2a] animate-scale-in">
            <h2 className="text-2xl font-bold text-white mb-6">Create New Session</h2>
            <div className="space-y-5">
              <Input
                label="Session Title"
                placeholder="e.g., BERT Implementation Discussion"
                value={newSession.title}
                onChange={(e) => setNewSession({ title: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-[#2a2a2a]">
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
                isLoading={isCreating}
              >
                Create Session
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[500] p-4 animate-fade-in">
          <div className="bg-[#1a1a1a] rounded-2xl shadow-2xl max-w-md w-full p-6 border border-[#2a2a2a] animate-scale-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0D7377] to-[#14FFEC] flex items-center justify-center">
                <Mail size={24} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Invite to Group</h2>
                <p className="text-sm text-[#71717a]">Send an invitation by email</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#a1a1aa] mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleInviteByEmail()}
                  placeholder="colleague@example.com"
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl text-white placeholder:text-[#52525b] focus:outline-none focus:ring-2 focus:ring-[#14FFEC]/40 focus:border-[#14FFEC] transition-all"
                  autoFocus
                />
              </div>
              <p className="text-xs text-[#71717a]">
                The user will receive an invitation they can accept or decline.
              </p>
            </div>
            
            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteEmail('');
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleInviteByEmail}
                disabled={!inviteEmail.trim() || isInviting}
                isLoading={isInviting}
              >
                <UserPlus size={18} className="mr-2" />
                Send Invitation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Members Modal */}
      {showMembersModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[500] p-4 animate-fade-in">
          <div className="bg-[#1a1a1a] rounded-2xl shadow-2xl max-w-md w-full p-6 border border-[#2a2a2a] animate-scale-in max-h-[80vh] overflow-hidden flex flex-col">
            <h2 className="text-2xl font-bold text-white mb-6">Group Members ({members.length})</h2>
            
            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {members.map(member => (
                <div 
                  key={member.userId}
                  className="flex items-center justify-between p-3 bg-[#0f0f0f] rounded-xl border border-[#2a2a2a]"
                >
                  <div className="flex items-center gap-3">
                    <Avatar src={member.avatar} alt={member.name} size="sm" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white">{member.name}</p>
                        {member.role === 'owner' && (
                          <Badge variant="primary" size="sm">Owner</Badge>
                        )}
                      </div>
                      <p className="text-sm text-[#71717a]">{member.email}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-end pt-4 border-t border-[#2a2a2a]">
              <Button variant="ghost" onClick={() => setShowMembersModal(false)}>
                Close
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
      <div className="min-h-screen bg-[#0f0f0f]">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
          <p className="text-[#71717a]">Loading...</p>
        </div>
      </div>
    }>
      <GroupPageContent />
    </Suspense>
  );
}