import { dashboardView } from './dashboard.js';
import { departmentsView } from './departments.js';
import { studyCyclesView } from './studyCycles.js';
import { subscriptionsView } from './subscriptions.js';
import { quizBuilderView } from './quizBuilder.js';
import { usersView } from './users.js';
import { questionsView } from './questions.js';

export const viewRegistry = {
  dashboard: dashboardView,
  departments: departmentsView,
  slots: studyCyclesView,
  subscriptions: subscriptionsView,
  quizbuilder: quizBuilderView,
  users: usersView,
  questions: questionsView,
};
