// The desktop Agent surface is a projection of `/api/agents`, which reads
// `core/agents/` frontmatter. It deliberately has no local agent registry or
// execution state: assignment and activity remain runtime-owned until their
// event envelopes carry an agent identity.
export function normalizeAgentCatalog(payload) {
  if (!payload || !Array.isArray(payload.agents)) return [];
  return payload.agents
    .filter((agent) => (
      agent
      && typeof agent.name === 'string'
      && typeof agent.description === 'string'
      && typeof agent.category === 'string'
    ))
    .map((agent) => ({
      name: agent.name,
      description: agent.description,
      category: agent.category,
    }));
}

export function filterAgentCatalog(agents, query, category = 'all') {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
  return agents.filter((agent) => {
    if (category !== 'all' && agent.category !== category) return false;
    if (!normalizedQuery) return true;
    return `${agent.name} ${agent.description} ${agent.category}`.toLocaleLowerCase().includes(normalizedQuery);
  });
}

export function groupAgentsByCategory(agents) {
  const grouped = new Map();
  for (const agent of agents) {
    const current = grouped.get(agent.category) || [];
    current.push(agent);
    grouped.set(agent.category, current);
  }
  return [...grouped.entries()].sort(([first], [second]) => first.localeCompare(second));
}
