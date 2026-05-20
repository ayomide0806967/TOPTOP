import { Hono } from 'hono';
import { requireAdmin } from '../auth/requireSession.js';
import { badRequest } from '../utils/httpError.js';
import {
  adminUpdateUser,
  createCourse,
  createDepartment,
  createGlobalAnnouncement,
  createQuestion,
  createSubscriptionPlan,
  createSubscriptionProduct,
  createTopic,
  deleteCourse,
  deleteDepartment,
  deleteGlobalAnnouncement,
  deleteQuestion,
  deleteSubscriptionPlan,
  deleteSubscriptionProduct,
  deleteTopic,
  deleteUser,
  generateBulkCredentials,
  getAdminStats,
  getCourse,
  getTopic,
  listCourses,
  listDepartments,
  listGlobalAnnouncements,
  listPlanLearners,
  listProfiles,
  listQuestions,
  listSubscriptionProductsDetailed,
  listTopics,
  updateCourse,
  updateDepartment,
  updateGlobalAnnouncement,
  updateQuestion,
  updateSubscriptionPlan,
  updateSubscriptionProduct,
  updateTopic,
  updateUserProfileStatus,
} from '../modules/admin/admin.service.js';

export const adminRoutes = new Hono();

adminRoutes.use('/admin/*', requireAdmin);

async function jsonBody(c) {
  return c.req.json().catch(() => ({}));
}

adminRoutes.get('/admin/me', (c) => {
  const context = c.get('auth');
  return c.json({ user: context.user, profile: context.profile });
});

adminRoutes.get('/admin/stats', async (c) => c.json(await getAdminStats()));

adminRoutes.get('/admin/departments', async (c) =>
  c.json({ departments: await listDepartments() })
);
adminRoutes.post('/admin/departments', async (c) =>
  c.json({ department: await createDepartment(await jsonBody(c)) }, 201)
);
adminRoutes.get('/admin/departments/:id/courses', async (c) =>
  c.json({ courses: await listCourses(c.req.param('id')) })
);
adminRoutes.patch('/admin/departments/:id', async (c) =>
  c.json({
    department: await updateDepartment(c.req.param('id'), await jsonBody(c)),
  })
);
adminRoutes.delete('/admin/departments/:id', async (c) => {
  await deleteDepartment(c.req.param('id'));
  return c.json({ ok: true });
});

adminRoutes.get('/admin/courses', async (c) =>
  c.json({ courses: await listCourses(c.req.query('departmentId')) })
);
adminRoutes.get('/admin/courses/:id', async (c) =>
  c.json({ course: await getCourse(c.req.param('id')) })
);
adminRoutes.post('/admin/courses', async (c) => {
  const body = await jsonBody(c);
  return c.json({ course: await createCourse(body.departmentId, body) }, 201);
});
adminRoutes.patch('/admin/courses/:id', async (c) =>
  c.json({ course: await updateCourse(c.req.param('id'), await jsonBody(c)) })
);
adminRoutes.delete('/admin/courses/:id', async (c) => {
  await deleteCourse(c.req.param('id'));
  return c.json({ ok: true });
});

adminRoutes.get('/admin/topics', async (c) =>
  c.json({ topics: await listTopics(c.req.query('courseId')) })
);
adminRoutes.get('/admin/topics/:id', async (c) =>
  c.json({ topic: await getTopic(c.req.param('id')) })
);
adminRoutes.post('/admin/topics', async (c) => {
  const body = await jsonBody(c);
  return c.json({ topic: await createTopic(body.courseId, body) }, 201);
});
adminRoutes.patch('/admin/topics/:id', async (c) =>
  c.json({ topic: await updateTopic(c.req.param('id'), await jsonBody(c)) })
);
adminRoutes.delete('/admin/topics/:id', async (c) => {
  await deleteTopic(c.req.param('id'));
  return c.json({ ok: true });
});

