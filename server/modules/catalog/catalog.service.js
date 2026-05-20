import { notFound } from '../../utils/httpError.js';
import { findPlanById, listProductPlanRows } from './catalog.repo.js';

export async function listCatalogProducts() {
  return {
    rows: await listProductPlanRows(),
  };
}

export async function getCatalogPlan(planId) {
  const row = await findPlanById(planId);
  if (!row) throw notFound('Selected subscription plan was not found.');

  return {
    id: row.id,
    planId: row.id,
    plan_code: row.code,
    code: row.code,
    name: row.name,
    price: row.price,
    currency: row.currency,
    metadata: row.metadata || {},
    duration_days: row.duration_days,
    quiz_duration_minutes: row.quiz_duration_minutes,
    daily_question_limit: row.daily_question_limit,
    product: row.product_id
      ? {
          id: row.product_id,
          code: row.product_code,
          name: row.product_name,
          department_id: row.department_id,
          department_name: row.department_name,
          department_slug: row.department_slug,
          color_theme: row.color_theme,
        }
      : null,
  };
}
