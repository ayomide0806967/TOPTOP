import { dataService } from '../services/dataService.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';

const DEPARTMENT_THEMES = {
  nursing: {
    header:
      'bg-gradient-to-br from-cyan-50 via-cyan-100 to-white text-cyan-900',
    badge: 'bg-cyan-100 text-cyan-800',
    border: 'border-cyan-500/40',
    button: 'bg-cyan-700 hover:bg-cyan-800 text-white',
  },
  midwifery: {
    header:
      'bg-gradient-to-br from-violet-50 via-violet-100 to-white text-violet-900',
    badge: 'bg-violet-100 text-violet-700',
    border: 'border-violet-500/40',
    button: 'bg-violet-600 hover:bg-violet-700 text-white',
  },
  'public-health': {
    header:
      'bg-gradient-to-br from-amber-50 via-amber-100 to-white text-amber-900',
    badge: 'bg-amber-100 text-amber-700',
    border: 'border-amber-500/40',
    button: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  default: {
    header:
      'bg-gradient-to-br from-slate-50 via-slate-100 to-white text-slate-900',
    badge: 'bg-slate-100 text-slate-700',
    border: 'border-slate-300',
    button: 'bg-slate-600 hover:bg-slate-700 text-white',
  },
};

function themeForDepartment(color) {
  return DEPARTMENT_THEMES[color] || DEPARTMENT_THEMES.default;
}

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value, currency = 'NGN') {
  if (value === null || value === undefined || value === '')
    return 'Contact sales';
  const amount = Number(value);
  if (Number.isNaN(amount)) return `${value}`;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amount);
}

function planCard(plan, theme) {
  const benefit = [];
  if (plan.questions !== null && plan.questions !== undefined) {
    benefit.push(
      `${plan.questions === -1 ? 'Unlimited' : plan.questions} questions`
    );
  }
  if (plan.quizzes !== null && plan.quizzes !== undefined) {
    benefit.push(`${plan.quizzes === -1 ? 'Unlimited' : plan.quizzes} quizzes`);
  }
  if (plan.participants !== null && plan.participants !== undefined) {
    benefit.push(
      `${plan.participants === -1 ? 'Unlimited' : plan.participants} participants`
    );
  }
  const dailyDetails = [];
  if (plan.daily_question_limit) {
    dailyDetails.push(`${plan.daily_question_limit} questions/day`);
  }
  if (plan.duration_days) {
    dailyDetails.push(`${plan.duration_days} days`);
  }
  if (plan.quiz_duration_minutes) {
    dailyDetails.push(`${plan.quiz_duration_minutes} min timer`);
  }
  const totalFromDaily =
    plan.daily_question_limit && plan.duration_days
      ? plan.daily_question_limit * plan.duration_days
      : null;
  if (totalFromDaily && !benefit.length) {
    benefit.push(`${totalFromDaily} questions per cycle`);
  }

  const themeClasses = theme || themeForDepartment();

  return `
    <article class="border ${themeClasses.border} rounded-lg p-4 space-y-3 bg-white/90" data-plan-id="${plan.id}">
      <header class="flex items-start justify-between gap-3">
        <div>
          <h4 class="text-lg font-semibold text-gray-900">${plan.name}</h4>
          <p class="text-sm text-gray-500">${plan.code}</p>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <button type="button" class="text-slate-700 hover:text-slate-900" data-role="view-plan-learners">View learners</button>
          <button type="button" class="text-cyan-700 hover:text-cyan-900" data-role="edit-plan">Edit</button>
          <button type="button" class="text-red-600 hover:text-red-700" data-role="delete-plan">Delete</button>
        </div>
      </header>
      <p class="text-2xl font-bold text-gray-900">${formatCurrency(plan.price, plan.currency)}</p>
      <ul class="text-sm text-gray-600 space-y-1">
        ${dailyDetails.length ? `<li>• ${dailyDetails.join(' · ')}</li>` : ''}
        ${benefit.length ? benefit.map((line) => `<li>• ${line}</li>`).join('') : '<li>No additional limits configured</li>'}
      </ul>
      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${plan.is_active ? 'bg-green-500/20 text-green-700' : 'bg-gray-200 text-gray-600'}">
        ${plan.is_active ? 'Active' : 'Inactive'}
      </span>
    </article>
  `;
}