adminRoutes.get('/admin/questions', async (c) => {
  const topicId = c.req.query('topicId');
  if (!topicId) throw badRequest('topicId is required.');
  return c.json({ questions: await listQuestions(topicId) });
});
adminRoutes.post('/admin/questions', async (c) => {
  const body = await jsonBody(c);
  if (!body.topicId) throw badRequest('topicId is required.');
  return c.json({ question: await createQuestion(body.topicId, body) }, 201);
});
adminRoutes.patch('/admin/questions/:id', async (c) =>
  c.json({
    question: await updateQuestion(c.req.param('id'), await jsonBody(c)),
  })
);
adminRoutes.delete('/admin/questions/:id', async (c) => {
  await deleteQuestion(c.req.param('id'));
  return c.json({ ok: true });
});

adminRoutes.get('/admin/subscription-products', async (c) =>
  c.json({ products: await listSubscriptionProductsDetailed() })
);
adminRoutes.post('/admin/subscription-products', async (c) =>
  c.json({ product: await createSubscriptionProduct(await jsonBody(c)) }, 201)
);
adminRoutes.patch('/admin/subscription-products/:id', async (c) =>
  c.json({
    product: await updateSubscriptionProduct(
      c.req.param('id'),
      await jsonBody(c)
    ),
  })
);
adminRoutes.delete('/admin/subscription-products/:id', async (c) => {
  await deleteSubscriptionProduct(c.req.param('id'));
  return c.json({ ok: true });
});

adminRoutes.post('/admin/subscription-products/:id/plans', async (c) =>
  c.json(
    {
      plan: await createSubscriptionPlan(c.req.param('id'), await jsonBody(c)),
    },
    201
  )
);
adminRoutes.patch('/admin/subscription-plans/:id', async (c) =>
  c.json({
    plan: await updateSubscriptionPlan(c.req.param('id'), await jsonBody(c)),
  })
);
adminRoutes.delete('/admin/subscription-plans/:id', async (c) => {
  await deleteSubscriptionPlan(c.req.param('id'));
  return c.json({ ok: true });
});
adminRoutes.get('/admin/subscription-plans/:id/learners', async (c) =>
  c.json({ learners: await listPlanLearners(c.req.param('id')) })
);

adminRoutes.get('/admin/profiles', async (c) =>
  c.json({ profiles: await listProfiles() })
);
adminRoutes.patch('/admin/profiles/:id/status', async (c) => {
  const body = await jsonBody(c);
  return c.json({
    profile: await updateUserProfileStatus(c.req.param('id'), body.status),
  });
});
adminRoutes.patch('/admin/users/:id', async (c) => {
  const body = await jsonBody(c);
  return c.json({
    profile: await adminUpdateUser({ ...body, userId: c.req.param('id') }),
  });
});
adminRoutes.delete('/admin/users/:id', async (c) => {
  await deleteUser(c.req.param('id'));
  return c.json({ ok: true });
});
adminRoutes.post('/admin/users/bulk-credentials', async (c) =>
  c.json({
    accounts: await generateBulkCredentials(
      await jsonBody(c),
      c.req.raw.headers
    ),
  })
);

adminRoutes.get('/admin/announcements', async (c) =>
  c.json({ announcements: await listGlobalAnnouncements() })
);
adminRoutes.post('/admin/announcements', async (c) => {
  const context = c.get('auth');
  return c.json(
    {
      announcement: await createGlobalAnnouncement(
        await jsonBody(c),
        context.user.id
      ),
    },
    201
  );
});
adminRoutes.patch('/admin/announcements/:id', async (c) =>
  c.json({
    announcement: await updateGlobalAnnouncement(
      c.req.param('id'),
      await jsonBody(c)
    ),
  })
);
adminRoutes.delete('/admin/announcements/:id', async (c) => {
  await deleteGlobalAnnouncement(c.req.param('id'));
  return c.json({ ok: true });
});
