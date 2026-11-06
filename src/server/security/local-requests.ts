import type { FastifyInstance } from 'fastify';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function protectLocalRequests(server: FastifyInstance): void {
  server.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host;
    try {
      if (!host || !loopbackHosts.has(new URL(`http://${host}`).hostname)) {
        return reply.code(403).send({ message: '仅允许本机访问' });
      }
      // Localhost HTTP endpoints still need protection from foreign web origins.
      const origin = request.headers.origin;
      if (origin && new URL(origin).origin !== new URL(`http://${host}`).origin) {
        return reply.code(403).send({ message: '请求来源不受支持' });
      }
    } catch {
      return reply.code(403).send({ message: '请求来源无效' });
    }
  });
}
