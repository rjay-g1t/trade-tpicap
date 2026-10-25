import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { errorHandler, notFoundHandler } from './http/errorHandler';
import { eventRoutes, type EventRoutesOptions } from './http/eventRoutes';
import { tradeRoutes } from './http/tradeRoutes';
import type { TradeEventBus } from './trades/tradeEventBus';
import type { TradeService } from './trades/tradeService';

export interface AppDeps {
  service: TradeService;
  bus: TradeEventBus;
  logger?: FastifyServerOptions['logger'];
  events?: Pick<EventRoutesOptions, 'replayLimit' | 'heartbeatMs'>;
}

export async function buildApp({ service, bus, logger = false, events = {} }: AppDeps) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // Polled by container health checks, so its requests aren't logged.
  app.get('/health', { logLevel: 'silent' }, () => ({ status: 'ok' }));
  await app.register(tradeRoutes, { prefix: '/api', service });
  await app.register(eventRoutes, { prefix: '/api', service, bus, ...events });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
