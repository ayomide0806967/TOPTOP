import { dashboardView } from './dashboard.js';
import { departmentsView } from './departments.js';
import { studyCyclesView } from './studyCycles.js';
import { subscriptionsView } from './subscriptions.js';
import { freeQuizzesView, examinationHallView } from './freeQuizzes.js';
import { usersView } from './users.js';
import { questionsView } from './questions.js';
import { extraQuestionsView } from './extraQuestions.js';

export const viewRegistry = {
  dashboard: dashboardView,
  departments: departmentsView,
  slots: studyCyclesView,
  subscriptions: subscriptionsView,
  freequizzes: freeQuizzesView,
  examinationhall: examinationHallView,
  extraquestions: extraQuestionsView,
  users: usersView,
  questions: questionsView,
};
