import {
  AmendTradeSchema,
  CancelTradeSchema,
  CreateTradeSchema,
  PositionSchema,
  TradeHistoryEntrySchema,
  TradeIdParamsSchema,
  TradeListQuerySchema,
  TradeListResponseSchema,
  TradeSchema,
} from '@trade-blotter/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TradeService } from '../trades/tradeService';

export const tradeRoutes: FastifyPluginAsyncZod<{ service: TradeService }> = async (
  app,
  { service },
) => {
  app.get(
    '/trades',
    { schema: { querystring: TradeListQuerySchema, response: { 200: TradeListResponseSchema } } },
    (request) => service.list(request.query),
  );

  app.get(
    '/trades/:id',
    { schema: { params: TradeIdParamsSchema, response: { 200: TradeSchema } } },
    (request) => service.get(request.params.id),
  );

  app.post(
    '/trades',
    { schema: { body: CreateTradeSchema, response: { 201: TradeSchema } } },
    async (request, reply) => reply.code(201).send(await service.create(request.body)),
  );

  app.patch(
    '/trades/:id',
    {
      schema: {
        params: TradeIdParamsSchema,
        body: AmendTradeSchema,
        response: { 200: TradeSchema },
      },
    },
    (request) => service.amend(request.params.id, request.body),
  );

  app.post(
    '/trades/:id/cancel',
    {
      schema: {
        params: TradeIdParamsSchema,
        body: CancelTradeSchema,
        response: { 200: TradeSchema },
      },
    },
    (request) => service.cancel(request.params.id, request.body),
  );

  app.get(
    '/trades/:id/history',
    {
      schema: { params: TradeIdParamsSchema, response: { 200: z.array(TradeHistoryEntrySchema) } },
    },
    (request) => service.history(request.params.id),
  );

  app.get('/positions', { schema: { response: { 200: z.array(PositionSchema) } } }, () =>
    service.positions(),
  );
};
