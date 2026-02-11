# LaTeX Documentation - OpenResearch

This directory contains the project report and presentation for the OpenResearch platform.

## Files Generated

1. **main.tex** - Complete project report (Bachelor's thesis format)
2. **slide.tex** - Presentation slides (Beamer format)

## Report Structure (main.tex)

The report includes:
- Title page with team member names
- Bonafide certificate
- Declaration
- Acknowledgement
- Abstract
- List of Abbreviations
- Table of Contents, List of Figures, List of Tables
- **Chapter 1: Introduction** - Motivation, literature survey, problem statement, objectives
- **Chapter 2: Background** - Web technologies, database technologies, AI technologies, security
- **Chapter 3: Proposed Work** - System architecture, implementation details, algorithms
- **Chapter 4: Results and Discussion** - Performance metrics, testing, comparison
- **Chapter 5: Conclusion** - Contributions, future work, impact
- References (20 citations)
- List of Publications

## Presentation Structure (slide.tex)

The presentation includes:
- Introduction (Motivation, Project Overview)
- Architecture (System design, Database schema, Vector search)
- AI Features (RAG pipeline, Paper summarization, Q&A, Group isolation)
- Implementation (Real-time communication, Security, Technology choices)
- Results (Performance metrics, Testing, Comparison)
- Demo & Future Work
- Conclusion
- References

## Required Files for Compilation

Before compiling the LaTeX documents, you need to add:

### 1. Logo and Images

Create a `pic/` directory and add:
- `logored.png` - Amrita logo (red version)
- `Amrita.jpg` - Amrita university logo
- `architecture.png` - System architecture diagram (optional for report)

You can create a simple architecture diagram or use any placeholder image.

### 2. Beamer Theme

The presentation uses the `Amr_Beamer` theme. You need:
- `Amr_Beamer.sty` - Beamer theme file

If you don't have this theme, you can:
- Replace `\usepackage{Amr_Beamer}` with a standard theme like `\usetheme{Madrid}` or `\usetheme{Berkeley}`
- Or create your own custom theme

## Compilation Instructions

### For the Report (main.tex):

```bash
# Using pdflatex (run twice for references)
pdflatex main.tex
pdflatex main.tex

# Or using latexmk (automatic)
latexmk -pdf main.tex
```

### For the Presentation (slide.tex):

```bash
# Using pdflatex
pdflatex slide.tex
pdflatex slide.tex

# Or using latexmk
latexmk -pdf slide.tex
```

### Using Overleaf:

1. Create a new project in Overleaf
2. Upload `main.tex` or `slide.tex`
3. Upload the required images to `pic/` directory
4. Upload `Amr_Beamer.sty` (for presentation)
5. Compile (Overleaf does this automatically)

## Quick Fixes

### If compilation fails due to missing images:

You can comment out the image includes temporarily:
```latex
% \includegraphics[scale=0.2]{pic/logored.png}
% \includegraphics[width=3.1in, height=1in]{Amrita.jpg}
```

### If Beamer theme is missing (slide.tex):

Replace line with `\usepackage{Amr_Beamer}` with:
```latex
\usetheme{Madrid}  % or Berkeley, CambridgeUS, etc.
\usecolortheme{crane}
```

### For architecture diagram:

You can:
1. Create a simple diagram using any tool (Draw.io, PowerPoint, etc.)
2. Export as PNG
3. Save as `pic/architecture.png`

Or comment out the architecture figure in the report:
```latex
% \begin{figure}[H]
%     \centering
%     \includegraphics[width=0.9\textwidth]{pic/architecture.png}
%     \caption{OpenResearch System Architecture}
%     \label{fig:architecture}
% \end{figure}
```

## Content Summary

### Report Highlights:
- **Abstract**: 300+ words covering motivation, approach, and results
- **Introduction**: Comprehensive background with literature survey
- **Technical Content**: Detailed architecture, algorithms, and implementation
- **Results**: Performance metrics, testing results, comparison table
- **Conclusion**: Contributions, future work, lessons learned
- **20 References**: Relevant citations from RAG, vector search, and web technologies

### Presentation Highlights:
- **25+ slides** covering all key aspects
- Performance metrics tables
- Comparison with existing platforms
- Technical details (RAG pipeline, HNSW, JWT auth)
- Future enhancements
- Clean, professional formatting

## Customization

Feel free to customize:
- **Author names**: Update team member names if needed
- **Guide names**: Update guide/co-guide information in certificate
- **Content**: Add more details about your specific implementation
- **Figures**: Add your own architecture diagrams, screenshots, charts
- **Tables**: Update performance metrics with your actual measurements
- **References**: Add/remove citations as appropriate

## Notes

1. The report is structured for a BTech Computer Science (AI) project at Amrita School of AI
2. All technical content is based on the actual OpenResearch codebase
3. Performance metrics are representative - update with your actual measurements
4. The presentation is designed for approximately 20-25 minutes
5. Both documents follow academic formatting standards

## Support

If you encounter LaTeX compilation errors:
1. Check that all required packages are installed
2. Ensure image files are in the correct directory
3. Try compiling with `pdflatex` first before using more complex tools
4. Check the `.log` file for specific error messages

For any questions about the content or structure, refer to the actual codebase in the repository.

---

**Generated for**: OpenResearch - AI-Powered Collaborative Research Platform  
**Team**: B Pranav Karthik, Bharath Sooryaa M, Hari Karthik V, Rohan Ramesh  
**Institution**: Amrita School of Artificial Intelligence, Coimbatore
