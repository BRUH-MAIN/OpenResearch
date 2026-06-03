from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig

@tool
def my_tool(query: str, config: RunnableConfig):
    """Retrieves things."""
    return query + config["configurable"]["group_id"]

print(my_tool.args_schema.schema())
