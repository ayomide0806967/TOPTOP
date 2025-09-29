import { dataService } from '../services/dataService.js';

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString();
}

function formatCurrency(value) {
  return `₦${Number(value ?? 0).toLocaleString()}`;
}

export async function dashboardView() {
  const stats = await dataService.getDashboardStats();
  const metrics = [
    {
      label: 'Total Users',
      value: formatNumber(stats.users),
      accent: 'bg-white',
    },
    {
      label: 'Active Subscriptions',
      value: formatNumber(stats.subscriptions),
      accent: 'bg-white',
    },
    {
      label: 'Monthly Revenue',
      value: formatCurrency(stats.revenue),
      accent: 'bg-white',
    },
    {
      label: 'Total Questions',
      value: formatNumber(stats.totalQuestions),
      accent: 'bg-white',
    },
  ];

  const cards = metrics
    .map(
      (metric) => `
        <div class="${metric.accent} p-6 rounded-lg shadow flex flex-col">
          <h3 class="text-sm font-medium text-gray-500">${metric.label}</h3>
          <p class="mt-2 text-3xl font-semibold text-gray-900">${metric.value}</p>
        </div>
      `
    )
    .join('');

  return {
    html: `
      <section class="space-y-6">
        <div>
          <h1 class="text-2xl font-semibold text-gray-900">Overview</h1>
          <p class="text-gray-500">Track performance across products, content, and exams.</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          ${cards}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <article class="bg-white rounded-lg shadow p-6">
            <h2 class="text-lg font-semibold text-gray-800">Content Pipeline</h2>
            <p class="mt-2 text-sm text-gray-500">Departments with the highest question growth will surface here once Supabase data is connected.</p>
            <div class="mt-4 border border-dashed border-gray-200 rounded-lg p-4 text-sm text-gray-400">
              Connect Supabase to unlock live analytics for content creation velocity, question review backlog, and publishing cadence.
            </div>
          </article>
          <article class="bg-white rounded-lg shadow p-6">
            <h2 class="text-lg font-semibold text-gray-800">Upcoming Exams</h2>
            <p class="mt-2 text-sm text-gray-500">Study cycles and real-time exam sessions will appear with schedule, enrolment, and readiness score.</p>
            <div class="mt-4 border border-dashed border-gray-200 rounded-lg p-4 text-sm text-gray-400">
              Create study cycles under <strong>Study Cycles</strong> to populate upcoming exam insights.
            </div>
          </article>
        </div>
      </section>
    `,
  };
}
