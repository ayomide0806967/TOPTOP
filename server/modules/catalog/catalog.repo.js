import { oneOrNone, query } from '../../db/query.js';

export async function listProductPlanRows() {
  const result = await query(`
    select *
    from public.subscription_products_with_plans
    order by department_name asc nulls last, price asc nulls last
  `);
  return result.rows;
}

export async function findPlanById(planId) {
  return oneOrNone(
    `
      select
        sp.id,
        sp.code,
        sp.name,
        sp.price,
        sp.currency,
        sp.metadata,
        sp.duration_days,
        sp.quiz_duration_minutes,
        sp.daily_question_limit,
        p.id as product_id,
        p.code as product_code,
        p.name as product_name,
        p.department_id,
        p.color_theme,
        d.name as department_name,
        d.slug as department_slug
      from public.subscription_plans sp
      left join public.subscription_products p on p.id = sp.product_id
      left join public.departments d on d.id = p.department_id
      where sp.id = $1
      limit 1
    `,
    [planId]
  );
}
