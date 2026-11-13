/** Human message from an ABP error response (validation errors first). */
export function apiError(e: unknown): string {
  const err = (e as { error?: { error?: { message?: string; details?: string; validationErrors?: { message?: string }[] } } })?.error?.error;
  const validation = err?.validationErrors?.map(v => v.message).filter(Boolean).join(' ');
  return validation || err?.message || 'Something went wrong. Try again.';
}
