import { Hono } from 'hono';
import { badRequest } from '../utils/httpError.js';
import {
  getCatalogPlan,
  listCatalogProducts,
} from '../modules/catalog/catalog.service.js';

export const catalogRoutes = new Hono();

catalogRoutes.get('/catalog/products', async (c) => {
  return c.json(await listCatalogProducts());
});

catalogRoutes.get('/catalog/plans/:planId', async (c) => {
  const planId = c.req.param('planId');
  if (!planId) throw badRequest('Plan ID is required.');
  return c.json(await getCatalogPlan(planId));
});
