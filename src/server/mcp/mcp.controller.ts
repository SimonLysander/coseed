import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { McpToolsService } from './tools.service.js';

@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);
  constructor(@Inject(McpToolsService) private readonly tools: McpToolsService) {}

  @Post()
  async handle(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const server = this.tools.createServer();
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      reply.hijack();
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (error) {
      this.logger.error('MCP 请求处理失败', error instanceof Error ? error.stack : String(error));
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: 'MCP 服务内部错误' },
          }),
        );
      } else if (!reply.raw.writableEnded) {
        reply.raw.destroy(error instanceof Error ? error : undefined);
      }
    } finally {
      await server.close();
    }
  }

  @Get()
  @HttpCode(405)
  @Header('Allow', 'POST')
  rejectGet(): object {
    return this.methodNotAllowed();
  }

  @Delete()
  @HttpCode(405)
  @Header('Allow', 'POST')
  rejectDelete(): object {
    return this.methodNotAllowed();
  }

  private methodNotAllowed(): object {
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'Method not allowed: stateless HTTP transport' },
    };
  }
}
