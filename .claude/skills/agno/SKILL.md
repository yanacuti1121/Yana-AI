---
name: agno
description: Build production AI agents with Agno (formerly Phidata) — define Agent with model/tools/instructions/memory/knowledge, compose Agent Teams with coordinator routing, add Storage for persistence, and integrate RAG via built-in KnowledgeBase with PDF/URL/text sources.
triggers:
  - "agno"
  - "phidata"
  - "agno agent"
  - "agno team"
  - "agno knowledge"
  - "agno storage"
  - "agno memory"
  - "phi agent"
  - "agent team coordinator"
  - "agent with knowledge base"
  - "agno tools"
  - "agno model"
do_not_use_for:
  - State graph agents — use langgraph instead
  - Multi-agent role crews — use crewai instead
  - LLM fine-tuning — use llamafactory instead
see_also:
  - crewai
  - langgraph
  - mem0
---

# Agno — Production AI Agent Framework

**Source:** agno-agi/agno (Mozilla PL) — formerly Phidata; full-stack agent framework

## Why Agno

- **One unified API** for agents, teams, memory, knowledge, storage, tools
- **Agent Teams**: coordinator routes tasks to specialized sub-agents
- **Built-in RAG**: KnowledgeBase with PDF, URL, text, database sources
- **Persistent storage**: PostgreSQL, SQLite, MongoDB for long-term memory
- **Playground UI**: `agent.serve()` launches a ready-made web UI

## Install

```bash
pip install agno
pip install agno[anthropic]   # Anthropic Claude
pip install agno[openai]      # OpenAI
pip install agno[all]         # everything
```

## Minimal Agent

```python
from agno.agent import Agent
from agno.models.anthropic import Claude

agent = Agent(
    model=Claude(id="claude-sonnet-4-5"),
    instructions="You are a helpful assistant.",
    markdown=True,
)

agent.print_response("What is quantum computing?")

# Or get structured response
response = agent.run("Explain RAG in 3 bullets")
print(response.content)
```

## Agent with Tools

```python
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.yfinance import YFinanceTools
from agno.tools.python import PythonTools

agent = Agent(
    model=Claude(id="claude-sonnet-4-5"),
    tools=[
        DuckDuckGoTools(),
        YFinanceTools(stock_price=True, analyst_recommendations=True),
        PythonTools(),
    ],
    instructions=[
        "Use DuckDuckGo to search for recent news",
        "Use YFinance for stock data",
        "Always cite your sources",
    ],
    show_tool_calls=True,
    markdown=True,
)

agent.print_response("What is Apple's current stock price and recent news?")
```

## Memory & Storage

```python
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.memory.db.sqlite import SqliteMemoryDb
from agno.storage.sqlite import SqliteStorage

# Memory: stores facts about users across sessions
# Storage: stores the full conversation history

agent = Agent(
    model=Claude(id="claude-sonnet-4-5"),
    # Persistent memory (facts extracted from conversations)
    memory=SqliteMemoryDb(table_name="agent_memory", db_file="agent.db"),
    enable_user_memories=True,
    # Persistent storage (full chat history)
    storage=SqliteStorage(table_name="agent_sessions", db_file="agent.db"),
    add_history_to_messages=True,
    num_history_runs=3,  # last 3 runs included in context
)

# First session
agent.print_response("My name is Alice and I love hiking.", user_id="alice")

# New session — memory persists
agent.print_response("What do you know about me?", user_id="alice")
```

## Knowledge Base (RAG)

```python
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.knowledge.pdf import PDFKnowledgeBase
from agno.knowledge.url import URLKnowledgeBase
from agno.knowledge.text import TextKnowledgeBase
from agno.vectordb.pgvector import PgVector
from agno.embedder.openai import OpenAIEmbedder

# Vector DB for knowledge
vector_db = PgVector(
    table_name="agent_knowledge",
    db_url="postgresql://user:pass@localhost/db",
    embedder=OpenAIEmbedder(id="text-embedding-3-small"),
)

# Load PDFs into knowledge base
knowledge = PDFKnowledgeBase(
    path="docs/",                   # directory of PDFs
    vector_db=vector_db,
)
knowledge.load(recreate=False)      # recreate=True to reindex

agent = Agent(
    model=Claude(id="claude-sonnet-4-5"),
    knowledge=knowledge,
    search_knowledge=True,          # auto-search on every query
    instructions="Answer from the knowledge base. Cite sources.",
)

agent.print_response("What does the document say about authentication?")
```

