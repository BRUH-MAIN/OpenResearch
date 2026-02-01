'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, CardHeader, Badge } from '@/components/ui';
import {
  FileText,
  Download,
  Loader2,
  ArrowLeft,
  Plus,
  Trash2,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api, Report, Group } from '@/lib/api';
import { toast } from '@/lib/toast';

function ReportsPageContent() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get('groupId');
  const { accessToken, user } = useAuthStore();

  const [group, setGroup] = useState<(Group & { memberCount: number; userRole: string }) | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingReport, setDeletingReport] = useState<string | null>(null);

  // Report generation form
  const [reportConfig, setReportConfig] = useState({
    reportType: 'weekly' as 'weekly' | 'monthly' | 'custom',
    customTitle: '',
    sections: ['overview', 'papers', 'discussions', 'insights'],
  });

  useEffect(() => {
    if (accessToken && groupId) {
      loadData();
    }
  }, [accessToken, groupId]);

  const loadData = async () => {
    if (!accessToken || !groupId) return;
    try {
      setIsLoading(true);
      const [groupData, reportsData] = await Promise.all([
        api.getGroup(accessToken, groupId),
        api.getGroupReports(accessToken, groupId),
      ]);
      setGroup(groupData);
      setReports(reportsData);
    } catch (err) {
      toast.error('Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!accessToken || !groupId) return;
    try {
      setIsGenerating(true);
      const response = await api.generateGroupReport(accessToken, groupId, {
        reportType: reportConfig.reportType,
        customTitle: reportConfig.customTitle || undefined,
        sections: reportConfig.sections,
      });

      toast.success('Report generated successfully!');
      setShowCreateModal(false);
      
      // Refresh reports list
      const reportsData = await api.getGroupReports(accessToken, groupId);
      setReports(reportsData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!accessToken) return;
    try {
      setDeletingReport(reportId);
      await api.deleteReport(accessToken, reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      toast.success('Report deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete report');
    } finally {
      setDeletingReport(null);
    }
  };

  const handleDownload = (report: Report) => {
    if (report.downloadUrl) {
      window.open(api.getReportDownloadUrl(report.id), '_blank');
    }
  };

  const toggleSection = (section: string) => {
    setReportConfig((prev) => ({
      ...prev,
      sections: prev.sections.includes(section)
        ? prev.sections.filter((s) => s !== section)
        : [...prev.sections, section],
    }));
  };

  if (!accessToken) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Sign in to view reports</h1>
          <Link href="/auth/signin">
            <Button>Sign In</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!groupId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
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
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <Navbar />
        <div className="flex flex-col justify-center items-center h-[60vh]">
          <Loader2 className="w-10 h-10 animate-spin text-[#14FFEC] mb-4" />
          <p className="text-[#71717a] text-sm">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <Link href={`/group?id=${groupId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Group
              </Button>
            </Link>
            <div className="h-6 w-px bg-[#2a2a2a]" />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FileText className="w-6 h-6 text-[#14FFEC]" />
                {group?.name} Reports
              </h1>
              <p className="text-sm text-[#71717a]">Generate and download PDF research reports</p>
            </div>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Generate Report
          </Button>
        </div>

        {/* Reports List */}
        {reports.length === 0 ? (
          <Card>
            <CardBody className="py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center mx-auto mb-6">
                <FileText className="w-8 h-8 text-[#52525b]" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-white">No reports yet</h3>
              <p className="text-[#71717a] mb-6 max-w-sm mx-auto">
                Generate your first research report to summarize group activity
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Generate Report
              </Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4">
            {reports.map((report) => (
              <Card key={report.id}>
                <CardBody className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#0D7377]/20 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-[#14FFEC]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{report.title}</h3>
                      <div className="flex items-center gap-3 text-sm text-[#71717a]">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(report.createdAt).toLocaleDateString()}
                        </span>
                        <Badge
                          variant={
                            report.status === 'completed'
                              ? 'success'
                              : report.status === 'generating'
                              ? 'secondary'
                              : 'danger'
                          }
                          className="capitalize"
                        >
                          {report.status === 'completed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                          {report.status === 'generating' && <Clock className="w-3 h-3 mr-1 animate-spin" />}
                          {report.status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                          {report.status}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {report.reportType}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {report.status === 'completed' && report.downloadUrl && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDownload(report)}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download PDF
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteReport(report.id)}
                      disabled={deletingReport === report.id}
                      className="text-[#ef4444] hover:text-[#f87171] hover:bg-[#ef4444]/10"
                    >
                      {deletingReport === report.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* Create Report Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[500] p-4 animate-fade-in">
            <div className="relative w-full max-w-lg bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl shadow-2xl animate-scale-in">
              <div className="px-6 py-5 border-b border-[#2a2a2a]">
                <h2 className="text-xl font-semibold text-white">Generate Research Report</h2>
                <p className="text-sm text-[#71717a] mt-1">
                  Create a PDF report summarizing your group&apos;s research activity
                </p>
              </div>
              <div className="px-6 py-5 space-y-5">
                {/* Report Type */}
                <div>
                  <label className="block text-sm font-medium text-[#e4e4e7] mb-2">
                    Report Type
                  </label>
                  <div className="flex gap-2">
                    {(['weekly', 'monthly', 'custom'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setReportConfig((prev) => ({ ...prev, reportType: type }))}
                        className={`px-4 py-2 rounded-xl capitalize text-sm font-medium transition-all ${
                          reportConfig.reportType === type
                            ? 'bg-[#0D7377] text-white shadow-lg shadow-[#0D7377]/25'
                            : 'bg-[#242424] text-[#a1a1aa] hover:bg-[#2a2a2a] hover:text-white'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Title */}
                <div>
                  <label className="block text-sm font-medium text-[#e4e4e7] mb-2">
                    Custom Title (optional)
                  </label>
                  <input
                    type="text"
                    value={reportConfig.customTitle}
                    onChange={(e) =>
                      setReportConfig((prev) => ({ ...prev, customTitle: e.target.value }))
                    }
                    placeholder={`${group?.name} Research Report`}
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-white placeholder-[#52525b] focus:border-[#14FFEC] focus:ring-2 focus:ring-[#14FFEC]/20 focus:outline-none transition-all hover:border-[#3a3a3a]"
                  />
                </div>

                {/* Sections */}
                <div>
                  <label className="block text-sm font-medium text-[#e4e4e7] mb-2">
                    Include Sections
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['overview', 'papers', 'discussions', 'insights', 'summary', 'citations'].map(
                      (section) => (
                        <button
                          key={section}
                          onClick={() => toggleSection(section)}
                          className={`px-3 py-1.5 rounded-full text-sm capitalize font-medium transition-all ${
                            reportConfig.sections.includes(section)
                              ? 'bg-[#0D7377]/20 text-[#14FFEC] border border-[#0D7377]/40'
                              : 'bg-[#242424] text-[#a1a1aa] border border-transparent hover:bg-[#2a2a2a] hover:text-white'
                          }`}
                        >
                          {section}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 py-4 border-t border-[#2a2a2a] bg-[#141414] rounded-b-2xl flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isGenerating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateReport}
                  disabled={isGenerating || reportConfig.sections.length === 0}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 mr-2" />
                      Generate Report
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#14FFEC] mb-4" />
          <p className="text-[#71717a] text-sm">Loading...</p>
        </div>
      }
    >
      <ReportsPageContent />
    </Suspense>
  );
}
