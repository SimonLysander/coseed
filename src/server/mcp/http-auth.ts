import fastifyBearerAuth from '@fastify/bearer-auth';
import type { FastifyInstance } from 'fastify';
import type {
  ProjectKeysService,
  ProjectMcpAccess,
} from '../modules/project-access/project-keys.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    mcpAccess: ProjectMcpAccess | null;
  }
}

export async function protectProjectMcp(server: FastifyInstance, keys: ProjectKeysService) {
  server.decorateRequest('mcpAccess', null);
  await server.register(fastifyBearerAuth, {
    addHook: false,
    keys: [],
    specCompliance: 'rfc6749',
    verifyErrorLogLevel: 'debug',
    auth: (token, request) => {
      request.mcpAccess = keys.authenticate(token) ?? null;
      return request.mcpAccess !== null;
    },
  });

  const verify = server.verifyBearerAuth!;
  server.addHook('onRequest', (request, reply, done) => {
    if (request.method !== 'POST' || request.routeOptions.url !== '/mcp') return done();
    verify(request, reply, (error) => {
      if (!error || reply.statusCode !== 401) return done(error);
      void reply
        .header('WWW-Authenticate', 'Bearer realm="CoSeed"')
        .header('Cache-Control', 'no-store')
        .send({ error: '请在 CoSeed 工作台取得有效的项目 Key。' });
    });
  });
}