function formatRelativeLastSeen(isoString) {
  if (!isoString) return 'Never signed in';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const diffMs = Date.now() - date.getTime();
  if (diffMs <= 0) return 'Today';

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths <= 1) return '1 month ago';
  return `${diffMonths} months ago`;
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatStatusLabel(status) {
  if (!status) return 'Unknown';
  return status
    .toString()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderPlanLearnersTable(learners) {
  const rows = learners
    .map((learner) => {
      const name = escapeHtml(learner.full_name || '—');
      const email = escapeHtml(learner.email || '—');
      const username = learner.username
        ? `<span class="ml-2 text-xs text-gray-400">@${escapeHtml(learner.username)}</span>`
        : '';
      return `
        <tr class="border-b last:border-b-0 border-gray-100 text-sm">
          <td class="px-3 py-3">
            <div class="font-semibold text-gray-900">${name}${username}</div>
            <div class="mt-1 text-xs text-gray-500">${email}</div>
          </td>
          <td class="px-3 py-3 text-sm text-gray-600">${formatStatusLabel(
            learner.status
          )}</td>
          <td class="px-3 py-3 text-sm text-gray-600">${formatRelativeLastSeen(
            learner.last_seen_at
          )}</td>
          <td class="px-3 py-3 text-sm text-gray-500">${formatDate(
            learner.started_at
          )}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="mt-4 overflow-hidden rounded-lg border border-gray-200">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th scope="col" class="px-3 py-3">Learner</th>
            <th scope="col" class="px-3 py-3">Status</th>
            <th scope="col" class="px-3 py-3">Last Active</th>
            <th scope="col" class="px-3 py-3">Subscribed</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function openPlanLearnersModal(plan) {
  openModal({
    title: `Learners · ${plan.name}`,
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <div class="py-6 text-sm text-gray-500 flex items-center gap-2">
          <span class="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-transparent"></span>
          Loading learners…
        </div>
      `;
      footer.innerHTML = `
        <button type="button" class="px-4 py-2 rounded-md bg-gray-100 text-gray-700" data-role="close">Close</button>
      `;
      footer
        .querySelector('[data-role="close"]')
        ?.addEventListener('click', close);

      (async () => {
        try {
          const learners = await dataService.listPlanLearners(plan.id);
          if (!learners.length) {
            body.innerHTML = `
              <p class="py-6 text-sm text-gray-500">
                No active learners are currently assigned to <strong>${escapeHtml(
                  plan.name
                )}</strong>.
              </p>
            `;
            return;
          }

          body.innerHTML = `
            <p class="text-sm text-gray-500">
              ${learners.length} learner${learners.length === 1 ? '' : 's'} currently subscribed.
            </p>
            ${renderPlanLearnersTable(learners)}
          `;
        } catch (error) {
          console.error('[Subscriptions] Unable to load plan learners', error);
          const message = escapeHtml(error?.message || 'Unable to load learners.');
          body.innerHTML = `
            <div class="py-6 text-sm text-red-600">${message}</div>
          `;
        }
      })();
    },
  });
}

