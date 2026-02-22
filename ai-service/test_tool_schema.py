import asyncio
from typing import Optional
from langchain_core.tools import tool

class MockService:
    async def _tool_retrieve_papers(self, query: str, group_id: Optional[str] = None) -> str:
        """Retrieves academic papers based on a query.
        
        Args:
            query: The search query
            group_id: Optional group ID
        """
        return "papers"

    def get_tool(self):
        return tool(self._tool_retrieve_papers)

service = MockService()
t = service.get_tool()
print("Tool Name:", t.name)
if hasattr(t, "args_schema") and t.args_schema:
    print("Tool Args Schema:", t.args_schema.schema())
else:
    print("Tool Args Dict:", t.args)
print("Tool Description:", t.description)
