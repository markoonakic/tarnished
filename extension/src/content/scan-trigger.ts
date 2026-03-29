function isFormScanNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) {
    return false;
  }

  return (
    node.tagName === 'INPUT' ||
    node.tagName === 'TEXTAREA' ||
    node.tagName === 'IFRAME' ||
    Boolean(node.querySelector('input, textarea, iframe'))
  );
}

export function shouldScheduleFormRescan(mutations: MutationRecord[]): boolean {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length === 0) {
      continue;
    }

    for (const node of mutation.addedNodes) {
      if (isFormScanNode(node)) {
        return true;
      }
    }
  }

  return false;
}
