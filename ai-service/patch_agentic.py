import sys

def patch_agentic():
    with open("app/agentic.py", "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    # Phase 1: Add import datetime
    for i, line in enumerate(lines):
        if line.startswith("import copy"):
            lines.insert(i + 1, "import datetime\n")
            break
            
    # Phase 2: Add date to primary_system_prompt
    for i, line in enumerate(lines):
        if "primary_system_prompt = (" in line:
            indent = line[:len(line) - len(line.lstrip())]
            lines.insert(i, f"{indent}current_date_str = datetime.date.today().isoformat()\n")
            lines[i+1] = lines[i+1].replace(
                '"You are the Primary Orchestrator. You have access to specialized tools for "',
                'f"You are the Primary Orchestrator. The current date is {current_date_str}. You have access to specialized tools for "'
            )
            break
            
    # Phase 3: Modify _tool_retrieve_papers signature and call
    for i, line in enumerate(lines):
        if "def _tool_retrieve_papers(self, query: str, config: RunnableConfig) -> str:" in line:
            indent = line[:len(line) - len(line.lstrip())]
            lines[i] = f"""{indent}async def _tool_retrieve_papers(
{indent}    self, 
{indent}    query: str, 
{indent}    config: RunnableConfig, 
{indent}    start_date: Optional[str] = None, 
{indent}    end_date: Optional[str] = None
{indent}) -> str:\n"""
            lines[i+1] = f"""{indent}    \"\"\"Search for relevant academic papers from arXiv (read-only, no auto-save to group).
{indent}    start_date and end_date should be in YYYY-MM-DD format if requested (e.g., "past 2 years").
{indent}    \"\"\"\n"""
            break
            
    for i, line in enumerate(lines):
        if "mcp_response = await search_arxiv(query=query, limit=10)" in line:
            indent = line[:len(line) - len(line.lstrip())]
            lines[i] = f"""{indent}# If the query itself seems to imply a date constraint, sorting by date might help, but 
{indent}# we increase the limit to 40 to ensure broader coverage before formatting top 8.
{indent}mcp_response = await search_arxiv(
{indent}    query=query, limit=40, start_date=start_date, end_date=end_date
{indent})\n"""
            break
            
    # Phase 4: Put _tool_survey_literature body in try...except AND modify logic
    start_survey_idx = -1
    for i, line in enumerate(lines):
        if "def _tool_survey_literature(self, query: str, config: RunnableConfig) -> str:" in line:
            start_survey_idx = i
            break
            
    if start_survey_idx != -1:
        # Find the end of _tool_survey_literature
        end_survey_idx = -1
        func_indent = len(lines[start_survey_idx]) - len(lines[start_survey_idx].lstrip())
        for i in range(start_survey_idx + 1, len(lines)):
            if lines[i].strip() and not lines[i].startswith(" " * (func_indent + 1)):
                end_survey_idx = i
                break
                
        if end_survey_idx == -1:
            end_survey_idx = len(lines)
            
        # Add the try block right after docstring
        docstring_end = start_survey_idx + 2
        lines.insert(docstring_end, " " * (func_indent + 4) + "try:\n")
        
        # Indent everything from docstring_end+1 to end_survey_idx
        for i in range(docstring_end + 1, end_survey_idx + 1):
            if lines[i] != "\n":
                lines[i] = "    " + lines[i]
                
        # Insert the except block
        except_block = f"""{" " * (func_indent + 4)}except Exception as exc:
{" " * (func_indent + 8)}logger.error("_tool_survey_literature failed: %s", exc, exc_info=True)
{" " * (func_indent + 8)}return f"Error surveying literature: {{exc}}"\n"""
        lines.insert(end_survey_idx + 1, except_block)
        
        # Now apply the replacements dynamically
        content = "".join(lines)
        
        target1 = '''        # Generate sub-queries for RAG and ArXiv
            query_gen_system = (
                "You are an expert academic librarian. Extract a clean arXiv search query, 3-5 specific vector "
                "database sub-queries, and any explicit time constraints (e.g. 'past 2 years', 'since 2021', "
                "or 'None') from the user's research topic. \\n"
                "Return ONLY a JSON object with this exact structure:\\n"
                '{"arxiv_query": "clean keywords only", "vector_queries": ["query1", "query2"], "time_constraint": "None"}'
            )'''
            
        replacement1 = '''        # Generate sub-queries for RAG and ArXiv
            current_date_str = datetime.date.today().isoformat()
            query_gen_system = (
                f"You are an expert academic librarian. The current date is {current_date_str}. Extract a clean arXiv search query, 3-5 specific vector "
                "database sub-queries, and any explicit time constraints (e.g. 'past 2 years', 'since 2021') from the user's research topic. \\n"
                "If a time constraint is requested, compute the exact 'start_date' and 'end_date' in 'YYYY-MM-DD' format. If not requested, leave them null.\\n"
                "Return ONLY a JSON object with this exact structure:\\n"
                '{"arxiv_query": "clean keywords only", "vector_queries": ["query1", "query2"], "start_date": "2022-01-01", "end_date": "2024-01-01"}'
            )'''
        content = content.replace(target1, replacement1)
        
        target2 = '''            # Default fallbacks if parsing fails
            arxiv_query = query
            sub_queries = [query]
            time_constraint = "None"
            
            if isinstance(query_data, dict):
                arxiv_query = query_data.get("arxiv_query", query)
                sub_queries = query_data.get("vector_queries", [query])
                time_constraint = query_data.get("time_constraint", "None")'''
                
        replacement2 = '''            # Default fallbacks if parsing fails
            arxiv_query = query
            sub_queries = [query]
            start_date = None
            end_date = None
            
            if isinstance(query_data, dict):
                arxiv_query = query_data.get("arxiv_query", query)
                sub_queries = query_data.get("vector_queries", [query])
                start_date = query_data.get("start_date")
                end_date = query_data.get("end_date")

            time_constraint = f"between {start_date} and {end_date}" if start_date or end_date else "None"'''
        content = content.replace(target2, replacement2)
        
        target3 = '''                try:
                        mcp_response = await search_arxiv(query=arxiv_query, limit=10)'''
        replacement3 = '''                try:
                        sort_by = "submittedDate" if start_date or end_date else "relevance"
                        fetch_limit = 40 if start_date or end_date else 10
                        mcp_response = await search_arxiv(
                            query=arxiv_query, limit=fetch_limit, sort_by=sort_by, start_date=start_date, end_date=end_date
                        )'''
        content = content.replace(target3, replacement3)

        with open("app/agentic.py", "w", encoding="utf-8") as f:
            f.write(content)
            
if __name__ == "__main__":
    patch_agentic()
    print("Done")
