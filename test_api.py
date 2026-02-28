import requests
import json
import uuid

# Replace with an actual group_id and paper_id if known, or use random UUIDs to hit the parsing logic
group_id = "1cb46d5e-448a-436a-89cf-ca4e9307a45c"  # From logs
paper_id = "1cb46d5e-448a-436a-89cf-ca4e9307a45c"

try:
    print("Testing /papers/summarize...")
    r = requests.post("http://localhost:8000/papers/summarize", json={
        "group_id": group_id,
        "paper_id": paper_id,
        "trigger": "@ai"
    })
    print(r.status_code, r.text)
except Exception as e:
    print("Error:", e)

try:
    print("Testing /reports/group/{group_id}/generate...")
    r = requests.post(f"http://localhost:8000/reports/group/{group_id}/generate", json={
        "group_id": group_id,
        "user_id": str(uuid.uuid4())
    })
    print(r.status_code, r.text)
except Exception as e:
    print("Error:", e)
