---
name: terminal--notion
description: >-
  >-
origin: "github.com/TerminalSkills/skills (skill: notion)"
license: Apache-2.0
version: "1.0.0"
compatibility: "yana-ai >= 0.14.0"
---

# Notion API Integration

Build automations and integrations with Notion workspaces using the official REST API.

## Authentication

### Internal Integration (own workspace)

Create an integration at https://www.notion.so/my-integrations, copy the token, and share target pages/databases with the integration.

```bash
export NOTION_TOKEN="ntn_..."
```

### Public Integration (OAuth)

For multi-user apps, implement the OAuth flow using the authorization URL `https://api.notion.com/v1/oauth/authorize` and exchange the code at `https://api.notion.com/v1/oauth/token` with Basic auth (base64-encoded `client_id:client_secret`).

## Core API Patterns

All requests use `Notion-Version: 2022-06-28` header and Bearer token auth.

### Database Operations

```python
"""notion_db.py — Query, create, and update Notion databases."""
import requests

API = "https://api.notion.com/v1"
HEADERS = {
    "Authorization": "Bearer ntn_...",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}

def query_database(database_id: str, filter_obj: dict = None, sorts: list = None) -> list:
    """Query a Notion database with optional filters and sorting.

    Args:
        database_id: UUID of the database (from URL or API).
        filter_obj: Notion filter object for narrowing results.
        sorts: List of sort objects (property + direction).

    Returns:
        List of page objects matching the query.
    """
    body = {}
    if filter_obj:
        body["filter"] = filter_obj
    if sorts:
        body["sorts"] = sorts

    pages = []
    has_more = True
    start_cursor = None

    while has_more:
        if start_cursor:
            body["start_cursor"] = start_cursor
        resp = requests.post(f"{API}/databases/{database_id}/query",
                             json=body, headers=HEADERS)
        data = resp.json()
        pages.extend(data["results"])
        has_more = data.get("has_more", False)
        start_cursor = data.get("next_cursor")

    return pages

def create_page(database_id: str, properties: dict, children: list = None) -> dict:
    """Create a new page (row) in a Notion database.

    Args:
        database_id: Target database UUID.
        properties: Property values matching database schema.
        children: Optional list of block objects for page content.
    """
    body = {
        "parent": {"database_id": database_id},
        "properties": properties,
    }
    if children:
        body["children"] = children
    resp = requests.post(f"{API}/pages", json=body, headers=HEADERS)
    return resp.json()

def update_page(page_id: str, properties: dict) -> dict:
    """Update properties of an existing page.

    Args:
        page_id: UUID of the page to update.
        properties: Property values to change.
    """
    resp = requests.patch(f"{API}/pages/{page_id}",
                          json={"properties": properties}, headers=HEADERS)
    return resp.json()
```

### Property Types

Common property value formats for `create_page` and `update_page`:

```python
# Property value examples for database pages
properties = {
    # Title (required — every database has one title property)
    "Name": {"title": [{"text": {"content": "New task"}}]},

    # Rich text
    "Description": {"rich_text": [{"text": {"content": "Details here"}}]},

    # Select (single choice)
    "Status": {"select": {"name": "In Progress"}},

    # Multi-select
    "Tags": {"multi_select": [{"name": "frontend"}, {"name": "urgent"}]},

    # Number
    "Story Points": {"number": 5},

    # Date (with optional end for ranges)
    "Due Date": {"date": {"start": "2025-03-15", "end": "2025-03-20"}},

    # Checkbox
    "Done": {"checkbox": True},

    # URL / Email / People / Relation
    "Link": {"url": "https://example.com"},
    "Assignee": {"people": [{"id": "user-uuid-here"}]},
    "Project": {"relation": [{"id": "related-page-uuid"}]},
}
```

### Block Operations

Pages are made of blocks. Append, read, or delete blocks to build page content:

