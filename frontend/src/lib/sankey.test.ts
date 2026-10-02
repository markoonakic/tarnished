import { describe, expect, it } from 'vitest';
import type { SankeyNode } from './analytics';
import { groupSankey } from './sankey';

const node = (app: string, step: number, meaning: string): SankeyNode => ({
  id: `${app}-${step}`,
  application_id: app,
  meaning,
  name: meaning,
  value: 1,
  entered_at: new Date(Date.UTC(2026, 0, step + 1)).toISOString(),
});

describe('groupSankey', () => {
  it('combines matching recorded steps across applications without merging return visits', () => {
    const nodes = ['a', 'b'].flatMap((app) =>
      ['applied', 'screening', 'applied', 'interviewing'].map((stage, step) =>
        node(app, step, stage)
      )
    );
    const links = ['a', 'b'].flatMap((app) =>
      [0, 1, 2].map((step) => ({
        source: `${app}-${step}`,
        target: `${app}-${step + 1}`,
        value: 1,
      }))
    );
    const result = groupSankey({ nodes: [...nodes].reverse(), links });
    expect(result.nodes).toHaveLength(4);
    expect(result.nodes.map((n) => n.value)).toEqual([2, 2, 2, 2]);
    expect(
      result.nodes.filter((n) => n.meaning === 'applied').map((n) => n.depth)
    ).toEqual([0, 2]);
    expect(result.links.map((l) => l.value)).toEqual([2, 2, 2]);
    for (const link of result.links) {
      expect(
        result.nodes.find((n) => n.id === link.source)!.depth
      ).toBeLessThan(result.nodes.find((n) => n.id === link.target)!.depth);
    }
    expect(nodes[0].id).toBe('a-0');
  });

  it('keeps missing links missing and does not merge equal labels with different meanings', () => {
    const nodes = [
      node('a', 0, 'applied'),
      node('a', 1, 'screening'),
      node('a', 2, 'offer'),
      { ...node('b', 0, 'unknown'), name: 'applied' },
    ];
    const result = groupSankey({
      nodes,
      links: [{ source: 'a-0', target: 'a-1', value: 1 }],
    });
    expect(result.nodes).toHaveLength(4);
    expect(result.links).toHaveLength(1);
    const offer = result.nodes.find((n) => n.meaning === 'offer')!;
    expect(
      result.links.some((l) => l.target === offer.id || l.source === offer.id)
    ).toBe(false);
    expect(result.nodes.filter((n) => n.label === 'applied')).toHaveLength(2);
  });
});
