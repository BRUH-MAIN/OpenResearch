'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, CardHeader, Avatar, Input } from '@/components/ui';
import { Plus, Users, Calendar, Search, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { useGroups, useCreateGroup } from '@/lib/hooks/useGroups';
import { toast } from '@/lib/toast';

export default function HomePage() {
  const { user } = useAuthStore();
  const { data: groups = [], isLoading, error } = useGroups();
  const createGroup = useCreateGroup();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newGroup, setNewGroup] = useState({
    name: '',
    description: '',
  });

  const filteredGroups = groups.filter(
    (group: any) =>
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateGroup = async () => {
    if (!newGroup.name.trim() || !newGroup.description.trim()) return;

    try {
      await createGroup.mutateAsync({
        name: newGroup.name.trim(),
        description: newGroup.description.trim(),
      });
      setShowCreateModal(false);
      setNewGroup({ name: '', description: '' });
      toast.success('Group created successfully!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create group';
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">My Groups</h1>
            <p className="text-[var(--color-text-secondary)] mt-1">Collaborate with your research teams</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus size={20} className="mr-2" />
            Create Group
          </Button>
        </div>

        {/* Search Bar */}
        <div className="mb-6 relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[var(--color-text-tertiary)]" size={20} />
          <input
            type="text"
            placeholder="Search groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-[var(--color-border-primary)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#14FFEC]/40 focus:border-[#14FFEC] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] transition-all hover:border-[var(--color-border-hover)]"
          />
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-[var(--color-error-bg)] border border-[var(--color-error)]/30 rounded-xl p-4 mb-6">
            <p className="text-[var(--color-error)]">{error instanceof Error ? error.message : 'Failed to load groups'}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
            <p className="text-[var(--color-text-secondary)]">Loading your groups...</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 bg-[var(--color-bg-secondary)] rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[var(--color-border-primary)]">
              <Users size={40} className="text-[var(--color-text-tertiary)]" />
            </div>
            <h3 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
              {searchQuery ? 'No groups found' : 'No groups yet'}
            </h3>
            <p className="text-[var(--color-text-secondary)] mb-6">
              {searchQuery
                ? 'Try adjusting your search query'
                : 'Create your first group to start collaborating'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus size={20} className="mr-2" />
                Create Your First Group
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGroups.map((group: any) => {
              const isOwner = group.ownerId === user?.id;
              return (
                <Link key={group.id} href={`/group?id=${group.id}`}>
                  <Card hover>
                    <CardHeader className="flex flex-row items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <Avatar src={group.avatar} alt={group.name} size="lg" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] truncate">
                            {group.name}
                          </h3>
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            {isOwner ? 'Owner: You' : `Role: ${group.role || 'Member'}`}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <p className="text-[var(--color-text-secondary)] text-sm mb-4 line-clamp-2">
                        {group.description}
                      </p>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center text-[var(--color-text-tertiary)]">
                          <Users size={16} className="mr-1.5" />
                          <span>{group.memberCount} members</span>
                        </div>
                        <div className="flex items-center text-[var(--color-text-tertiary)]">
                          <Calendar size={16} className="mr-1.5" />
                          <span>{new Date(group.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[500] p-4 animate-fade-in">
          <div className="bg-[var(--color-bg-secondary)] rounded-2xl shadow-2xl max-w-md w-full p-6 border border-[var(--color-border-primary)] animate-scale-in">
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6">Create New Group</h2>
            <div className="space-y-5">
              <Input
                label="Group Name"
                placeholder="e.g., AI Research Lab"
                value={newGroup.name}
                onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
              />
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Description
                </label>
                <textarea
                  placeholder="What's this group about?"
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                  className="w-full px-4 py-3 border border-[var(--color-border-primary)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#14FFEC]/40 focus:border-[#14FFEC] resize-none bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] transition-all hover:border-[var(--color-border-hover)]"
                  rows={4}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-[var(--color-border-primary)]">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewGroup({ name: '', description: '' });
                }}
                disabled={createGroup.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateGroup}
                disabled={!newGroup.name.trim() || !newGroup.description.trim() || createGroup.isPending}
                isLoading={createGroup.isPending}
              >
                Create Group
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}