export function safeError(error) {
  return String(error?.message || error).slice(0, 800);
}
