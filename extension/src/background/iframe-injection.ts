/** Cross-origin scanner injection is unsupported. */
export function handleIframeInjectionRequest(_frameSrc: string): {
  success: false;
  reason: 'unsupported';
} {
  return { success: false, reason: 'unsupported' };
}
