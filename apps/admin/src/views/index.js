import { dashboardView } from './dashboard.js';
import { departmentsView } from './departments.js';
import { subscriptionsView } from './subscriptions.js';
import { usersView } from './users.js';
import { questionsView } from './questions.js';

export const viewRegistry = {
  dashboard: dashboardView,
  departments: departmentsView,
  subscriptions: subscriptionsView,
  users: usersView,
  questions: questionsView,
};