function productCard(product, departmentLookup) {
  const plans = Array.isArray(product.plans) ? product.plans : [];
  const department = product.department_id
    ? departmentLookup.get(product.department_id)
    : null;
  const theme = themeForDepartment(
    department?.color || product.department_color
  );
  return `
    <article class="bg-white rounded-xl shadow border ${theme.border} overflow-hidden" data-product-id="${product.id}">
      <header class="p-6 pb-0 flex flex-col gap-3 ${theme.header}">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-xl font-semibold">${product.name}</h3>
            <p class="text-sm opacity-80">${product.product_type === 'quiz-builder' ? 'Quiz Builder' : 'CBT Practice'} · ${product.code}</p>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <button type="button" class="text-slate-900 hover:underline" data-role="edit-product">Edit</button>
            <button type="button" class="text-red-700 hover:text-red-800" data-role="delete-product">Delete</button>
          </div>
        </div>
        ${department ? `<span class="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${theme.badge}">${department.name}</span>` : ''}
        ${product.description ? `<p class="text-sm opacity-80 leading-relaxed">${product.description}</p>` : ''}
      </header>
      <div class="flex items-center gap-2 px-6 pt-4 text-xs uppercase tracking-wide text-gray-500">
        <span class="inline-flex items-center px-2 py-0.5 rounded ${product.is_active ? 'bg-green-500/20 text-green-700' : 'bg-gray-200 text-gray-600'}">${product.is_active ? 'Active' : 'Inactive'}</span>
      </div>
      <section class="space-y-3 px-6 pb-6 pt-4">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Plans</h4>
          <button type="button" class="${theme.button} px-3 py-1.5 rounded-md text-sm" data-role="add-plan">Add Plan</button>
        </div>
        ${
          plans.length
            ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${plans
                .map((plan) => planCard(plan, theme))
                .join('')}</div>`
            : '<p class="text-sm text-gray-500">No plans added yet.</p>'
        }
      </section>
    </article>
  `;
}

function openProductEditor(product, departments, actions) {
  const isNew = !product;
  openModal({
    title: isNew ? 'Create Subscription Product' : 'Edit Subscription Product',
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <form id="product-form" class="space-y-4">
          <label class="block text-sm font-medium text-gray-700">
            <span>Code</span>
            <input type="text" name="code" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${product?.code || ''}" ${isNew ? 'required' : 'readonly'}>
          </label>
          <label class="block text-sm font-medium text-gray-700">
            <span>Name</span>
            <input type="text" name="name" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${product?.name || ''}" required>
          </label>
          <label class="block text-sm font-medium text-gray-700">
            <span>Description</span>
            <textarea name="description" rows="3" class="mt-1 w-full border border-gray-300 rounded-md p-2">${product?.description || ''}</textarea>
          </label>
          <label class="block text-sm font-medium text-gray-700">
            <span>Department</span>
            <select name="department_id" class="mt-1 w-full border border-gray-300 rounded-md p-2">
              <option value="">General (no department)</option>
              ${departments
                .map(
                  (dept) =>
                    `<option value="${dept.id}" ${dept.id === product?.department_id ? 'selected' : ''}>${dept.name}</option>`
                )
                .join('')}
            </select>
          </label>
          <label class="block text-sm font-medium text-gray-700">
            <span>Product Type</span>
            <select name="product_type" class="mt-1 w-full border border-gray-300 rounded-md p-2">
              <option value="cbt" ${product?.product_type === 'cbt' ? 'selected' : ''}>CBT Practice</option>
              <option value="quiz-builder" ${product?.product_type === 'quiz-builder' ? 'selected' : ''}>Quiz Builder</option>
            </select>
          </label>
          <label class="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="is_active" ${(product?.is_active ?? true) ? 'checked' : ''}>
            Product is active
          </label>
        </form>
      `;
      footer.innerHTML = `
        <button type="button" class="px-4 py-2 rounded-md bg-gray-100 text-gray-700" data-role="cancel">Cancel</button>
        <button type="submit" form="product-form" class="px-4 py-2 rounded-md bg-cyan-700 text-white">${isNew ? 'Create Product' : 'Save Changes'}</button>
      `;
      footer
        .querySelector('[data-role="cancel"]')
        .addEventListener('click', close);

      const form = body.querySelector('#product-form');
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const payload = {
          code: formData.get('code').trim(),
          name: formData.get('name').trim(),
          description: formData.get('description').trim(),
          product_type: formData.get('product_type'),
          is_active: formData.get('is_active') === 'on',
          department_id: formData.get('department_id')
            ? formData.get('department_id')
            : null,
        };
        try {
          if (isNew) {
            await dataService.createSubscriptionProduct(payload);
            showToast('Product created.', { type: 'success' });
          } else {
            await dataService.updateSubscriptionProduct(product.id, payload);
            showToast('Product updated.', { type: 'success' });
          }
          close();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to save product.', {
            type: 'error',
          });
        }
      });
    },
  });
}

