import { oneOrNone } from '../../db/query.js';

export async function findProfileById(userId) {
  return oneOrNone(
    `
      select
        id,
        full_name,
        role,
        subscription_status,
        department_id,
        username,
        email,
        phone,
        first_name,
        last_name,
        school_name,
        registration_stage,
        pending_plan_id,
        pending_plan_snapshot,
        pending_plan_selected_at,
        pending_checkout_reference,
        default_subscription_id,
        created_at,
        updated_at,
        last_seen_at
      from public.profiles
      where id = $1
    `,
    [userId]
  );
}

export async function updateProfileById(userId, updates) {
  const assignments = [];
  const values = [userId];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    values.push(value);
    assignments.push(`${key} = $${values.length}`);
  }

  if (!assignments.length) {
    return findProfileById(userId);
  }

  values.push(new Date().toISOString());
  assignments.push(`updated_at = $${values.length}`);

  return oneOrNone(
    `
      update public.profiles
      set ${assignments.join(', ')}
      where id = $1
      returning
        id,
        full_name,
        role,
        subscription_status,
        department_id,
        username,
        email,
        phone,
        first_name,
        last_name,
        school_name,
        registration_stage,
        pending_plan_id,
        pending_plan_snapshot,
        pending_plan_selected_at,
        pending_checkout_reference,
        default_subscription_id,
        created_at,
        updated_at,
        last_seen_at
    `,
    values
  );
}
