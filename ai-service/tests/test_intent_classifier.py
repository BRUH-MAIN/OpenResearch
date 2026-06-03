"""Tests for the embedding-based intent classifier."""

import pytest
from unittest.mock import patch, MagicMock
import numpy as np

from app.intent_classifier import (
    classify_intent,
    INTENT_PHRASES,
    INTENT_THRESHOLD,
    _clean_prompt,
    _cosine_similarity,
)


# ---------------------------------------------------------------------------
# Unit tests for helpers
# ---------------------------------------------------------------------------

class TestCleanPrompt:

    def test_strips_ai_trigger(self):
        assert _clean_prompt("@ai find papers") == "find papers"

    def test_strips_case_insensitive(self):
        assert _clean_prompt("@AI do something") == "do something"

    def test_empty_after_strip(self):
        assert _clean_prompt("@ai") == ""

    def test_no_trigger(self):
        assert _clean_prompt("just a normal query") == "just a normal query"


class TestCosineSimilarity:

    def test_identical_vectors(self):
        v = np.array([1.0, 2.0, 3.0])
        assert abs(_cosine_similarity(v, v) - 1.0) < 1e-6

    def test_orthogonal_vectors(self):
        a = np.array([1.0, 0.0])
        b = np.array([0.0, 1.0])
        assert abs(_cosine_similarity(a, b)) < 1e-6

    def test_zero_vector(self):
        a = np.array([0.0, 0.0])
        b = np.array([1.0, 2.0])
        assert _cosine_similarity(a, b) == 0.0


# ---------------------------------------------------------------------------
# Intent phrase coverage
# ---------------------------------------------------------------------------

class TestIntentPhrases:

    def test_all_task_types_present(self):
        expected = {
            "deep_research",
            "paper_retrieval",
            "literature_survey",
            "gap_analysis",
            "fact_check",
            "novelty_assessment",
            "research_mentor",
            "paper_writing",
            "methodology_extraction",
            "reviewer_anticipation",
        }
        assert set(INTENT_PHRASES.keys()) == expected

    def test_each_type_has_phrases(self):
        for intent, phrases in INTENT_PHRASES.items():
            assert len(phrases) >= 5, f"{intent} has fewer than 5 phrases"


# ---------------------------------------------------------------------------
# Classifier tests (with mocked embeddings)
# ---------------------------------------------------------------------------

class TestClassifyIntent:

    @patch("app.intent_classifier.embedding_service")
    @patch("app.intent_classifier._initialized", False)
    @patch("app.intent_classifier._intent_embeddings", {})
    def test_classify_returns_none_when_not_initialized(self, mock_emb):
        mock_emb.is_configured = False
        mock_emb._sync_embed.return_value = None
        intent, score, phrase = classify_intent("@ai find papers about NLP")
        assert intent is None
        assert score == 0.0

    @patch("app.intent_classifier.embedding_service")
    @patch("app.intent_classifier._initialized", True)
    def test_classify_empty_prompt(self, mock_emb):
        intent, score, phrase = classify_intent("@ai")
        assert intent is None

    @patch("app.intent_classifier.embedding_service")
    @patch("app.intent_classifier._initialized", True)
    def test_classify_with_high_similarity(self, mock_emb):
        """When the embedding is identical to a known phrase, it should match."""
        known_vec = np.array([1.0, 0.0, 0.0])

        # Set up pre-computed embeddings to have one entry for paper_retrieval
        with patch("app.intent_classifier._intent_embeddings", {
            "paper_retrieval": [known_vec],
            "deep_research": [np.array([0.0, 1.0, 0.0])],
        }):
            mock_emb._sync_embed.return_value = [1.0, 0.0, 0.0]
            intent, score, phrase = classify_intent("@ai find papers about NLP")
            assert intent == "paper_retrieval"
            assert score >= INTENT_THRESHOLD

    @patch("app.intent_classifier.embedding_service")
    @patch("app.intent_classifier._initialized", True)
    def test_classify_below_threshold(self, mock_emb):
        """Random vector should not match any intent."""
        with patch("app.intent_classifier._intent_embeddings", {
            "paper_retrieval": [np.array([1.0, 0.0, 0.0])],
        }):
            # Orthogonal vector → similarity ≈ 0
            mock_emb._sync_embed.return_value = [0.0, 1.0, 0.0]
            intent, score, phrase = classify_intent("@ai completely unrelated query")
            assert intent is None
            assert score < INTENT_THRESHOLD
