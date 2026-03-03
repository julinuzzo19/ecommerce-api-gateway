export function stripSensitiveResponseHeaders(proxyRes: any, req: any) {
  if (!proxyRes || !proxyRes.headers) return;
  // Siempre limpiar secretos y datos internos
  delete proxyRes.headers["x-gateway-secret"];
  delete proxyRes.headers["x-user-id"];
  delete proxyRes.headers["x-user-email"];
  delete proxyRes.headers["x-user-role"];
  delete proxyRes.headers["authorization"];
}
