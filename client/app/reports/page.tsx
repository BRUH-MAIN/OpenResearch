'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout';
import { Button, Card, CardBody, CardHeader, Badge, Modal } from '@/components/ui';
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

  const handleDownload = async (report: Report) => {
    if (!accessToken || !report.downloadUrl) return;
    try {
      await api.downloadReport(accessToken, report.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download report');
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
      <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
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
      <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
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
      <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <Navbar />
        <div className="flex flex-col justify-center items-center h-[60vh]">
          <Loader2 className="w-10 h-10 animate-spin text-[#14FFEC] mb-4" />
          <p className="text-[var(--color-text-secondary)] text-sm">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Link href={`/group?id=${groupId}`}>
              <Button variant="ghost" size="sm" className="w-full justify-center sm:w-auto">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Group
              </Button>
            </Link>
            <div className="hidden h-6 w-px bg-[var(--color-border-primary)] sm:block" />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FileText className="w-6 h-6 text-[#14FFEC]" />
                {group?.name} Reports
              </h1>
              <p className="text-sm text-[var(--color-text-tertiary)]">Generate and download PDF research reports</p>
            </div>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="w-full justify-center sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Generate Report
          </Button>
        </div>

        {/* Reports List */}
        {reports.length === 0 ? (
          <Card>
            <CardBody className="py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] flex items-center justify-center mx-auto mb-6">
                <FileText className="w-8 h-8 text-[var(--color-text-tertiary)]" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-[var(--color-text-primary)]">No reports yet</h3>
              <p className="text-[var(--color-text-tertiary)] mb-6 max-w-sm mx-auto">
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
                <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#0D7377]/20 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-[#14FFEC]" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[var(--color-text-primary)]">{report.title}</h3>
                      <div className="flex items-center gap-3 text-sm text-[var(--color-text-tertiary)]">
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

                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                    {report.status === 'completed' && report.downloadUrl && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDownload(report)}
                        className="w-full justify-center sm:w-auto"
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
                      className="w-full justify-center text-[#ef4444] hover:text-[#f87171] hover:bg-[#ef4444]/10 sm:w-auto"
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

        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Generate Research Report"
          size="lg"
          footer={(
            <>
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
            </>
          )}
        >
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1 mb-5">
            Create a PDF report summarizing your group&apos;s research activity
          </p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Report Type
              </label>
              <div className="flex flex-wrap gap-2">
                {(['weekly', 'monthly', 'custom'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setReportConfig((prev) => ({ ...prev, reportType: type }))}
                    className={`px-4 py-2 rounded-xl capitalize text-sm font-medium transition-all ${reportConfig.reportType === type
                        ? 'bg-[#0D7377] text-white shadow-lg shadow-[#0D7377]/25'
                        : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-white'
                      }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Custom Title (optional)
              </label>
              <input
                type="text"
                value={reportConfig.customTitle}
                onChange={(e) =>
                  setReportConfig((prev) => ({ ...prev, customTitle: e.target.value }))
                }
                placeholder={`${group?.name} Research Report`}
                className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl px-4 py-2.5 text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-[#14FFEC] focus:ring-2 focus:ring-[#14FFEC]/20 focus:outline-none transition-all hover:border-[var(--color-border-hover)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Include Sections
              </label>
              <div className="flex flex-wrap gap-2">
                {['overview', 'papers', 'discussions', 'insights', 'summary', 'citations'].map(
                  (section) => (
                    <button
                      key={section}
                      onClick={() => toggleSection(section)}
                      className={`px-3 py-1.5 rounded-full text-sm capitalize font-medium transition-all ${reportConfig.sections.includes(section)
                          ? 'bg-[#0D7377]/20 text-[#14FFEC] border border-[#0D7377]/40'
                          : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-transparent hover:bg-[var(--color-bg-hover)] hover:text-white'
                        }`}
                    >
                      {section}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#14FFEC] mb-4" />
          <p className="text-[var(--color-text-secondary)] text-sm">Loading...</p>
        </div>
      }
    >
      <ReportsPageContent />
    </Suspense>
  );
}
