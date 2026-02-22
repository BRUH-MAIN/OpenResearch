import re
with open("tests/test_agentic.py", "r") as f:
    text = f.read()

text = text.replace('config={\\"configurable\\": {\\"group_id\\":', 'config={"configurable": {"group_id":')
text = text.replace(', \\"user_id\\":', ', "user_id":')
text = text.replace('}}', '}}')

with open("tests/test_agentic.py", "w") as f:
    f.write(text)