## Agent Teams

```python
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.team import Team
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.yfinance import YFinanceTools

web_agent = Agent(
    name="Web Researcher",
    role="Search the web for information",
    model=Claude(id="claude-sonnet-4-5"),
    tools=[DuckDuckGoTools()],
    instructions="Always include sources",
)

finance_agent = Agent(
    name="Finance Analyst",
    role="Analyze financial data and markets",
    model=Claude(id="claude-sonnet-4-5"),
    tools=[YFinanceTools(stock_price=True, analyst_recommendations=True)],
    instructions="Provide data-backed analysis",
)

# Team with coordinator routing
team = Team(
    name="Research Team",
    mode="coordinate",              # coordinator decides which agent to use
    model=Claude(id="claude-opus-4-5"),  # coordinator model
    members=[web_agent, finance_agent],
    instructions="Coordinate agents to provide comprehensive research",
)

team.print_response("What are the latest AI trends and their market impact?")
```

## Structured Output

```python
from pydantic import BaseModel
from agno.agent import Agent
from agno.models.anthropic import Claude

class MovieSummary(BaseModel):
    title: str
    director: str
    year: int
    genre: list[str]
    summary: str

agent = Agent(
    model=Claude(id="claude-sonnet-4-5"),
    response_model=MovieSummary,
)

movie: MovieSummary = agent.run("Tell me about Inception").content
print(movie.title, movie.director, movie.year)
```

## Async Agent

```python
import asyncio
from agno.agent import Agent
from agno.models.anthropic import Claude

agent = Agent(model=Claude(id="claude-sonnet-4-5"))

async def main():
    response = await agent.arun("Explain neural networks")
    print(response.content)

    async for chunk in await agent.astream("Write a poem"):
        print(chunk.content, end="", flush=True)

asyncio.run(main())
```

## Playground (Web UI)

```python
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.playground import Playground, serve_playground_app

agent = Agent(
    name="My Assistant",
    model=Claude(id="claude-sonnet-4-5"),
    markdown=True,
)

# Launch web UI at http://localhost:7777
app = Playground(agents=[agent]).get_app()
serve_playground_app("main:app", reload=True)
```

## Built-in Tools

```python
from agno.tools.duckduckgo import DuckDuckGoTools       # web search
from agno.tools.yfinance import YFinanceTools           # stock data
from agno.tools.python import PythonTools               # run Python code
from agno.tools.shell import ShellTools                 # shell commands
from agno.tools.file import FileTools                   # file operations
from agno.tools.github import GitHubTools               # GitHub API
from agno.tools.slack import SlackTools                 # Slack messages
from agno.tools.newspaper import NewspaperTools         # article extraction
from agno.tools.arxiv import ArxivTools                 # arXiv papers
from agno.tools.calculator import CalculatorTools       # math
from agno.tools.email import EmailTools                 # send email
from agno.tools.sql import SQLTools                     # SQL queries
from agno.tools.docker import DockerTools               # Docker ops
```

## Anti-Fake-Pass Checks

- [ ] `agent.run()` returns `RunResponse` — content at `.content`, not `.text` or `.data`
- [ ] `enable_user_memories=True` requires both `memory` AND `user_id` at run time
- [ ] `knowledge.load()` must be called before first query — not lazy-loaded automatically
- [ ] Team `mode="coordinate"` uses a coordinator LLM — requires `model` on Team, not just members
- [ ] `search_knowledge=True` makes agent automatically search; `knowledge.search()` is manual
- [ ] `add_history_to_messages=True` requires `storage` to be set
