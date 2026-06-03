'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, Avatar } from '@/components/ui';
import { Mail, Users, Check, X, Loader2, Clock, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, GroupInvitation } from '@/lib/api';
import { toast } from '@/lib/toast';
import Link from 'next/link';

export default function InvitationsPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInvitations() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = await api.getPendingInvitations(accessToken);
        setInvitations(data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load invitations');
      } finally {
        setIsLoading(false);
      }
    }

    fetchInvitations();
  }, [accessToken]);

  const handleAccept = async (invitationId: string) => {
    if (!accessToken) return;

    try {
      setProcessingId(invitationId);
      const result = await api.acceptGroupInvitation(accessToken, invitationId);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      toast.success(`Joined ${result.group.name}!`);
      router.push(`/group?id=${result.group.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (invitationId: string) => {
    if (!accessToken) return;

    try {
      setProcessingId(invitationId);
      await api.declineGroupInvitation(accessToken, invitationId);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      toast.success('Invitation declined');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to decline invitation');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-start gap-4 mb-8 sm:items-center">
          <Link
            href="/home"
            className="p-2 rounded-xl text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0D7377] to-[#14FFEC] flex items-center justify-center">
              <Mail size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Group Invitations</h1>
              <p className="text-sm text-[var(--color-text-tertiary)]">
                {invitations.length} pending invitation{invitations.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
            <p className="text-[var(--color-text-secondary)]">Loading invitations...</p>
          </div>
        ) : invitations.length === 0 ? (
          /* Empty State */
          <Card>
            <CardBody className="p-12 text-center">
              <div className="w-20 h-20 rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center mx-auto mb-6">
                <Mail size={40} className="text-[#3f3f46]" />
              </div>
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">No pending invitations</h2>
              <p className="text-[var(--color-text-secondary)] mb-6">
                When someone invites you to a group, it will appear here.
              </p>
              <Link href="/home">
                <Button>
                  <Users size={18} className="mr-2" />
                  Browse Your Groups
                </Button>
              </Link>
            </CardBody>
          </Card>
        ) : (
          /* Invitations List */
          <div className="space-y-4">
            {invitations.map((invitation) => (
              <Card key={invitation.id} className="hover:border-[#3f3f46] transition-colors">
                <CardBody className="p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    {/* Group Avatar */}
                    <Avatar
                      src={invitation.groupAvatar}
                      alt={invitation.groupName || 'Group'}
                      size="lg"
                    />

                    {/* Invitation Details */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-[var(--color-text-primary)] truncate">
                        {invitation.groupName || 'Unknown Group'}
                      </h3>
                      {invitation.groupDescription && (
                        <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2 mt-1">
                          {invitation.groupDescription}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-tertiary)]">
                        <span className="flex items-center gap-1">
                          Invited by{' '}
                          <span className="text-[var(--color-text-secondary)]">
                            {invitation.inviterName || invitation.invitedByUserName || 'Unknown'}
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {formatDate(invitation.createdAt)}
                        </span>
                      </div>
                      {invitation.message && (
                        <div className="mt-3 p-3 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border-primary)]">
                          <p className="text-sm text-[var(--color-text-secondary)] italic">&ldquo;{invitation.message}&rdquo;</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleAccept(invitation.id)}
                        disabled={processingId === invitation.id}
                        isLoading={processingId === invitation.id}
                        className="w-full justify-center sm:w-auto"
                      >
                        <Check size={16} className="mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDecline(invitation.id)}
                        disabled={processingId === invitation.id}
                        className="w-full justify-center hover:bg-[#ef4444]/10 hover:text-[#ef4444] sm:w-auto"
                      >
                        <X size={16} className="mr-1" />
                        Decline
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