```python
def append_blocks(page_id: str, blocks: list) -> dict:
    """Append content blocks to a page.

    Args:
        page_id: UUID of the page.
        blocks: List of block objects to append.
    """
    resp = requests.patch(f"{API}/blocks/{page_id}/children",
                          json={"children": blocks}, headers=HEADERS)
    return resp.json()

# Block examples
blocks = [
    # Heading
    {"type": "heading_2", "heading_2": {
        "rich_text": [{"text": {"content": "Sprint Summary"}}]
    }},
    # Paragraph
    {"type": "paragraph", "paragraph": {
        "rich_text": [{"text": {"content": "This sprint focused on..."}}]
    }},
    # Bulleted list
    {"type": "bulleted_list_item", "bulleted_list_item": {
        "rich_text": [{"text": {"content": "Shipped auth module"}}]
    }},
    # To-do
    {"type": "to_do", "to_do": {
        "rich_text": [{"text": {"content": "Write tests"}}],
        "checked": False,
    }},
    # Code block
    {"type": "code", "code": {
        "rich_text": [{"text": {"content": "console.log('hello')"}}],
        "language": "javascript",
    }},
]
```

### Search

```python
def search_workspace(query: str, object_type: str = None) -> list:
    """Search across all pages and databases in the workspace.

    Args:
        query: Search text.
        object_type: Optional filter — "page" or "database".
    """
    body = {"query": query}
    if object_type:
        body["filter"] = {"value": object_type, "property": "object"}
    resp = requests.post(f"{API}/search", json=body, headers=HEADERS)
    return resp.json()["results"]
```

## Pagination

All list endpoints return max 100 items. Always paginate:

```python
def get_all_blocks(block_id: str) -> list:
    """Retrieve all child blocks, handling pagination.

    Args:
        block_id: UUID of the parent block or page.
    """
    blocks, cursor = [], None
    while True:
        params = {"page_size": 100}
        if cursor:
            params["start_cursor"] = cursor
        resp = requests.get(f"{API}/blocks/{block_id}/children",
                            params=params, headers=HEADERS)
        data = resp.json()
        blocks.extend(data["results"])
        if not data.get("has_more"):
            break
        cursor = data["next_cursor"]
    return blocks
```

## Rate Limits

- **3 requests per second** per integration
- Implement exponential backoff on 429 responses
- Batch operations where possible (append multiple blocks in one call)

```python
import time

def safe_request(method, url, **kwargs):
    """Make a rate-limit-aware request with retry."""
    for attempt in range(5):
        resp = requests.request(method, url, headers=HEADERS, **kwargs)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", 2 ** attempt))
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    raise Exception("Rate limit exceeded after 5 retries")
```

## Common Patterns

### Sync External Data into Notion

```python
def sync_github_issues(database_id: str, issues: list[dict]):
    """Sync GitHub issues into a Notion database, updating existing or creating new.

    Args:
        database_id: Target Notion database.
        issues: List of dicts with keys: number, title, state, labels, url.
    """
    # Get existing pages to avoid duplicates
    existing = query_database(database_id)
    existing_numbers = {}
    for page in existing:
        num_prop = page["properties"].get("Issue #", {})
        if num_prop.get("number"):
            existing_numbers[int(num_prop["number"])] = page["id"]

    for issue in issues:
        props = {
            "Name": {"title": [{"text": {"content": issue["title"]}}]},
            "Issue #": {"number": issue["number"]},
            "Status": {"select": {"name": "Open" if issue["state"] == "open" else "Closed"}},
            "Labels": {"multi_select": [{"name": l} for l in issue["labels"]]},
            "URL": {"url": issue["url"]},
        }
        if issue["number"] in existing_numbers:
            update_page(existing_numbers[issue["number"]], props)
        else:
            create_page(database_id, props)
```

## Guidelines

- Always share pages/databases with your integration before accessing them
- Use database queries with filters instead of fetching all pages and filtering client-side
- Notion API returns rich text as arrays of text objects -- always join them for plain text
- Block children can be nested (toggle lists, columns) -- recurse when reading full pages
- The API does not support creating databases with all property types -- some (like rollup, formula) must be configured in the Notion UI
- Archive pages instead of deleting them (`update_page(id, {"archived": True})`)
