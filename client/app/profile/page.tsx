'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, CardHeader, Avatar, Badge } from '@/components/ui';
import { Mail, Calendar, Edit2, Users, BookMarked, MessageSquare, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Group, Paper, User } from '@/lib/api';
import { toast } from '@/lib/toast';

interface SavedPaper extends Paper {
  savedAt: string;
  notes?: string;
}

export default function ProfilePage() {
  const { user, accessToken, updateUser } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState<Partial<User>>({});
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [savedPapers, setSavedPapers] = useState<SavedPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user data
  useEffect(() => {
    async function fetchData() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        setError(null);
        const [groups, papers] = await Promise.all([
          api.getGroups(accessToken),
          api.getSavedPapers(accessToken),
        ]);
        setUserGroups(groups);
        setSavedPapers(papers);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile data');
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchData();
  }, [accessToken]);

  useEffect(() => {
    if (user) {
      setEditedUser({
        name: user.name,
        email: user.email,
        interests: user.interests || [],
      });
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!accessToken) return;
    
    try {
      setIsSaving(true);
      setError(null);
      await updateUser(editedUser);
      setIsEditing(false);
      toast.success('Profile updated successfully!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update profile';
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#212121]">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={48} className="text-[#14FFEC] animate-spin mb-4" />
          <p className="text-gray-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#212121]">
      <Navbar />
      
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error State */}
        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Profile Header */}
        <Card className="mb-8">
          <CardBody className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
              <Avatar src={user.avatar} alt={user.name} size="xl" />
              <div className="flex-1">
                {isEditing ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editedUser.name || ''}
                      onChange={(e) => setEditedUser({ ...editedUser, name: e.target.value })}
                      className="text-3xl font-bold text-white border-b-2 border-[#14FFEC] focus:outline-none w-full bg-transparent"
                    />
                    <input
                      type="email"
                      value={editedUser.email || ''}
                      onChange={(e) => setEditedUser({ ...editedUser, email: e.target.value })}
                      className="text-gray-300 border-b-2 border-[#14FFEC] focus:outline-none w-full bg-transparent"
                      disabled
                    />
                  </div>
                ) : (
                  <>
                    <h1 className="text-3xl font-bold text-white">{user.name}</h1>
                    <div className="flex items-center text-gray-300 mt-2">
                      <Mail size={16} className="mr-2" />
                      {user.email}
                    </div>
                    <div className="flex items-center text-gray-400 text-sm mt-1">
                      <Calendar size={16} className="mr-2" />
                      Joined {new Date(user.createdAt).toLocaleDateString()}
                    </div>
                  </>
                )}
              </div>
              {isEditing ? (
                <div className="flex space-x-2">
                  <Button onClick={handleSaveProfile} disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 size={18} className="mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save'
                    )}
                  </Button>
                  <Button variant="ghost" onClick={() => {
                    setIsEditing(false);
                    setEditedUser({
                      name: user.name,
                      email: user.email,
                      interests: user.interests || [],
                    });
                  }} disabled={isSaving}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setIsEditing(true)}>
                  <Edit2 size={18} className="mr-2" />
                  Edit Profile
                </Button>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Stats */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={32} className="text-[#14FFEC] animate-spin" />
          </div>
        ) : (
          <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardBody className="p-6 text-center">
              <div className="w-12 h-12 bg-[#0D7377]/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Users size={24} className="text-[#14FFEC]" />
              </div>
              <h3 className="text-2xl font-bold text-white">{userGroups.length}</h3>
              <p className="text-gray-400">Groups Joined</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="p-6 text-center">
              <div className="w-12 h-12 bg-[#0D7377]/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <BookMarked size={24} className="text-[#14FFEC]" />
              </div>
              <h3 className="text-2xl font-bold text-white">{savedPapers.length}</h3>
              <p className="text-gray-400">Papers Saved</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="p-6 text-center">
              <div className="w-12 h-12 bg-[#0D7377]/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <MessageSquare size={24} className="text-[#14FFEC]" />
              </div>
              <h3 className="text-2xl font-bold text-white">--</h3>
              <p className="text-gray-400">Messages Sent</p>
            </CardBody>
          </Card>
        </div>

        {/* Research Interests */}
        <Card className="mb-8">
          <CardHeader>
            <h2 className="text-xl font-bold text-white">Research Interests</h2>
          </CardHeader>
          <CardBody>
            {isEditing ? (
              <div>
                <p className="text-sm text-gray-400 mb-2">
                  Add or remove interests (comma-separated)
                </p>
                <input
                  type="text"
                  value={(editedUser.interests || []).join(', ')}
                  onChange={(e) => setEditedUser({
                    ...editedUser,
                    interests: e.target.value.split(',').map(i => i.trim()).filter(Boolean)
                  })}
                  className="w-full px-3 py-2 border border-[#0D7377] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14FFEC] bg-[#212121] text-white"
                />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(user.interests || []).length > 0 ? (
                  (user.interests || []).map((interest) => (
                    <Badge key={interest} variant="primary">
                      {interest}
                    </Badge>
                  ))
                ) : (
                  <p className="text-gray-400">No interests added yet</p>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Groups */}
        <Card className="mb-8">
          <CardHeader>
            <h2 className="text-xl font-bold text-white">My Groups</h2>
          </CardHeader>
          <CardBody>
            {userGroups.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-gray-400 mb-2">No groups joined yet</p>
                <Link href="/home">
                  <Button size="sm">Browse Groups</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {userGroups.map((group) => (
                  <Link
                    key={group.id}
                    href={`/group?id=${group.id}`}
                    className="flex items-center justify-between p-3 bg-[#212121] rounded-lg hover:bg-[#323232] transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <Avatar src={group.avatar} alt={group.name} size="sm" />
                      <div>
                        <p className="font-medium text-white">{group.name}</p>
                        <p className="text-sm text-gray-400">{group.memberCount} members</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost">
                      View
                    </Button>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Saved Papers */}
        <Card>
          <CardHeader>
            <h2 className="text-xl font-bold text-white">Saved Papers</h2>
          </CardHeader>
          <CardBody>
            {savedPapers.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-gray-400 mb-2">No papers saved yet</p>
                <Link href="/paper">
                  <Button size="sm">Explore Papers</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {savedPapers.map((paper) => (
                  <div
                    key={paper.id}
                    className="p-4 bg-[#212121] rounded-lg hover:bg-[#323232] transition-colors"
                  >
                    <h4 className="font-semibold text-white mb-1">{paper.title}</h4>
                    <p className="text-sm text-gray-400 mb-2">
                      {paper.authors.slice(0, 3).join(', ')}
                      {paper.authors.length > 3 && ' et al.'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(paper.tags || []).slice(0, 3).map(tag => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
          </>
        )}
      </main>
    </div>
  );
}