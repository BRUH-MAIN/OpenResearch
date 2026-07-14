"""arXiv search: query cleaning and Atom parsing."""

import httpx
import respx

from app.tools.arxiv import _clean_query, search_arxiv

ATOM = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/1706.03762v5</id>
    <published>2017-06-12T17:57:34Z</published>
    <title>Attention Is All You Need</title>
    <summary>The dominant sequence transduction models are based on
    complex recurrent networks.</summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
  </entry>
</feed>"""


class TestQueryCleaning:
    def test_strips_filler_so_the_and_join_still_matches(self):
        # arXiv AND-joins terms, so leaving "what are the recent" in makes a
        # query so restrictive it returns nothing.
        cleaned = _clean_query("What are the recent methods for image segmentation?")

        assert "all:methods" in cleaned
        assert "all:image" in cleaned
        assert "all:segmentation" in cleaned
        assert "recent" not in cleaned
        assert "what" not in cleaned.lower()

    def test_leaves_a_deliberate_query_alone(self):
        raw = 'ti:"neural machine translation" AND cat:cs.CL'

        assert _clean_query(raw) == raw

    def test_a_single_term_needs_no_join(self):
        assert _clean_query("transformers") == "transformers"

    def test_falls_back_when_everything_is_a_stop_word(self):
        # Better an over-broad query than an empty one.
        assert _clean_query("what is the") != ""


class TestSearch:
    @respx.mock
    async def test_parses_the_atom_response(self):
        respx.get(url__startswith="https://export.arxiv.org/api/query").mock(
            return_value=httpx.Response(200, text=ATOM)
        )

        papers = await search_arxiv("attention")

        assert len(papers) == 1
        paper = papers[0]
        assert paper["title"] == "Attention Is All You Need"
        assert paper["authors"] == ["Ashish Vaswani", "Noam Shazeer"]
        assert "sequence transduction" in paper["abstract"]
        assert paper["published"] == "2017-06-12"

    @respx.mock
    async def test_returns_nothing_rather_than_raising_when_arxiv_is_down(self):
        # The agent treats an empty result as an observation and moves on; an
        # exception here would abort the whole investigation.
        respx.get(url__startswith="https://export.arxiv.org/api/query").mock(
            return_value=httpx.Response(503)
        )

        assert await search_arxiv("anything") == []
