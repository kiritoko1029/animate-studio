const workspaceKey = 'animate-studio-cloud-workspace';

export function fetchPageApi(path: '/api/page' | '/api/validate', options?: RequestInit) {
  const headers = new Headers(options?.headers);
  if (import.meta.env.MODE === 'cloudflare') {
    // Generate synchronously so StrictMode's repeated load shares one workspace.
    // Never silently replace an existing key: that would hide the saved page.
    let workspace = localStorage.getItem(workspaceKey);
    if (!workspace) {
      workspace = crypto.randomUUID();
      localStorage.setItem(workspaceKey, workspace);
    }
    headers.set('X-Studio-Workspace', workspace);
  }
  return fetch(path, { ...options, headers });
}
