function redact(message) {
  return message
    .replace(/\b(Bearer|Basic)\s+\S+/gi, '$1 [redacted]')
    .replace(/([?&](?:X-Amz-[A-Za-z0-9-]+|signature|sig|token|access_token|key)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(\b(?:CLOUDFLARE_API_TOKEN|CF_ACCESS_CLIENT_SECRET|access_token|refresh_token|api[_-]?(?:key|token)|password|secret)\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]');
}

export function withCloudflareDiagnostics(fetchImpl, report) {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    if (response.ok) return response;
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== 'api.cloudflare.com' || !url.pathname.includes('/workers/')) return response;
    const payload = await response.clone().json().catch(() => null);
    const messages = Array.isArray(payload?.errors)
      ? payload.errors.map((error) => typeof error?.message === 'string' ? error.message : '').filter(Boolean)
      : [];
    if (messages.length > 0) {
      report(`Cloudflare API ${response.status} ${url.pathname}: ${redact(messages.join(' ')).slice(0, 4096)}`);
    }
    return response;
  };
}

const entry = process.argv[1]?.replaceAll('\\', '/');
if ((entry?.endsWith('/void/dist/cli/cli.mjs') || entry?.endsWith('/.bin/void')) && process.argv[2] === 'deploy') {
  globalThis.fetch = withCloudflareDiagnostics(globalThis.fetch, console.error);
}
