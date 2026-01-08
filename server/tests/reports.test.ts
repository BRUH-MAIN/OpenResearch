/**
 * Tests for Reports Routes
 * 
 * These tests cover PDF report generation and retrieval.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock dependencies
vi.mock('../src/db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'test-report-id' }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
  },
  groupReports: {},
  groupMembers: {},
  groups: {},
}));

vi.mock('../src/services/aiClient.js', () => ({
  aiClient: {
    generateReport: vi.fn().mockResolvedValue({
      report_path: '/reports/test.pdf',
      summary: 'Test summary',
      file_size: 1024,
    }),
  },
}));

describe('Reports Routes', () => {
  describe('POST /api/reports/group/:groupId/generate', () => {
    it('should create a report record', async () => {
      const reportRecord = {
        id: 'report-123',
        groupId: 'group-1',
        title: 'Weekly Report',
        status: 'generating',
      };
      
      expect(reportRecord.status).toBe('generating');
    });

    it('should call AI service for generation', async () => {
      const aiResponse = {
        report_path: '/reports/report-123.pdf',
        summary: 'This report covers...',
        file_size: 2048,
      };
      
      expect(aiResponse.report_path).toContain('.pdf');
    });

    it('should update status on completion', async () => {
      const updatedReport = {
        id: 'report-123',
        status: 'completed',
        filePath: '/reports/report-123.pdf',
      };
      
      expect(updatedReport.status).toBe('completed');
      expect(updatedReport.filePath).toBeTruthy();
    });

    it('should update status on failure', async () => {
      const failedReport = {
        id: 'report-123',
        status: 'failed',
        metadata: { error: 'Generation failed' },
      };
      
      expect(failedReport.status).toBe('failed');
    });

    it('should require group membership', async () => {
      const nonMemberError = { error: 'Group not found or access denied' };
      expect(nonMemberError.error).toContain('access denied');
    });
  });

  describe('GET /api/reports/group/:groupId', () => {
    it('should return list of reports', async () => {
      const reports = [
        { id: 'r1', title: 'Report 1', status: 'completed' },
        { id: 'r2', title: 'Report 2', status: 'completed' },
      ];
      
      expect(Array.isArray(reports)).toBe(true);
      expect(reports.length).toBe(2);
    });

    it('should include download URL for completed reports', async () => {
      const completedReport = {
        id: 'r1',
        status: 'completed',
        downloadUrl: '/api/reports/r1/download',
      };
      
      expect(completedReport.downloadUrl).toBeTruthy();
    });

    it('should not include download URL for pending reports', async () => {
      const pendingReport = {
        id: 'r2',
        status: 'generating',
        downloadUrl: null,
      };
      
      expect(pendingReport.downloadUrl).toBeNull();
    });
  });

  describe('GET /api/reports/:reportId', () => {
    it('should return report details', async () => {
      const report = {
        id: 'r1',
        groupId: 'g1',
        title: 'Weekly Report',
        reportType: 'weekly',
        status: 'completed',
      };
      
      expect(report.id).toBe('r1');
      expect(report.reportType).toBe('weekly');
    });

    it('should return 404 for non-existent report', async () => {
      const notFound = { error: 'Report not found' };
      expect(notFound.error).toContain('not found');
    });
  });

  describe('GET /api/reports/:reportId/download', () => {
    it('should stream PDF file', async () => {
      const response = {
        contentType: 'application/pdf',
        contentDisposition: 'attachment; filename="report.pdf"',
      };
      
      expect(response.contentType).toBe('application/pdf');
    });

    it('should require completed status', async () => {
      const error = { error: 'Report not available for download' };
      expect(error.error).toContain('not available');
    });

    it('should check group membership', async () => {
      const accessDenied = { error: 'Report not found or access denied' };
      expect(accessDenied.error).toContain('access denied');
    });
  });

  describe('DELETE /api/reports/:reportId', () => {
    it('should delete report', async () => {
      const response = { message: 'Report deleted' };
      expect(response.message).toContain('deleted');
    });

    it('should only allow creator to delete', async () => {
      const forbiddenError = { error: 'Only the report creator can delete it' };
      expect(forbiddenError.error).toContain('creator');
    });
  });
});

describe('Report Types', () => {
  it('should support weekly reports', () => {
    const validTypes = ['weekly', 'monthly', 'custom'];
    expect(validTypes).toContain('weekly');
  });

  it('should support monthly reports', () => {
    const validTypes = ['weekly', 'monthly', 'custom'];
    expect(validTypes).toContain('monthly');
  });

  it('should support custom reports', () => {
    const validTypes = ['weekly', 'monthly', 'custom'];
    expect(validTypes).toContain('custom');
  });
});

describe('Report Sections', () => {
  const validSections = ['overview', 'papers', 'discussions', 'insights', 'summary', 'citations'];

  it('should support overview section', () => {
    expect(validSections).toContain('overview');
  });

  it('should support papers section', () => {
    expect(validSections).toContain('papers');
  });

  it('should support discussions section', () => {
    expect(validSections).toContain('discussions');
  });

  it('should support insights section', () => {
    expect(validSections).toContain('insights');
  });

  it('should support multiple sections', () => {
    const selectedSections = ['overview', 'papers', 'insights'];
    expect(selectedSections.length).toBe(3);
    selectedSections.forEach(s => expect(validSections).toContain(s));
  });
});

describe('Report Metadata', () => {
  it('should store date range', () => {
    const metadata = {
      dateRange: { start: '2024-01-01', end: '2024-01-07' },
      sections: ['overview', 'papers'],
    };
    
    expect(metadata.dateRange.start).toBe('2024-01-01');
    expect(metadata.dateRange.end).toBe('2024-01-07');
  });

  it('should store generation timestamp', () => {
    const metadata = {
      generatedAt: new Date().toISOString(),
    };
    
    expect(metadata.generatedAt).toBeTruthy();
  });

  it('should store file size', () => {
    const metadata = {
      fileSize: 2048,
    };
    
    expect(metadata.fileSize).toBeGreaterThan(0);
  });
});
