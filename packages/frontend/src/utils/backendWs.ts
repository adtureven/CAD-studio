const LOCAL_HOSTS = new Set(["0.0.0.0", "127.0.0.1", "localhost", "::1"]);

export function getBackendWsUrl(path: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const { hostname, host, port } = window.location;

  if (!port || port === "8003") {
    return `${protocol}//${host}${normalizedPath}`;
  }

  const backendHostname = LOCAL_HOSTS.has(hostname) ? "127.0.0.1" : hostname;
  return `${protocol}//${backendHostname}:8003${normalizedPath}`;
}
