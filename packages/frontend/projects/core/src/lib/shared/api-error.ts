/** Fallback text; replaced with the translated one once localization has loaded (see AppComponent). */
let fallback = 'Something went wrong. Try again.';
export const setApiErrorFallback = (text: string) => (fallback = text);

/** Human message from an ABP error response (validation errors first; ABP localizes server messages). */
export function apiError(e: unknown): string {
  const err = (e as { error?: { error?: { message?: string; details?: string; validationErrors?: { message?: string }[] } } })?.error?.error;
  const validation = err?.validationErrors?.map(v => v.message).filter(Boolean).join(' ');
  return validation || err?.message || fallback;
}