function confirmProductDeletion(product, actions) {
  openModal({
    title: 'Delete Subscription Product',
    render: ({ body, footer, close }) => {
      body.innerHTML = `<p class="text-sm text-gray-600">Delete <strong>${product.name}</strong> and all of its plans?</p>`;
      footer.innerHTML = `
        <button type="button" class="px-4 py-2 rounded-md bg-gray-100 text-gray-700" data-role="cancel">Cancel</button>
        <button type="button" class="px-4 py-2 rounded-md bg-red-600 text-white" data-role="confirm">Delete</button>
      `;
      footer
        .querySelector('[data-role="cancel"]')
        .addEventListener('click', close);
      footer
        .querySelector('[data-role="confirm"]')
        .addEventListener('click', async () => {
          try {
            await dataService.deleteSubscriptionProduct(product.id);
            showToast('Product deleted.', { type: 'success' });
            close();
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to delete product.', {
              type: 'error',
            });
          }
        });
    },
  });
}

function openPlanEditor(product, plan, actions) {
  const isNew = !plan;
  openModal({
    title: isNew
      ? `Create Plan · ${product.name}`
      : `Edit Plan · ${product.name}`,
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <form id="plan-form" class="space-y-4">
          <label class="block text-sm font-medium text-gray-700">
            <span>Code</span>
            <input type="text" name="code" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${plan?.code || ''}" required>
          </label>
          <label class="block text-sm font-medium text-gray-700">
            <span>Name</span>
            <input type="text" name="name" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${plan?.name || ''}" required>
          </label>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label class="block text-sm font-medium text-gray-700">
              <span>Price</span>
              <input type="number" min="0" step="0.01" name="price" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${plan?.price ?? ''}" required>
            </label>
            <label class="block text-sm font-medium text-gray-700">
              <span>Currency</span>
              <input type="text" name="currency" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${plan?.currency || 'NGN'}" required>
            </label>
            <label class="block text-sm font-medium text-gray-700">
              <span>Participants</span>
              <input type="number" name="participants" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${plan?.participants ?? ''}" placeholder="-1 for unlimited">
            </label>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label class="block text-sm font-medium text-gray-700">
              <span>Questions</span>
              <input type="number" name="questions" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${plan?.questions ?? ''}" placeholder="-1 for unlimited">
            </label>
            <label class="block text-sm font-medium text-gray-700">
              <span>Quizzes</span>
              <input type="number" name="quizzes" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${plan?.quizzes ?? ''}" placeholder="-1 for unlimited">
            </label>
            <label class="block text-sm font-medium text-gray-700">
              <span>Plan Tier</span>
              <input type="text" name="plan_tier" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${plan?.plan_tier || ''}" placeholder="daily-100">
            </label>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label class="block text-sm font-medium text-gray-700">
              <span>Daily Question Limit</span>
              <input type="number" min="0" name="daily_question_limit" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${plan?.daily_question_limit ?? ''}" required>
            </label>
            <label class="block text-sm font-medium text-gray-700">
              <span>Duration (days)</span>
              <input type="number" min="1" name="duration_days" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${plan?.duration_days ?? 30}" required>
            </label>
            <label class="block text-sm font-medium text-gray-700">
              <span>Quiz Timer (minutes)</span>
              <input type="number" min="0" name="quiz_duration_minutes" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${plan?.quiz_duration_minutes ?? ''}" placeholder="0 for no timer">
            </label>
          </div>
          <label class="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="is_active" ${(plan?.is_active ?? true) ? 'checked' : ''}>
            Plan is active
          </label>
        </form>
      `;
      footer.innerHTML = `
        <button type="button" class="px-4 py-2 rounded-md bg-gray-100 text-gray-700" data-role="cancel">Cancel</button>
        <button type="submit" form="plan-form" class="px-4 py-2 rounded-md bg-cyan-700 text-white">${isNew ? 'Create Plan' : 'Save Changes'}</button>
      `;
      footer
        .querySelector('[data-role="cancel"]')
        .addEventListener('click', close);

      const form = body.querySelector('#plan-form');
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const payload = {
          code: formData.get('code').trim(),
          name: formData.get('name').trim(),
          price: Number(formData.get('price') || 0),
          currency: formData.get('currency').trim() || 'NGN',
          participants: formData.get('participants')
            ? Number(formData.get('participants'))
            : null,
          questions: formData.get('questions')
            ? Number(formData.get('questions'))
            : null,
          quizzes: formData.get('quizzes')
            ? Number(formData.get('quizzes'))
            : null,
          is_active: formData.get('is_active') === 'on',
          daily_question_limit: Number(
            formData.get('daily_question_limit') || 0
          ),
          duration_days: Number(formData.get('duration_days') || 30),
          plan_tier: formData.get('plan_tier')
            ? formData.get('plan_tier').trim()
            : null,
          quiz_duration_minutes: formData.get('quiz_duration_minutes')
            ? Number(formData.get('quiz_duration_minutes'))
            : null,
        };
        try {
          if (isNew) {
            await dataService.createSubscriptionPlan(product.id, payload);
            showToast('Plan created.', { type: 'success' });
          } else {
            await dataService.updateSubscriptionPlan(plan.id, payload);
            showToast('Plan updated.', { type: 'success' });
          }
          close();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to save plan.', { type: 'error' });
        }
      });
    },
  });
}

function confirmPlanDeletion(planId, planName, actions) {
  openModal({
    title: 'Delete Plan',
    render: ({ body, footer, close }) => {
      body.innerHTML = `<p class="text-sm text-gray-600">Remove the <strong>${planName}</strong> plan?</p>`;
      footer.innerHTML = `
        <button type="button" class="px-4 py-2 rounded-md bg-gray-100 text-gray-700" data-role="cancel">Cancel</button>
        <button type="button" class="px-4 py-2 rounded-md bg-red-600 text-white" data-role="confirm">Delete</button>
      `;
      footer
        .querySelector('[data-role="cancel"]')
        .addEventListener('click', close);
      footer
        .querySelector('[data-role="confirm"]')
        .addEventListener('click', async () => {
          try {
            await dataService.deleteSubscriptionPlan(planId);
            showToast('Plan deleted.', { type: 'success' });
            close();
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to delete plan.', {
              type: 'error',
            });
          }
        });
    },
  });
}

export async function subscriptionsView(state, actions) {
  const [departments, products] = await Promise.all([
    dataService.listDepartments(),
    dataService.listSubscriptionProductsDetailed(),
  ]);

  const departmentLookup = new Map(departments.map((dept) => [dept.id, dept]));
  const selectedDepartmentId = state.selectedDepartmentId || null;
  const filteredProducts = selectedDepartmentId
    ? products.filter(
        (product) => product.department_id === selectedDepartmentId
      )
    : products;

  const departmentOptions = departments
    .map(
      (dept) =>
        `<option value="${dept.id}" ${dept.id === selectedDepartmentId ? 'selected' : ''}>${dept.name}</option>`
    )
    .join('');

  const productMarkup = filteredProducts.length
    ? filteredProducts
        .map((product) => productCard(product, departmentLookup))
        .join('')
    : '<p class="text-sm text-gray-500">No subscription products configured yet for this department.</p>';

  return {
    html: `
      <section class="space-y-6">
        <header class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold text-gray-900">Subscriptions</h1>
            <p class="text-gray-500">Control products and plans surfaced to learners across departments.</p>
          </div>
          <label class="text-sm text-gray-600">
            <span class="sr-only">Filter by department</span>
            <select data-role="subscriptions-department" class="border border-gray-300 rounded-md p-2">
              <option value="all"${selectedDepartmentId ? '' : ' selected'}>All departments</option>
              ${departmentOptions}
            </select>
          </label>
        </header>
        <section class="bg-white p-6 rounded-lg shadow">
          <h2 class="text-lg font-semibold text-gray-800">Create Product</h2>
          <form id="create-product-form" class="mt-4 grid gap-4 md:grid-cols-4">
            <label class="text-sm font-medium text-gray-700">
              <span>Code</span>
              <input type="text" name="code" class="mt-1 w-full border border-gray-300 rounded-md p-2" placeholder="nursing-cbt" required>
            </label>
            <label class="text-sm font-medium text-gray-700">
              <span>Name</span>
              <input type="text" name="name" class="mt-1 w-full border border-gray-300 rounded-md p-2" placeholder="Nursing Practice Prep" required>
            </label>
            <label class="text-sm font-medium text-gray-700">
              <span>Department</span>
              <select name="department_id" class="mt-1 w-full border border-gray-300 rounded-md p-2">
                <option value="">General (no department)</option>
                ${departments.map((dept) => `<option value="${dept.id}">${dept.name}</option>`).join('')}
              </select>
            </label>
            <label class="text-sm font-medium text-gray-700">
              <span>Type</span>
              <select name="product_type" class="mt-1 w-full border border-gray-300 rounded-md p-2">
                <option value="cbt">CBT Practice</option>
                <option value="quiz-builder">Quiz Builder</option>
              </select>
            </label>
            <label class="md:col-span-4 text-sm font-medium text-gray-700">
              <span>Description</span>
              <textarea name="description" rows="2" class="mt-1 w-full border border-gray-300 rounded-md p-2" placeholder="Short description"></textarea>
            </label>
            <div class="md:col-span-4 flex items-center justify-between">
              <label class="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="is_active" checked>
                Product is active
              </label>
              <button type="submit" class="bg-cyan-700 text-white px-4 py-2 rounded-lg hover:bg-cyan-800">Create Product</button>
            </div>
          </form>
        </section>
        <section class="space-y-6" data-role="product-list">
          ${productMarkup}
        </section>
      </section>
    `,
    onMount(container) {
      const departmentSelect = container.querySelector(
        '[data-role="subscriptions-department"]'
      );
      departmentSelect?.addEventListener('change', (event) => {
        if (event.target.value === 'all') {
          actions.clearDepartmentSelection();
        } else {
          actions.selectDepartment(event.target.value);
        }
      });

      const productForm = container.querySelector('#create-product-form');
      productForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(productForm);
        const payload = {
          code: formData.get('code').trim(),
          name: formData.get('name').trim(),
          product_type: formData.get('product_type'),
          description: formData.get('description').trim(),
          department_id: formData.get('department_id')
            ? formData.get('department_id')
            : null,
          is_active: formData.get('is_active') === 'on',
        };
        if (!payload.code || !payload.name) return;
        try {
          await dataService.createSubscriptionProduct(payload);
          showToast('Product created.', { type: 'success' });
          productForm.reset();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to create product.', {
            type: 'error',
          });
        }
      });

      container.querySelectorAll('[data-product-id]').forEach((article) => {
        const productId = article.dataset.productId;
        const product =
          filteredProducts.find((item) => item.id === productId) ||
          products.find((item) => item.id === productId);
        if (!product) return;

        article
          .querySelector('[data-role="edit-product"]')
          .addEventListener('click', (event) => {
            event.preventDefault();
            openProductEditor(product, departments, actions);
          });
        article
          .querySelector('[data-role="delete-product"]')
          .addEventListener('click', (event) => {
            event.preventDefault();
            confirmProductDeletion(product, actions);
          });
        article
          .querySelector('[data-role="add-plan"]')
          .addEventListener('click', (event) => {
            event.preventDefault();
            openPlanEditor(product, null, actions);
          });

        article.querySelectorAll('[data-plan-id]').forEach((planEl) => {
          const planId = planEl.dataset.planId;
          const plan = product.plans.find((item) => item.id === planId);
          if (!plan) return;
          planEl
            .querySelector('[data-role="view-plan-learners"]')
            ?.addEventListener('click', (event) => {
              event.preventDefault();
              openPlanLearnersModal(plan);
            });
          planEl
            .querySelector('[data-role="edit-plan"]')
            .addEventListener('click', (event) => {
              event.preventDefault();
              openPlanEditor(product, plan, actions);
            });
          planEl
            .querySelector('[data-role="delete-plan"]')
            .addEventListener('click', (event) => {
              event.preventDefault();
              confirmPlanDeletion(plan.id, plan.name, actions);
            });
        });
      });
    },
  };
}
