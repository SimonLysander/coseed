import { Controller, Get, Header, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { standaloneGuide } from './document.js';

@Controller()
export class AgentGuideController {
  @Get('agent-writing-guide.md')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Content-Disposition', 'inline; filename="agent-writing-guide.md"')
  getMarkdown(@Req() request: FastifyRequest): string {
    const origin = new URL(`${request.protocol}://${request.host}`).origin;
    return standaloneGuide(new URL('/mcp', origin).href);
  }
}
