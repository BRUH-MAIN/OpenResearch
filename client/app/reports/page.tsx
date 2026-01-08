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
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar />
        <div className="container mx-auto px-4 py-16 text-center">
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
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar />
        <div className="container mx-auto px-4 py-16 text-center">
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
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar />
        <div className="flex justify-center items-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href={`/group?id=${groupId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Group
              </Button>
            </Link>
            <div className="h-6 w-px bg-gray-700" />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FileText className="w-6 h-6 text-purple-400" />
                {group?.name} Reports
              </h1>
              <p className="text-sm text-gray-400">Generate and download PDF research reports</p>
            </div>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Generate Report
          </Button>
        </div>

        {/* Reports List */}
        {reports.length === 0 ? (
          <Card className="bg-gray-800 border-gray-700">
            <CardBody className="py-16 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No reports yet</h3>
              <p className="text-gray-400 mb-6">
                Generate your first research report to summarize group activity
              </p>
              <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Generate Report
              </Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4">
            {reports.map((report) => (
              <Card key={report.id} className="bg-gray-800 border-gray-700">
                <CardBody className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-purple-600/20 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{report.title}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-400">
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
                        className="gap-1"
                      >
                        <Download className="w-4 h-4" />
                        Download PDF
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteReport(report.id)}
                      disabled={deletingReport === report.id}
                      className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
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
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <Card className="bg-gray-800 border-gray-700 w-full max-w-lg">
              <CardHeader>
                <h2 className="text-xl font-bold">Generate Research Report</h2>
                <p className="text-sm text-gray-400">
                  Create a PDF report summarizing your group&apos;s research activity
                </p>
              </CardHeader>
              <CardBody className="space-y-4">
                {/* Report Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Report Type
                  </label>
                  <div className="flex gap-2">
                    {(['weekly', 'monthly', 'custom'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setReportConfig((prev) => ({ ...prev, reportType: type }))}
                        className={`px-4 py-2 rounded-lg capitalize ${
                          reportConfig.reportType === type
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Custom Title (optional)
                  </label>
                  <input
                    type="text"
                    value={reportConfig.customTitle}
                    onChange={(e) =>
                      setReportConfig((prev) => ({ ...prev, customTitle: e.target.value }))
                    }
                    placeholder={`${group?.name} Research Report`}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                {/* Sections */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Include Sections
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['overview', 'papers', 'discussions', 'insights', 'summary', 'citations'].map(
                      (section) => (
                        <button
                          key={section}
                          onClick={() => toggleSection(section)}
                          className={`px-3 py-1 rounded-full text-sm capitalize ${
                            reportConfig.sections.includes(section)
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {section}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4">
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
                    className="gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        Generate Report
                      </>
                    )}
                  </Button>
                </div>
              </CardBody>
            </Card>
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
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      }
    >
      <ReportsPageContent />
    </Suspense>
  );
}
