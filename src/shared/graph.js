(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FigyGraph = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function validate(plan) {
    if (!plan || !Array.isArray(plan.nodes) || !Array.isArray(plan.connections)) throw new Error("The flow is incomplete. Please retry.");
    if (plan.nodes.length < 2 || plan.nodes.length > 80 || plan.connections.length > 160) throw new Error("Use between 2 and 80 steps and at most 160 connections.");
    const ids = new Set();
    for (const node of plan.nodes) {
      if (!node || typeof node.id !== "string" || !node.id || ids.has(node.id)) throw new Error("The flow contains missing or duplicate step IDs.");
      if (typeof node.label !== "string" || !node.label.trim() || node.label.length > 300) throw new Error("Every step needs a short readable label.");
      ids.add(node.id);
    }
    const outgoing = new Map([...ids].map(id => [id, []]));
    const incoming = new Map([...ids].map(id => [id, []]));
    for (const edge of plan.connections) {
      if (!edge || !ids.has(edge.from) || !ids.has(edge.to)) throw new Error("A connection references a missing step.");
      outgoing.get(edge.from).push(edge.to);
      incoming.get(edge.to).push(edge.from);
    }
    const starts = plan.nodes.filter(n => /^(start|begin)$/.test(n.type) || !incoming.get(n.id).length);
    const ends = plan.nodes.filter(n => /^(end|finish|terminal)$/.test(n.type) || !outgoing.get(n.id).length);
    if (!starts.length || !ends.length) throw new Error("The flow needs an entry and a reachable outcome.");
    function visit(seeds, adjacency) {
      const seen = new Set();
      const pending = seeds.map(n => n.id);
      while (pending.length) {
        const id = pending.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        pending.push(...adjacency.get(id));
      }
      return seen;
    }
    if (visit(starts, outgoing).size !== ids.size || visit(ends, incoming).size !== ids.size) throw new Error("Some steps cannot be reached or cannot reach an outcome.");
    for (const node of plan.nodes) {
      if (/decision|choice|condition/.test(node.type)) {
        const edges = plan.connections.filter(e => e.from === node.id);
        if (new Set(edges.map(e => e.to)).size < 2 || edges.some(e => !String(e.label || "").trim())) throw new Error("Every decision needs at least two labeled paths.");
      }
      if (/^(end|finish|terminal)$/.test(node.type) && outgoing.get(node.id).length) throw new Error("An end step cannot have outgoing connections.");
    }
    return plan;
  }
  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }
  return { validate, finite };
});
