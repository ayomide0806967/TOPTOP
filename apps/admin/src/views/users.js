import { dataService } from '../services/dataService.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { authService } from '../services/authService.js';

function openUserEditor(profile, departments, actions) {
  openModal({
    title: 'Edit User',
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <form id="edit-user-form" class="space-y-4">
          <label class="block text-sm font-medium text-gray-700">
            <span>Full Name</span>
            <input type="text" name="full_name" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${profile.full_name}" required>
          </label>
          <label class="block text-sm font-medium text-gray-700">
            <span>Department</span>
            <select name="department_id" class="mt-1 w-full border border-gray-300 rounded-md p-2">
              <option value="">No Department</option>
              ${departments.map(dept => `<option value="${dept.id}" ${profile.department_id === dept.id ? 'selected' : ''}>${dept.name}</option>`).join('')}
            </select>
          </label>
          <div>
            <button type="button" id="change-plan" class="text-sm text-cyan-700 hover:underline">Change Subscription Plan</button>
          </div>
        </form>
      `;
      footer.innerHTML = `
        <button type="button" class="bg-gray-100 text-gray-700 px-4 py-2 rounded-md" data-role="cancel">Cancel</button>
        <button type="submit" form="edit-user-form" class="bg-cyan-700 text-white px-4 py-2 rounded-md">Save Changes</button>
      `;
      footer.querySelector('[data-role="cancel"]').addEventListener('click', close);
      const form = body.querySelector('#edit-user-form');

      body.querySelector('#change-plan').addEventListener('click', async () => {
        const products = await dataService.listSubscriptionProductsDetailed();
        openPlanSelector(profile, products, actions);
      });

      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        try {
          await dataService.updateUserProfile(profile.id, {
            full_name: formData.get('full_name').trim(),
            department_id: formData.get('department_id'),
          });
          showToast('User updated.', { type: 'success' });
          close();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to update user.', { type: 'error' });
        }
      });
    },
  });
}

function openPlanSelector(profile, products, actions) {
  openModal({
    title: `Change Plan for ${profile.full_name}`,
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <div class="space-y-4">
          ${products.map(product => `
            <div>
              <h3 class="text-lg font-semibold">${product.name}</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                ${product.plans.map(plan => `
                  <button data-plan-id="${plan.id}" class="text-left p-4 border rounded-lg hover:bg-gray-50">
                    <h4 class="font-semibold">${plan.name}</h4>
                    <p class="text-sm text-gray-500">${plan.price} ${plan.currency}</p>
                  </button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `;
      body.querySelectorAll('button[data-plan-id]').forEach(button => {
        button.addEventListener('click', async () => {
          const planId = button.dataset.planId;
          try {
            await dataService.updateUserSubscription(profile.id, planId);
            showToast('Subscription updated.', { type: 'success' });
            close();
            actions.refresh();
          } catch (error) {
            showToast(error.message, { type: 'error' });
          }
        });
      });
    }
  });
}

const ROLE_LABELS = {
  admin: 'Administrator',
  instructor: 'Instructor',
  learner: 'Learner',
};

function roleSelect(profile) {
  return `
    <select data-role="role-select" data-id="${profile.id}" class="border border-gray-300 rounded-md p-2 text-sm">
      ${Object.entries(ROLE_LABELS)
        .map(
          ([value, label]) =>
            `<option value="${value}" ${profile.role === value ? 'selected' : ''}>${label}</option>`
        )
        .join('')}
    </select>
  `;
}

function profileRow(profile, index) {
  return `
    <tr class="border-t border-gray-200" data-profile-id="${profile.id}">
      <td class="px-4 py-3 text-sm text-gray-500">${index + 1}</td>
      <td class="px-4 py-3"><input type="checkbox" class="user-checkbox" data-id="${profile.id}"></td>
      <td class="px-4 py-3">
        <div class="font-medium text-gray-900">${profile.full_name || 'Unknown user'}</div>
        <div class="text-xs text-gray-500">${profile.id}</div>
      </td>
      <td class="px-4 py-3">${roleSelect(profile)}</td>
      <td class="px-4 py-3 text-sm text-gray-500">${profile.status}</td>
      <td class="px-4 py-3 text-sm text-gray-500">${profile.plan_name}</td>
      <td class="px-4 py-3 text-sm text-gray-500">${profile.department_name}</td>
      <td class="px-4 py-3 text-sm text-gray-500">${profile.last_seen_at ? new Date(profile.last_seen_at).toLocaleString() : '—'}</td>
      <td class="px-4 py-3 text-sm text-gray-500">${profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}</td>
      <td class="px-4 py-3 text-sm text-gray-500">
        <button data-role="reset-password" data-id="${profile.id}" class="text-cyan-700 hover:underline">Reset Pass</button>
        <button data-role="edit-user" data-id="${profile.id}" class="text-cyan-700 hover:underline ml-2">Edit</button>
        <button data-role="suspend-user" data-id="${profile.id}" data-status="${profile.status}" class="text-amber-600 hover:underline ml-2">${profile.status === 'suspended' ? 'Unsuspend' : 'Suspend'}</button>
        <button data-role="impersonate-user" data-id="${profile.id}" class="text-cyan-700 hover:underline ml-2">Impersonate</button>
        <button data-role="delete-user" data-id="${profile.id}" class="text-red-600 hover:underline ml-2">Delete</button>
      </td>
    </tr>
  `;
}

export async function usersView(state, actions) {
  const profiles = await dataService.listProfiles();

  return {
    html: `
      <section class="space-y-6">
        <header class="flex flex-col gap-1">
          <h1 class="text-2xl font-semibold text-gray-900">Users</h1>
          <p class="text-gray-500">Promote admins, grant instructor access, and sync learner profiles with Supabase Auth.</p>
        </header>
        <section class="bg-white p-6 rounded-lg shadow">
          <h2 class="text-lg font-semibold text-gray-800">Link Supabase User</h2>
          <form id="profile-upsert-form" class="mt-4 grid gap-4 md:grid-cols-4">
            <label class="md:col-span-2 text-sm font-medium text-gray-700">
              <span>Auth User ID</span>
              <input type="text" name="id" class="mt-1 w-full border border-gray-300 rounded-md p-2" placeholder="UUID from Supabase Auth" required>
            </label>
            <label class="md:col-span-1 text-sm font-medium text-gray-700">
              <span>Full Name</span>
              <input type="text" name="full_name" class="mt-1 w-full border border-gray-300 rounded-md p-2" placeholder="Display name">
            </label>
            <label class="md:col-span-1 text-sm font-medium text-gray-700">
              <span>Role</span>
              <select name="role" class="mt-1 w-full border border-gray-300 rounded-md p-2">
                ${Object.entries(ROLE_LABELS)
                  .map(
                    ([value, label]) =>
                      `<option value="${value}" ${value === 'learner' ? 'selected' : ''}>${label}</option>`
                  )
                  .join('')}
              </select>
            </label>
            <div class="md:col-span-4 flex justify-end">
              <button type="submit" class="bg-cyan-700 text-white px-4 py-2 rounded-lg hover:bg-cyan-800">Upsert Profile</button>
            </div>
          </form>
        </section>
        <section class="bg-white rounded-lg shadow overflow-hidden">
          <header class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-800">Directory</h2>
            <div class="relative">
              <button id="bulk-actions-button" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-md" disabled>Bulk Actions</button>
              <div id="bulk-actions-dropdown" class="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 hidden">
                <a href="#" data-action="suspend" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Suspend</a>
                <a href="#" data-action="unsuspend" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Unsuspend</a>
                <a href="#" data-action="delete" class="block px-4 py-2 text-sm text-red-600 hover:bg-gray-100">Delete</a>
              </div>
            </div>
          </header>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th class="px-4 py-3 text-left">#</th>
                  <th class="px-4 py-3 text-left"><input type="checkbox" id="select-all-users"></th>
                  <th class="px-4 py-3 text-left">User</th>
                  <th class="px-4 py-3 text-left">Role</th>
                  <th class="px-4 py-3 text-left">Status</th>
                  <th class="px-4 py-3 text-left">Plan</th>
                  <th class="px-4 py-3 text-left">Department</th>
                  <th class="px-4 py-3 text-left">Last Seen</th>
                  <th class="px-4 py-3 text-left">Created</th>
                  <th class="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-100 text-sm">
                ${profiles.length ? profiles.map(profileRow).join('') : '<tr><td colspan="9" class="px-4 py-6 text-center text-gray-500">No profiles found. Link a Supabase user to get started.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    `,
    onMount(container, actions) {
      // Handle profile upsert form
      const profileUpsertForm = container.querySelector('#profile-upsert-form');
      profileUpsertForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(profileUpsertForm);
        try {
          await dataService.upsertProfile({
            id: formData.get('id').trim(),
            full_name: formData.get('full_name')?.trim() || null,
            role: formData.get('role'),
          });
          showToast('Profile upserted.', { type: 'success' });
          profileUpsertForm.reset();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to upsert profile.', { type: 'error' });
        }
      });

      // Handle role changes
      container.querySelectorAll('[data-role="role-select"]').forEach(select => {
        select.addEventListener('change', async (event) => {
          const { id } = event.target.dataset;
          const role = event.target.value;
          try {
            await dataService.updateUserRole(id, role);
            showToast('Role updated.', { type: 'success' });
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to update role.', { type: 'error' });
            event.target.value = profiles.find(p => p.id === id)?.role || 'learner';
          }
        });
      });

      // Handle user actions
      container.querySelectorAll('[data-role="reset-password"]').forEach(button => {
        button.addEventListener('click', async () => {
          const userId = button.dataset.id;
          if (!confirm('Send password reset email?')) return;
          try {
            await authService.resetPassword(userId);
            showToast('Password reset email sent.', { type: 'success' });
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to reset password.', { type: 'error' });
          }
        });
      });

      container.querySelectorAll('[data-role="edit-user"]').forEach(button => {
        button.addEventListener('click', async () => {
          const profile = profiles.find(p => p.id === button.dataset.id);
          if (!profile) return;
          const departments = await dataService.listDepartments();
          openUserEditor(profile, departments, actions);
        });
      });

      container.querySelectorAll('[data-role="suspend-user"]').forEach(button => {
        button.addEventListener('click', async () => {
          const userId = button.dataset.id;
          const currentStatus = button.dataset.status;
          const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
          try {
            await dataService.updateUserProfileStatus(userId, newStatus);
            showToast(`User ${newStatus}.`, { type: 'success' });
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to update status.', { type: 'error' });
          }
        });
      });

      container.querySelectorAll('[data-role="impersonate-user"]').forEach(button => {
        button.addEventListener('click', async () => {
          const userId = button.dataset.id;
          if (!confirm('Impersonate this user?')) return;
          try {
            await authService.impersonateUser(userId);
            window.location.href = '/apps/learner/';
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to impersonate user.', { type: 'error' });
          }
        });
      });

      container.querySelectorAll('[data-role="delete-user"]').forEach(button => {
        button.addEventListener('click', async () => {
          const userId = button.dataset.id;
          if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
          try {
            await dataService.deleteUserProfile(userId);
            await authService.deleteUser(userId);
            showToast('User deleted.', { type: 'success' });
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to delete user.', { type: 'error' });
          }
        });
      });

      // Handle bulk actions
      const selectAllCheckbox = container.querySelector('#select-all-users');
      const userCheckboxes = container.querySelectorAll('.user-checkbox');
      const bulkActionsButton = container.querySelector('#bulk-actions-button');
      const bulkActionsDropdown = container.querySelector('#bulk-actions-dropdown');

      const updateBulkActionsButton = () => {
        const selectedUsers = Array.from(userCheckboxes).filter(cb => cb.checked);
        if (selectedUsers.length > 0) {
          bulkActionsButton.disabled = false;
          bulkActionsButton.textContent = `Bulk Actions (${selectedUsers.length})`;
        } else {
          bulkActionsButton.disabled = true;
          bulkActionsButton.textContent = 'Bulk Actions';
        }
      };

      selectAllCheckbox.addEventListener('change', (e) => {
        userCheckboxes.forEach(checkbox => {
          checkbox.checked = e.target.checked;
        });
        updateBulkActionsButton();
      });

      userCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
          updateBulkActionsButton();
        });
      });

      bulkActionsButton.addEventListener('click', () => {
        bulkActionsDropdown.classList.toggle('hidden');
      });

      bulkActionsDropdown.addEventListener('click', async (e) => {
        e.preventDefault();
        const action = e.target.dataset.action;
        const selectedUsers = Array.from(userCheckboxes).filter(cb => cb.checked).map(cb => cb.dataset.id);

        if (selectedUsers.length === 0) {
          showToast('Please select at least one user.', { type: 'warning' });
          return;
        }

        if (action === 'delete') {
          if (confirm(`Are you sure you want to delete ${selectedUsers.length} users?`)) {
            await dataService.deleteUserProfilesBulk(selectedUsers);
            await authService.deleteUsersBulk(selectedUsers);
            showToast('Users deleted.', { type: 'success' });
            actions.refresh();
          }
        } else if (action === 'suspend' || action === 'unsuspend') {
          const newStatus = action === 'suspend' ? 'suspended' : 'active';
          await dataService.updateUserProfileStatusBulk(selectedUsers, newStatus);
          showToast(`Users ${newStatus}.`, { type: 'success' });
          actions.refresh();
        }

        bulkActionsDropdown.classList.add('hidden');
      });
    },
  };
}
