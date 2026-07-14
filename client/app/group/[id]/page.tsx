'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, CardHeader, Avatar, Badge, Input, Modal } from '@/components/ui';
import { Plus, MessageSquare, Calendar, Archive, ArrowLeft, Search, Loader2, Trash2, UserPlus, Users, Mail, BookOpen, FileText } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Group, Session, GroupMember } from '@/lib/api';
import { toast } from '@/lib/toast';

function GroupPageContent() {
  const params = useParams();
  const groupId = params.id as string;
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
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={48} className="text-[var(--color-brand-secondary)] animate-spin mb-4" />
          <p className="text-[var(--color-text-secondary)]">Loading group...</p>
        </div>
      </div>
    );
  }

  // Error or not found state
  if (error || !group || !groupId) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          {error && (
            <div className="bg-[var(--color-error-bg)] border border-[var(--color-error)]/30 rounded-xl p-4 mb-6 inline-block">
              <p className="text-[var(--color-error)]">{error}</p>
            </div>
          )}
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Group not found</h2>
          <Link href="/home">
            <Button className="mt-6">Back to Groups</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = group.ownerId === user?.id;

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
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
        <div className="bg-[var(--color-bg-secondary)] rounded-2xl shadow-lg border border-[var(--color-border-primary)] p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Avatar src={group.avatar} alt={group.name} size="xl" />
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">{group.name}</h1>
              <p className="text-[#a1a1aa] mt-2">{group.description}</p>
              <div className="flex flex-wrap items-center gap-3 mt-4 text-sm text-[var(--color-text-tertiary)]">
                <span className="px-2 py-1 rounded-lg bg-[var(--color-brand-primary)]/20 text-[var(--color-brand-secondary)] text-xs font-medium">
                  {isOwner ? 'Owner' : group.userRole}
                </span>
                <span>•</span>
                <button
                  onClick={() => setShowMembersModal(true)}
                  className="hover:text-[var(--color-brand-secondary)] transition-colors cursor-pointer"
                >
                  {group.memberCount} members
                </button>
                <span>•</span>
                <span>Created {new Date(group.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Link href={`/group-papers/${groupId}`}>
                <Button variant="outline" className="w-full justify-center">
                  <BookOpen size={18} className="mr-2" />
                  Papers
                </Button>
              </Link>
              <Link href={`/reports/${groupId}`}>
                <Button variant="outline" className="w-full justify-center">
                  <FileText size={18} className="mr-2" />
                  Reports
                </Button>
              </Link>
              <Button variant="outline" onClick={() => setShowInviteModal(true)} className="w-full justify-center">
                <UserPlus size={18} className="mr-2" />
                Invite
              </Button>
              <Button onClick={() => setShowCreateModal(true)} className="w-full justify-center">
                <Plus size={20} className="mr-2" />
                New Session
              </Button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-8 relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[var(--color-text-tertiary)]" size={20} />
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-[var(--color-border-primary)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-secondary)]/40 focus:border-[var(--color-brand-secondary)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] transition-all hover:border-[var(--color-border-hover)]"
          />
        </div>

        {/* Active Sessions */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6 flex items-center">
            <MessageSquare size={24} className="mr-3 text-[var(--color-brand-secondary)]" />
            Active Sessions
          </h2>
          {activeSessions.length === 0 ? (
            <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border-primary)] p-10 text-center">
              <p className="text-[var(--color-text-secondary)]">
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
                <Link key={session.id} href={`/research/${session.id}`}>
                  <Card hover>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] flex-1">
                          {session.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <Badge variant="success" dot>Active</Badge>
                          <button
                            onClick={(e) => handleDeleteSession(session.id, e)}
                            className="p-1.5 rounded-lg hover:bg-[var(--color-error-bg)] text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-all"
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
                      <div className="space-y-2 text-sm text-[var(--color-text-tertiary)]">
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
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6 flex items-center">
              <Archive size={24} className="mr-3 text-[var(--color-text-tertiary)]" />
              Archived Sessions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {archivedSessions.map((session) => (
                <Link key={session.id} href={`/research/${session.id}`}>
                  <Card hover>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <h3 className="text-lg font-semibold text-[var(--color-text-primary)] flex-1">
                          {session.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">Archived</Badge>
                          <button
                            onClick={(e) => handleDeleteSession(session.id, e)}
                            className="p-1.5 rounded-lg hover:bg-[var(--color-error-bg)] text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-all"
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
                      <div className="space-y-2 text-sm text-[var(--color-text-tertiary)]">
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

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewSession({ title: '' });
        }}
        title="Create New Session"
        footer={(
          <>
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
          </>
        )}
      >
        <Input
          label="Session Title"
          placeholder="e.g., BERT Implementation Discussion"
          value={newSession.title}
          onChange={(e) => setNewSession({ title: e.target.value })}
        />
      </Modal>

      <Modal
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setInviteEmail('');
        }}
        title="Invite to Group"
        footer={(
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setShowInviteModal(false);
                setInviteEmail('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleInviteByEmail}
              disabled={!inviteEmail.trim() || isInviting}
              isLoading={isInviting}
            >
              <UserPlus size={18} className="mr-2" />
              Send Invitation
            </Button>
          </>
        )}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-linear-to-br from-[var(--color-brand-primary)] to-[var(--color-brand-secondary)] flex items-center justify-center shrink-0">
            <Mail size={24} className="text-white" />
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">Send an invitation by email</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInviteByEmail()}
              placeholder="colleague@example.com"
              className="w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] rounded-xl text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-secondary)]/40 focus:border-[var(--color-brand-secondary)] transition-all"
              autoFocus
            />
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            The user will receive an invitation they can accept or decline.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        title={`Group Members (${members.length})`}
        footer={<Button variant="ghost" onClick={() => setShowMembersModal(false)}>Close</Button>}
        bodyClassName="space-y-3 max-h-[65dvh]"
      >
        {members.map(member => (
          <div
            key={member.userId}
            className="flex items-center justify-between p-3 bg-[var(--color-bg-tertiary)] rounded-xl border border-[var(--color-border-primary)]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar src={member.avatar} alt={member.name} size="sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-[var(--color-text-primary)] truncate">{member.name}</p>
                  {member.role === 'owner' && (
                    <Badge variant="primary" size="sm">Owner</Badge>
                  )}
                </div>
                <p className="text-sm text-[var(--color-text-tertiary)] truncate">{member.email}</p>
              </div>
            </div>
          </div>
        ))}
      </Modal>
    </div>
  );
}

export default function GroupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--color-bg-primary)]">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={48} className="text-[var(--color-brand-secondary)] animate-spin mb-4" />
          <p className="text-[var(--color-text-secondary)]">Loading...</p>
        </div>
      </div>
    }>
      <GroupPageContent />
    </Suspense>
  );
}