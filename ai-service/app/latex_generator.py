"""LaTeX IEEE paper generator.

Converts a structured paper draft (markdown-ish text produced by the
paper_writing agent) into a compilable IEEE-format LaTeX document.

If `pdflatex` is available on the system the module will also compile
the document to PDF.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# IEEE LaTeX template (IEEEtran class)
# ---------------------------------------------------------------------------

IEEE_TEMPLATE = r"""\documentclass[conference]{IEEEtran}

\usepackage{cite}
\usepackage{amsmath,amssymb,amsfonts}
\usepackage{algorithmic}
\usepackage{graphicx}
\usepackage{textcomp}
\usepackage{xcolor}
\usepackage{hyperref}
\usepackage{booktabs}
\usepackage{multirow}

\begin{document}

\title{<<TITLE>>}

\author{
<<AUTHORS>>
}

\maketitle

\begin{abstract}
<<ABSTRACT>>
\end{abstract}

\begin{IEEEkeywords}
<<KEYWORDS>>
\end{IEEEkeywords}

<<BODY>>

<<REFERENCES>>

\end{document}
"""


@dataclass
class PaperSections:
    """Parsed sections from the paper draft."""
    title: str = "Untitled Paper"
    authors: str = r"\IEEEauthorblockN{OpenResearch AI}"
    abstract: str = ""
    keywords: str = ""
    sections: list[tuple[str, str]] = field(default_factory=list)  # (heading, content)
    references: list[str] = field(default_factory=list)


def parse_paper_draft(draft_text: str) -> PaperSections:
    """Parse a markdown-style paper draft into structured sections."""
    paper = PaperSections()

    def _normalize_heading(raw: str) -> str:
        heading = raw.strip().strip(":")
        heading = re.sub(r"^[IVXLCDM\d]+[\.)]?\s+", "", heading, flags=re.IGNORECASE)
        return heading.strip()

    def _extract_bold_sections(text: str) -> list[tuple[str, str]]:
        # Matches lines like "**I. Introduction**" or "**Title:** My Title"
        pattern = re.compile(r"^\s*\*\*(.+?)\*\*\s*:?[ \t]*(.*)$", re.MULTILINE)
        matches = list(pattern.finditer(text))
        sections: list[tuple[str, str]] = []
        for idx, m in enumerate(matches):
            raw_heading = m.group(1).strip()
            inline_text = m.group(2).strip()
            start = m.end()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            block_text = text[start:end].strip()
            content = f"{inline_text}\n{block_text}".strip() if inline_text else block_text
            sections.append((_normalize_heading(raw_heading), content))
        return sections

    def _parse_references(ref_text: str) -> list[str]:
        refs: list[str] = []
        current = ""
        for line in ref_text.splitlines():
            stripped = line.strip()
            if not stripped:
                continue

            is_new_ref = bool(re.match(r"^(?:\[\d+\]|\d+[\.)]|[\-\*•])\s+", stripped))
            if is_new_ref:
                if current:
                    refs.append(current.strip())
                current = re.sub(r"^(?:\[\d+\]|\d+[\.)]|[\-\*•])\s+", "", stripped).strip()
            else:
                current = f"{current} {stripped}".strip() if current else stripped

        if current:
            refs.append(current.strip())

        if refs:
            return refs

        return [r.strip() for r in ref_text.split("\n\n") if r.strip()]

    md_sections = re.findall(
        r"^##\s+(.+?)\s*\n(.*?)(?=\n##\s|\Z)",
        draft_text,
        re.MULTILINE | re.DOTALL,
    )
    bold_sections = _extract_bold_sections(draft_text)
    skip_headings = {"title", "abstract", "references", "reference", "keywords", "index terms"}
    md_body_sections = [
        (h, c)
        for h, c in md_sections
        if _normalize_heading(h).lower() not in skip_headings and str(c).strip()
    ]
    section_source = md_sections if md_body_sections else bold_sections

    # Extract title: first # heading or first line
    title_match = re.search(r"^#\s+(.+)$", draft_text, re.MULTILINE)
    if title_match:
        paper.title = title_match.group(1).strip()
    else:
        bold_title_match = re.search(r"^\s*\*\*Title:?\*\*\s*(.+)$", draft_text, re.MULTILINE | re.IGNORECASE)
        if bold_title_match:
            paper.title = bold_title_match.group(1).strip()
        else:
            for line in draft_text.splitlines():
                stripped = line.strip()
                if not stripped:
                    continue
                fallback = stripped.replace("**", "")
                fallback = re.sub(r"^\s*Title\s*:\s*", "", fallback, flags=re.IGNORECASE)
                if fallback:
                    paper.title = fallback[:180]
                    break

    # Extract abstract
    abstract_match = re.search(
        r"(?:^##?\s*Abstract\s*\n)(.*?)(?=\n##?\s|\Z)",
        draft_text, re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    if abstract_match:
        paper.abstract = abstract_match.group(1).strip()
    else:
        for heading, content in bold_sections:
            if heading.lower() == "abstract":
                paper.abstract = content.strip()
                break

    # Extract keywords
    kw_match = re.search(
        r"(?:Keywords?|Index Terms?)\s*[:\-—]\s*(.+?)(?:\n\n|\n##|\Z)",
        draft_text, re.IGNORECASE | re.DOTALL,
    )
    if kw_match:
        paper.keywords = kw_match.group(1).strip().replace("\n", " ")
    else:
        for heading, content in section_source:
            if heading.lower() in {"keywords", "index terms"}:
                paper.keywords = content.strip().replace("\n", " ")
                break

    # Extract references section
    ref_match = re.search(
        r"(?:^##?\s*References?\s*\n)(.*?)(?=\Z)",
        draft_text, re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    if ref_match:
        ref_text = ref_match.group(1).strip()
        paper.references = _parse_references(ref_text)
    else:
        for heading, content in bold_sections:
            if heading.lower() in {"references", "reference"}:
                paper.references = _parse_references(content)
                break

    # Extract body sections from either markdown headings or bold headings.
    for heading, content in section_source:
        normalized_heading = _normalize_heading(heading)
        if normalized_heading.lower() in skip_headings:
            continue
        cleaned_content = content.strip()
        # In mixed formatting drafts, a markdown references heading may appear
        # after bold sections; drop that tail from the current section body.
        cleaned_content = re.split(r"\n##?\s*References?\b", cleaned_content, maxsplit=1, flags=re.IGNORECASE)[0].strip()
        if not cleaned_content:
            continue
        paper.sections.append((normalized_heading, cleaned_content))

    return paper


def _escape_latex(text: str) -> str:
    """Escape special LaTeX characters in plain text."""
    # Order matters — backslash first
    replacements = [
        ("\\", r"\textbackslash{}"),
        ("&", r"\&"),
        ("%", r"\%"),
        ("$", r"\$"),
        ("#", r"\#"),
        ("_", r"\_"),
        ("{", r"\{"),
        ("}", r"\}"),
        ("~", r"\textasciitilde{}"),
        ("^", r"\textasciicircum{}"),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    return text


def _markdown_to_latex(text: str) -> str:
    """Convert lightweight markdown formatting to LaTeX.

    Handles bold, italic, inline code, bullet lists, and numbered lists.
    Does NOT escape characters already handled within formatting.
    """
    # Convert citation links like [[3]](url) to plain [3] first.
    text = re.sub(r"\[\[(\d+)\]\]\(([^)]+)\)", r"[\1]", text)
    # Convert regular markdown links to LaTeX hyperlinks.
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\\href{\2}{\1}", text)

    # Bold **text** or __text__
    text = re.sub(r"\*\*(.+?)\*\*", r"\\textbf{\1}", text)
    text = re.sub(r"__(.+?)__", r"\\textbf{\1}", text)

    # Italic *text* or _text_
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"\\textit{\1}", text)

    # Inline code `text`
    text = re.sub(r"`(.+?)`", r"\\texttt{\1}", text)

    # Bullet lists
    lines = text.split("\n")
    result_lines: list[str] = []
    in_itemize = False
    in_enumerate = False

    for line in lines:
        stripped = line.strip()

        # Bullet item
        bullet_match = re.match(r"^[\-\*•]\s+(.+)$", stripped)
        # Numbered item
        num_match = re.match(r"^\d+[\.\)]\s+(.+)$", stripped)

        if bullet_match:
            if not in_itemize:
                if in_enumerate:
                    result_lines.append(r"\end{enumerate}")
                    in_enumerate = False
                result_lines.append(r"\begin{itemize}")
                in_itemize = True
            result_lines.append(f"  \\item {bullet_match.group(1)}")
        elif num_match:
            if not in_enumerate:
                if in_itemize:
                    result_lines.append(r"\end{itemize}")
                    in_itemize = False
                result_lines.append(r"\begin{enumerate}")
                in_enumerate = True
            result_lines.append(f"  \\item {num_match.group(1)}")
        else:
            if in_itemize:
                result_lines.append(r"\end{itemize}")
                in_itemize = False
            if in_enumerate:
                result_lines.append(r"\end{enumerate}")
                in_enumerate = False
            result_lines.append(line)

    if in_itemize:
        result_lines.append(r"\end{itemize}")
    if in_enumerate:
        result_lines.append(r"\end{enumerate}")

    return "\n".join(result_lines)


def _build_bibtex(references: list[str]) -> tuple[str, str]:
    """Build \\bibitem entries and return (latex_bib_section, bibtex_keys_csv)."""
    if not references:
        return "", ""

    items = []
    keys = []
    for i, ref in enumerate(references):
        key = f"ref{i+1}"
        keys.append(key)
        clean_ref = re.sub(r"\[\[(\d+)\]\]\(([^)]+)\)", r"[\1]", ref)
        clean_ref = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", clean_ref)
        safe_ref = _escape_latex(clean_ref)
        items.append(f"\\bibitem{{{key}}}\n{safe_ref}")

    bib_section = (
        "\\begin{thebibliography}{99}\n"
        + "\n\n".join(items)
        + "\n\\end{thebibliography}"
    )
    return bib_section, ", ".join(keys)


def generate_latex(draft_text: str, metadata: Optional[dict] = None) -> str:
    """Convert a paper draft to IEEE LaTeX source.

    Parameters
    ----------
    draft_text : str
        The paper draft produced by the paper_writing agent.
    metadata : dict, optional
        Extra metadata (authors, keywords override, etc.).

    Returns
    -------
    str
        Complete LaTeX source ready for compilation.
    """
    paper = parse_paper_draft(draft_text)
    metadata = metadata or {}

    # Override from metadata if provided
    title = _escape_latex(metadata.get("title", paper.title))
    authors = metadata.get("authors", paper.authors)
    abstract = _escape_latex(paper.abstract)
    keywords = _escape_latex(metadata.get("keywords", paper.keywords))

    # Build body sections
    body_parts = []
    for heading, content in paper.sections:
        safe_heading = _escape_latex(heading)
        converted_content = _markdown_to_latex(content)
        body_parts.append(f"\\section{{{safe_heading}}}\n{converted_content}")

    body = "\n\n".join(body_parts)

    # Build references
    bib_section, _ = _build_bibtex(paper.references)

    # Fill template
    latex = IEEE_TEMPLATE
    latex = latex.replace("<<TITLE>>", title)
    latex = latex.replace("<<AUTHORS>>", authors)
    latex = latex.replace("<<ABSTRACT>>", abstract)
    latex = latex.replace("<<KEYWORDS>>", keywords)
    latex = latex.replace("<<BODY>>", body)
    latex = latex.replace("<<REFERENCES>>", bib_section)

    return latex


def compile_to_pdf(latex_source: str, output_dir: Optional[str] = None) -> Optional[str]:
    """Compile LaTeX source to PDF using pdflatex.

    Parameters
    ----------
    latex_source : str
        Complete LaTeX source.
    output_dir : str, optional
        Directory to place the final PDF. Defaults to ``./reports``.

    Returns
    -------
    str or None
        Path to the generated PDF, or None if compilation fails.
    """
    if not shutil.which("pdflatex"):
        logger.warning("pdflatex not found — skipping PDF compilation")
        return None

    output_dir = output_dir or "./reports"
    os.makedirs(output_dir, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = os.path.join(tmpdir, "paper.tex")
        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(latex_source)

        # Run pdflatex twice for references
        for pass_num in range(2):
            try:
                result = subprocess.run(
                    ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "paper.tex"],
                    cwd=tmpdir,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if result.returncode != 0 and pass_num == 1:
                    logger.error("pdflatex failed:\n%s", result.stdout[-2000:] if result.stdout else "no output")
                    # Still try to get the PDF — nonstopmode often produces partial output
            except subprocess.TimeoutExpired:
                logger.error("pdflatex timed out on pass %d", pass_num + 1)
                return None

        pdf_src = os.path.join(tmpdir, "paper.pdf")
        if not os.path.exists(pdf_src):
            logger.error("PDF not generated")
            return None

        # Copy to output directory with unique name
        filename = f"paper_{uuid.uuid4().hex[:8]}.pdf"
        pdf_dest = os.path.join(output_dir, filename)
        shutil.copy2(pdf_src, pdf_dest)

        logger.info("PDF generated: %s", pdf_dest)
        return pdf_dest


async def generate_ieee_paper(
    draft_text: str,
    metadata: Optional[dict] = None,
    compile_pdf: bool = True,
) -> dict:
    """Full pipeline: parse draft → LaTeX → optionally PDF.

    Returns
    -------
    dict
        {
            "latex_source": str,
            "pdf_path": str | None,
            "pdf_filename": str | None,
            "sections_count": int,
            "references_count": int,
        }
    """
    latex_source = generate_latex(draft_text, metadata)
    paper = parse_paper_draft(draft_text)

    pdf_path = None
    pdf_filename = None
    if compile_pdf:
        pdf_path = compile_to_pdf(latex_source)
        if pdf_path:
            pdf_filename = os.path.basename(pdf_path)

    return {
        "latex_source": latex_source,
        "pdf_path": pdf_path,
        "pdf_filename": pdf_filename,
        "sections_count": len(paper.sections),
        "references_count": len(paper.references),
    }
