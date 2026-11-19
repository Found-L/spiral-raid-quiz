// Both public entrances use one score service and the same player data.
export function quizProxyRequest(request) {
  const target = new URL(request.url);
  if (!target.pathname.startsWith('/api/')) return null;
  target.protocol = 'https:';
  target.host = 'www.lysue.com';
  target.pathname = '/spiral-raid-quiz' + target.pathname;
  const forwarded = new Request(target, request);
  forwarded.headers.delete('host');
  return forwarded;
}
