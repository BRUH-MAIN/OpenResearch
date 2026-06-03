"""
Tests for the ReportGenerator.
"""

import os
import tempfile
import pytest

from app.report_generator import ReportGenerator


@pytest.fixture
def rg():
    """Create a ReportGenerator writing to a temp dir."""
    tmpdir = tempfile.mkdtemp()
    return ReportGenerator(output_dir=tmpdir)


class TestReportGeneratorInit:

    def test_default_init(self):
        rg = ReportGenerator()
        assert os.path.isdir(rg.output_dir)
        assert 'ReportTitle' in rg.styles

    def test_custom_output_dir(self, rg):
        assert os.path.isdir(rg.output_dir)

    def test_custom_styles_created(self, rg):
        for name in ('ReportTitle', 'SectionTitle', 'SubSection', 'Quote', 'Footer'):
            assert name in rg.styles


class TestGenerateGroupReport:

    def _minimal_report(self, rg, **kwargs):
        defaults = dict(
            group_id="11111111-1111-1111-1111-111111111111",
            group_name="Test Group",
            group_description="A test group description.",
            sessions=[],
            papers=[],
            summaries=[],
            qa_artifacts=[],
            memory_notes=[],
            generated_by="TestUser",
        )
        defaults.update(kwargs)
        return rg.generate_group_report(**defaults)

    def test_minimal_report(self, rg):
        filepath, filename, size = self._minimal_report(rg)
        assert os.path.exists(filepath)
        assert filename.endswith(".pdf")
        assert size > 0

    def test_report_with_papers(self, rg):
        papers = [
            {
                "title": "Paper A",
                "authors": ["Alice", "Bob", "Carol", "Dave"],
                "published_date": "2026-01-01",
                "tags": ["ML", "AI"],
                "abstract": "x" * 600,  # test truncation
            },
            {
                "title": "Paper B",
                "authors": [],
                "abstract": "Short abstract",
            },
        ]
        filepath, _, size = self._minimal_report(rg, papers=papers)
        assert os.path.exists(filepath)
        assert size > 0

    def test_report_with_sessions(self, rg):
        sessions = [
            {
                "title": "Session 1",
                "status": "active",
                "created_at": "2026-01-01T10:00:00Z",
                "messages": [
                    {"user_name": "Alice", "content": "Hello " * 100},
                    {"user_name": "Bob", "content": "Hi"},
                    {"user_name": "Carol", "content": "Test"},
                    {"user_name": "Dave", "content": "Msg 4"},
                    {"user_name": "Eve", "content": "Msg 5"},
                    {"user_name": "Frank", "content": "Msg 6"},
                ],
            }
        ]
        filepath, _, size = self._minimal_report(rg, sessions=sessions)
        assert os.path.exists(filepath)

    def test_report_with_summaries(self, rg):
        summaries = [
            {
                "artifact_type": "summary",
                "created_at": "2026-01-01T10:00:00Z",
                "content": "Summary content " * 100,
            }
        ]
        filepath, _, _ = self._minimal_report(rg, summaries=summaries)
        assert os.path.exists(filepath)

    def test_report_with_qa_artifacts(self, rg):
        qa_artifacts = [
            {
                "prompt": "@ai What is this?",
                "content": "This is an answer " * 100,
            }
        ]
        filepath, _, _ = self._minimal_report(rg, qa_artifacts=qa_artifacts)
        assert os.path.exists(filepath)

    def test_report_with_memory_notes(self, rg):
        notes = [
            {"note_type": "decision", "content": "Focus on NLP."},
            {"note_type": "guideline", "content": "Review weekly."},
        ]
        filepath, _, _ = self._minimal_report(rg, memory_notes=notes)
        assert os.path.exists(filepath)

    def test_report_with_custom_prompt(self, rg):
        filepath, _, _ = self._minimal_report(rg, custom_prompt="@ai Include insights")
        assert os.path.exists(filepath)

    def test_report_excludes_optional_sections(self, rg):
        filepath, _, _ = self._minimal_report(
            rg,
            include_sessions=False,
            include_papers=False,
            include_summaries=False,
        )
        assert os.path.exists(filepath)

    def test_report_all_sections(self, rg):
        """Full report with all sections populated."""
        filepath, _, size = self._minimal_report(
            rg,
            papers=[{"title": "P1", "authors": ["A"], "abstract": "abs"}],
            sessions=[{
                "title": "S1",
                "status": "active",
                "created_at": "2026-01-01T00:00:00Z",
                "messages": [{"user_name": "Bot", "content": "Hi"}],
            }],
            summaries=[{"artifact_type": "summary", "created_at": "2026-01-01", "content": "Sum"}],
            qa_artifacts=[{"prompt": "Q?", "content": "A."}],
            memory_notes=[{"note_type": "insight", "content": "Note"}],
            custom_prompt="@ai focus area",
        )
        assert size > 0


class TestGenerateSampleReport:

    def test_sample_report(self, rg):
        filepath, filename, size = rg.generate_sample_report()
        assert os.path.exists(filepath)
        assert filename.endswith(".pdf")
        assert size > 0
