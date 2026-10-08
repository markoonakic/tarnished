import type { SankeyData, SankeyNode } from './analytics';

// Combine matching stages at the same recorded step. A later return to a stage
// stays in a later column, so repeated stages cannot create a Sankey cycle.
// Only server-supplied links are grouped; missing history is never bridged.
export function groupSankey(data: Pick<SankeyData, 'nodes' | 'links'>) {
  const byApplication = new Map<string, SankeyNode[]>();
  for (const node of data.nodes) {
    const path = byApplication.get(node.application_id) ?? [];
    path.push(node);
    byApplication.set(node.application_id, path);
  }
  const groups = new Map<
    string,
    {
      id: string;
      label: string;
      builtin_key?: string | null;
      meaning: string;
      color?: string;
      depth: number;
      value: number;
    }
  >();
  const eventGroup = new Map<string, string>();
  for (const path of byApplication.values()) {
    path.sort(
      (a, b) =>
        Date.parse(a.entered_at) - Date.parse(b.entered_at) ||
        a.id.localeCompare(b.id)
    );
    path.forEach((node, depth) => {
      const id = JSON.stringify([
        depth,
        node.meaning,
        node.name,
        node.builtin_key,
      ]);
      const group = groups.get(id) ?? {
        id,
        label: node.name,
        builtin_key: node.builtin_key,
        meaning: node.meaning,
        color: node.color,
        depth,
        value: 0,
      };
      group.value += node.value ?? 1;
      groups.set(id, group);
      eventGroup.set(node.id, id);
    });
  }
  const links = new Map<
    string,
    { source: string; target: string; value: number }
  >();
  for (const link of data.links) {
    const source = eventGroup.get(link.source);
    const target = eventGroup.get(link.target);
    if (!source || !target) continue;
    const key = JSON.stringify([source, target]);
    const grouped = links.get(key) ?? { source, target, value: 0 };
    grouped.value += link.value;
    links.set(key, grouped);
  }
  return { nodes: [...groups.values()], links: [...links.values()] };
}
