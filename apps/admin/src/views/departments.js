import { dataService } from '../services/dataService.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';

const COLOR_OPTIONS = [
  { value: 'nursing', label: 'Cyan (Nursing)' },
  { value: 'midwifery', label: 'Purple (Midwifery)' },
  { value: 'public-health', label: 'Amber (Public Health)' },
];

function departmentCards(departments) {
  if (!departments.length) {
    return '<p class="text-sm text-gray-500">No departments yet. Create your first department using the form above.</p>';
  }
  return departments
    .map(
      (dept) => `
        <article class="bg-white border-l-4 border-cyan-600/40 p-6 rounded-lg shadow flex flex-col gap-4">
          <header class="flex items-start justify-between gap-3">
            <div>
              <h3 class="text-xl font-bold text-gray-900">${dept.name}</h3>
              <p class="text-sm text-gray-500 mt-1">Manage courses, topics, and exam content.</p>
            </div>
            <div class="flex items-center gap-3 text-sm">
              <button type="button" class="text-cyan-700 hover:text-cyan-900" data-role="edit-department" data-id="${dept.id}" data-name="${encodeURIComponent(dept.name)}" data-color="${dept.color}">Edit</button>
              <button type="button" class="text-red-600 hover:text-red-700" data-role="delete-department" data-id="${dept.id}" data-name="${encodeURIComponent(dept.name)}">Delete</button>
            </div>
          </header>
          <footer class="mt-auto">
            <button type="button" class="inline-flex items-center gap-2 bg-cyan-700 text-white px-4 py-2 rounded-lg hover:bg-cyan-800" data-role="select-department" data-id="${dept.id}">
              Manage Department
            </button>
          </footer>
        </article>
      `
    )
    .join('');
}

function courseCards(courses) {
  if (!courses.length) {
    return '<p class="text-sm text-gray-500">No courses found for this department.</p>';
  }
  return courses
    .map(
      (course) => `
        <article class="bg-white p-6 rounded-lg shadow flex flex-col gap-4">
          <header class="flex items-start justify-between gap-3">
            <div>
              <h3 class="text-lg font-bold text-gray-900">${course.name}</h3>
              ${course.description ? `<p class="text-sm text-gray-500 mt-1 whitespace-pre-line">${course.description}</p>` : ''}
            </div>
            <div class="flex items-center gap-3 text-sm">
              <button type="button" class="text-cyan-700 hover:text-cyan-900" data-role="edit-course" data-id="${course.id}" data-name="${encodeURIComponent(course.name)}" data-description="${encodeURIComponent(course.description || '')}">Edit</button>
              <button type="button" class="text-red-600 hover:text-red-700" data-role="delete-course" data-id="${course.id}" data-name="${encodeURIComponent(course.name)}">Delete</button>
            </div>
          </header>
          <footer class="mt-auto">
            <button type="button" class="inline-flex items-center gap-2 bg-cyan-700 text-white px-4 py-2 rounded-lg hover:bg-cyan-800" data-role="select-course" data-id="${course.id}">
              Manage Topics
            </button>
          </footer>
        </article>
      `
    )
    .join('');
}

function topicCards(topics) {
  if (!topics.length) {
    return '<p class="text-sm text-gray-500">No topics yet for this course.</p>';
  }
  return topics
    .map(
      (topic) => `
        <article class="bg-white p-5 rounded-lg shadow flex flex-col gap-3">
          <header class="flex items-start justify-between gap-3">
            <div>
              <h4 class="text-lg font-semibold text-gray-900">${topic.name}</h4>
              <p class="text-sm text-gray-500">${topic.question_count} question${topic.question_count === 1 ? '' : 's'}</p>
            </div>
            <div class="flex items-center gap-3 text-sm">
              <button type="button" class="text-cyan-700 hover:text-cyan-900" data-role="edit-topic" data-id="${topic.id}" data-name="${encodeURIComponent(topic.name)}">Edit</button>
              <button type="button" class="text-red-600 hover:text-red-700" data-role="delete-topic" data-id="${topic.id}" data-name="${encodeURIComponent(topic.name)}">Delete</button>
            </div>
          </header>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-sm">
            <button type="button" class="w-full bg-cyan-700 text-white py-2 rounded-md hover:bg-cyan-800" data-role="manage-questions" data-topic-id="${topic.id}" data-topic-name="${encodeURIComponent(topic.name)}">Manage Questions</button>
            <button type="button" class="w-full bg-gray-100 text-gray-700 py-2 rounded-md border border-gray-200 hover:bg-gray-200" data-role="upload-aiken" data-topic-id="${topic.id}" data-topic-name="${encodeURIComponent(topic.name)}">Upload Aiken</button>
          </div>
        </article>
      `
    )
    .join('');
}

function departmentBreadcrumb(department, course) {
  if (!department) return 'Departments';
  if (!course) return `${department.name} / Courses`;
  return `${department.name} / ${course.name}`;
}


export async function departmentsView(state, actions) {
  const departments = await dataService.listDepartments();
  const selectedDepartment =
    departments.find((dept) => dept.id === state.selectedDepartmentId) || null;

  if (!state.selectedDepartmentId) {
    return {
      html: `
        <section class="space-y-6">
          <header class="flex flex-col gap-1">
            <h1 class="text-2xl font-semibold text-gray-900">Departments</h1>
            <p class="text-gray-500">Organise courses and topics by academic department.</p>
          </header>
          <section class="bg-white p-6 rounded-lg shadow">
            <h2 class="text-lg font-semibold text-gray-800">Create Department</h2>
            <form id="create-department-form" class="mt-4 grid gap-4 md:grid-cols-3">
              <label class="md:col-span-2 text-sm font-medium text-gray-700">
                <span>Department Name</span>
                <input type="text" name="name" class="mt-1 block w-full border border-gray-300 rounded-md p-2" required>
              </label>
              <label class="text-sm font-medium text-gray-700">
                <span>Colour Theme</span>
                <select name="color" class="mt-1 block w-full border border-gray-300 rounded-md p-2">
                  ${COLOR_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}
                </select>
              </label>
              <div class="md:col-span-3 flex justify-end">
                <button type="submit" class="bg-cyan-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-cyan-800">Create Department</button>
              </div>
            </form>
          </section>
          <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${departmentCards(departments)}
          </section>
        </section>
      `,
      onMount(container) {
        const form = container.querySelector('#create-department-form');
        form?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const formData = new FormData(form);
          const payload = {
            name: formData.get('name').trim(),
            color: formData.get('color'),
          };
          if (!payload.name) return;
          try {
            await dataService.createDepartment(payload);
            showToast('Department created.', { type: 'success' });
            form.reset();
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to create department.', {
              type: 'error',
            });
          }
        });

        container
          .querySelectorAll('[data-role="select-department"]')
          .forEach((element) => {
            element.addEventListener('click', () =>
              actions.selectDepartment(element.dataset.id)
            );
          });

        container
          .querySelectorAll('[data-role="edit-department"]')
          .forEach((element) => {
            element.addEventListener('click', () =>
              openDepartmentEditor(
                {
                  id: element.dataset.id,
                  name: decodeURIComponent(element.dataset.name),
                  color: element.dataset.color,
                },
                actions
              )
            );
          });

        container
          .querySelectorAll('[data-role="delete-department"]')
          .forEach((element) => {
            element.addEventListener('click', () =>
              confirmDepartmentDeletion(
                element.dataset.id,
                decodeURIComponent(element.dataset.name),
                actions
              )
            );
          });
      },
    };
  }

  const courses = await dataService.listCourses(state.selectedDepartmentId);
  const selectedCourse =
    courses.find((course) => course.id === state.selectedCourseId) || null;

  if (!state.selectedCourseId) {
    return {
      html: `
        <section class="space-y-6">
          <header class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-semibold text-gray-900">${departmentBreadcrumb(selectedDepartment)}</h1>
              <p class="text-gray-500">Create courses to map syllabi and attach topics.</p>
            </div>
            <button type="button" class="text-sm text-cyan-700" data-role="back-to-departments">&larr; All Departments</button>
          </header>
          <section class="bg-white p-6 rounded-lg shadow">
            <h2 class="text-lg font-semibold text-gray-800">Create Course</h2>
            <form id="create-course-form" class="mt-4 grid gap-4 md:grid-cols-3">
              <label class="md:col-span-2 text-sm font-medium text-gray-700">
                <span>Course Name</span>
                <input type="text" name="name" class="mt-1 block w-full border border-gray-300 rounded-md p-2" required>
              </label>
              <label class="text-sm font-medium text-gray-700 md:col-span-3">
                <span>Description</span>
                <textarea name="description" rows="2" class="mt-1 block w-full border border-gray-300 rounded-md p-2"></textarea>
              </label>
              <div class="md:col-span-3 flex justify-end">
                <button type="submit" class="bg-cyan-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-cyan-800">Create Course</button>
              </div>
            </form>
          </section>
          <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${courseCards(courses)}
          </section>
        </section>
      `,
      onMount(container) {
        container
          .querySelector('[data-role="back-to-departments"]')
          .addEventListener('click', () => actions.clearDepartmentSelection());

        const form = container.querySelector('#create-course-form');
        form?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const formData = new FormData(form);
          const payload = {
            name: formData.get('name').trim(),
            description: formData.get('description').trim(),
          };
          if (!payload.name) return;
          try {
            await dataService.createCourse(state.selectedDepartmentId, payload);
            showToast('Course created.', { type: 'success' });
            form.reset();
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to create course.', {
              type: 'error',
            });
          }
        });

        container
          .querySelectorAll('[data-role="select-course"]')
          .forEach((element) => {
            element.addEventListener('click', () =>
              actions.selectCourse(element.dataset.id)
            );
          });

        container
          .querySelectorAll('[data-role="edit-course"]')
          .forEach((element) => {
            element.addEventListener('click', async () => {
              try {
                const course = await dataService.getCourse(element.dataset.id);
                openCourseEditor(course, actions);
              } catch (error) {
                console.error(error);
                showToast(error.message || 'Unable to load course details.', {
                  type: 'error',
                });
              }
            });
          });

        container
          .querySelectorAll('[data-role="delete-course"]')
          .forEach((element) => {
            element.addEventListener('click', () =>
              confirmCourseDeletion(
                element.dataset.id,
                decodeURIComponent(element.dataset.name),
                actions
              )
            );
          });
      },
    };
  }

  const topics = await dataService.listTopics(state.selectedCourseId);

  return {
    html: `
      <section class="space-y-6">
        <header class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-semibold text-gray-900">${departmentBreadcrumb(selectedDepartment, selectedCourse)}</h1>
            <p class="text-gray-500">Topic cards summarise question pools for this course.</p>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <button type="button" class="text-cyan-700" data-role="back-to-courses">&larr; Courses</button>
            <button type="button" class="text-cyan-700" data-role="back-to-departments">Departments</button>
          </div>
        </header>
        <section class="bg-white p-6 rounded-lg shadow">
          <h2 class="text-lg font-semibold text-gray-800">Create Topic</h2>
          <form id="create-topic-form" class="mt-4 grid gap-4 md:grid-cols-3">
            <label class="md:col-span-2 text-sm font-medium text-gray-700">
              <span>Topic Name</span>
              <input type="text" name="name" class="mt-1 block w-full border border-gray-300 rounded-md p-2" required>
            </label>
            <label class="text-sm font-medium text-gray-700">
              <span>Initial Question Count</span>
              <input type="number" name="question_count" min="0" step="1" value="0" class="mt-1 block w-full border border-gray-300 rounded-md p-2">
            </label>
            <div class="md:col-span-3 flex justify-end">
              <button type="submit" class="bg-cyan-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-cyan-800">Create Topic</button>
            </div>
          </form>
        </section>
        <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          ${topicCards(topics)}
        </section>
      </section>
    `,
    onMount(container) {
      container
        .querySelector('[data-role="back-to-courses"]')
        .addEventListener('click', () =>
          actions.selectDepartment(state.selectedDepartmentId)
        );
      container
        .querySelector('[data-role="back-to-departments"]')
        .addEventListener('click', () => actions.clearDepartmentSelection());

      const form = container.querySelector('#create-topic-form');
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const payload = {
          name: formData.get('name').trim(),
          question_count: Number(formData.get('question_count') || 0),
        };
        if (!payload.name) return;
        try {
          await dataService.createTopic(state.selectedCourseId, payload);
          showToast('Topic created.', { type: 'success' });
          form.reset();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to create topic.', {
            type: 'error',
          });
        }
      });

      container
        .querySelectorAll('[data-role="upload-aiken"]')
        .forEach((button) => {
          button.addEventListener('click', () => {
            openTopicAikenUploader({
              topicId: button.dataset.topicId,
              topicName: decodeURIComponent(button.dataset.topicName),
              actions,
            });
          });
        });

      container
        .querySelectorAll('[data-role="manage-questions"]')
        .forEach((button) => {
          button.addEventListener('click', () =>
            actions.selectTopic(button.dataset.topicId)
          );
        });

      container
        .querySelectorAll('[data-role="edit-topic"]')
        .forEach((button) => {
          button.addEventListener('click', () =>
            openTopicEditor(
              button.dataset.id,
              decodeURIComponent(button.dataset.name),
              actions
            )
          );
        });

      container
        .querySelectorAll('[data-role="delete-topic"]')
        .forEach((button) => {
          button.addEventListener('click', () =>
            confirmTopicDeletion(
              button.dataset.id,
              decodeURIComponent(button.dataset.name),
              actions
            )
          );
        });
    },
  };
}

function openDepartmentEditor(department, actions) {
  openModal({
    title: 'Edit Department',
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <form id="edit-department-form" class="space-y-4">
          <label class="block text-sm font-medium text-gray-700">
            <span>Name</span>
            <input type="text" name="name" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${department.name}" required>
          </label>
          <label class="block text-sm font-medium text-gray-700">
            <span>Colour Theme</span>
            <select name="color" class="mt-1 w-full border border-gray-300 rounded-md p-2">
              ${COLOR_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === department.color ? 'selected' : ''}>${option.label}</option>`).join('')}
            </select>
          </label>
        </form>
      `;
      footer.innerHTML = `
        <button type="button" class="bg-gray-100 text-gray-700 px-4 py-2 rounded-md" data-role="cancel">Cancel</button>
        <button type="submit" form="edit-department-form" class="bg-cyan-700 text-white px-4 py-2 rounded-md">Save Changes</button>
      `;
      footer
        .querySelector('[data-role="cancel"]')
        .addEventListener('click', close);
      const form = body.querySelector('#edit-department-form');
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        try {
          await dataService.updateDepartment(department.id, {
            name: formData.get('name').trim(),
            color: formData.get('color'),
          });
          showToast('Department updated.', { type: 'success' });
          close();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to update department.', {
            type: 'error',
          });
        }
      });
    },
  });
}

function confirmDepartmentDeletion(id, name, actions) {
  openModal({
    title: 'Delete Department',
    render: ({ body, footer, close }) => {
      body.innerHTML = `<p class="text-sm text-gray-600">Deleting <strong>${name}</strong> removes all courses, topics, and questions beneath it. This action cannot be undone.</p>`;
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
            await dataService.deleteDepartment(id);
            showToast('Department deleted.', { type: 'success' });
            close();
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to delete department.', {
              type: 'error',
            });
          }
        });
    },
  });
}

function openCourseEditor(course, actions) {
  openModal({
    title: 'Edit Course',
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <form id="edit-course-form" class="space-y-4">
          <label class="block text-sm font-medium text-gray-700">
            <span>Name</span>
            <input type="text" name="name" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${course.name}" required>
          </label>
          <label class="block text-sm font-medium text-gray-700">
            <span>Description</span>
            <textarea name="description" rows="3" class="mt-1 w-full border border-gray-300 rounded-md p-2">${course.description || ''}</textarea>
          </label>
        </form>
      `;
      footer.innerHTML = `
        <button type="button" class="bg-gray-100 text-gray-700 px-4 py-2 rounded-md" data-role="cancel">Cancel</button>
        <button type="submit" form="edit-course-form" class="bg-cyan-700 text-white px-4 py-2 rounded-md">Save Changes</button>
      `;
      footer
        .querySelector('[data-role="cancel"]')
        .addEventListener('click', close);
      const form = body.querySelector('#edit-course-form');
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        try {
          await dataService.updateCourse(course.id, {
            name: formData.get('name').trim(),
            description: formData.get('description').trim(),
          });
          showToast('Course updated.', { type: 'success' });
          close();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to update course.', {
            type: 'error',
          });
        }
      });
    },
  });
}

function confirmCourseDeletion(id, name, actions) {
  openModal({
    title: 'Delete Course',
    render: ({ body, footer, close }) => {
      body.innerHTML = `<p class="text-sm text-gray-600">Deleting <strong>${name}</strong> removes all topics and questions associated with the course.</p>`;
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
            await dataService.deleteCourse(id);
            showToast('Course deleted.', { type: 'success' });
            close();
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to delete course.', {
              type: 'error',
            });
          }
        });
    },
  });
}

function openTopicEditor(id, name, actions) {
  openModal({
    title: 'Edit Topic',
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <form id="edit-topic-form" class="space-y-4">
          <label class="block text-sm font-medium text-gray-700">
            <span>Name</span>
            <input type="text" name="name" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${name}" required>
          </label>
        </form>
      `;
      footer.innerHTML = `
        <button type="button" class="px-4 py-2 rounded-md bg-gray-100 text-gray-700" data-role="cancel">Cancel</button>
        <button type="submit" form="edit-topic-form" class="px-4 py-2 rounded-md bg-cyan-700 text-white">Save Changes</button>
      `;
      footer
        .querySelector('[data-role="cancel"]')
        .addEventListener('click', close);
      const form = body.querySelector('#edit-topic-form');
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        try {
          await dataService.updateTopic(id, {
            name: formData.get('name').trim(),
          });
          showToast('Topic updated.', { type: 'success' });
          close();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to update topic.', {
            type: 'error',
          });
        }
      });
    },
  });
}

function confirmTopicDeletion(id, name, actions) {
  openModal({
    title: 'Delete Topic',
    render: ({ body, footer, close }) => {
      body.innerHTML = `<p class="text-sm text-gray-600">The topic <strong>${name}</strong> and its question bank will be removed.</p>`;
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
            await dataService.deleteTopic(id);
            showToast('Topic deleted.', { type: 'success' });
            close();
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to delete topic.', {
              type: 'error',
            });
          }
        });
    },
  });
}

function openTopicAikenUploader({ topicId, topicName, actions }) {
  if (!topicId) {
    showToast('Select a topic before uploading questions.', { type: 'error' });
    return;
  }
  const safeTopicName = topicName ? escapeHtml(topicName) : 'this topic';
  const plainTopicName = topicName || 'this topic';
  openModal({
    title: `Upload Questions to ${safeTopicName}`,
    widthClass: 'max-w-3xl',
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <div class="space-y-6">
          <section class="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-5">
            <h3 class="text-base font-semibold text-slate-900">Upload from file</h3>
            <p class="mt-1 text-sm text-slate-600">Supports Aiken-formatted .txt, .md, or .aiken files.</p>
            <input type="file" accept=".txt,.md,.aiken" data-role="file-input" class="hidden" />
            <div class="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" data-role="trigger-file-upload" class="inline-flex items-center gap-2 rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-2">
                Select Aiken file
              </button>
              <p class="text-xs text-slate-500">We’ll parse the file and append questions to <strong>${safeTopicName}</strong>.</p>
            </div>
            <p class="mt-2 hidden text-sm text-red-600" data-role="file-error"></p>
          </section>

          <section class="rounded-lg border border-slate-200 bg-white px-4 py-5 shadow-sm">
            <h3 class="text-base font-semibold text-slate-900">Paste Aiken text</h3>
            <p class="mt-1 text-sm text-slate-600">Validate pasted questions before importing. Errors highlight the affected line.</p>
            <textarea rows="10" data-role="aiken-text" class="mt-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono text-slate-800 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600" placeholder="Enter Aiken formatted questions"></textarea>
            <p class="mt-2 hidden text-sm text-red-600" data-role="inline-error"></p>
            <div class="mt-3 flex gap-2">
              <button type="button" data-role="validate-upload" class="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-2">Validate &amp; upload</button>
              <button type="button" data-role="clear-inline" class="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2">Clear</button>
            </div>
            <div class="mt-4 hidden rounded-md border border-slate-100 bg-slate-50 px-3 py-3" data-role="preview-container">
              <p class="text-sm font-semibold text-slate-700">Preview</p>
              <ol class="mt-2 space-y-1 text-sm text-slate-600" data-role="preview-list"></ol>
            </div>
            <div class="mt-4 hidden rounded-md border border-rose-200 bg-rose-50 px-3 py-3" data-role="failure-summary">
              <p class="text-sm font-semibold text-rose-700">Issues detected</p>
              <ol class="mt-2 space-y-1 text-sm text-rose-700" data-role="failure-list"></ol>
            </div>
          </section>
        </div>
      `;
      footer.innerHTML = `
        <button type="button" data-role="close-modal" class="rounded-md bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2">Close</button>
      `;
      footer
        .querySelector('[data-role="close-modal"]')
        ?.addEventListener('click', close);

      const refresh = typeof actions?.refresh === 'function' ? actions.refresh : null;
      const fileButton = body.querySelector('[data-role="trigger-file-upload"]');
      const fileInput = body.querySelector('[data-role="file-input"]');
      const fileError = body.querySelector('[data-role="file-error"]');
      const textarea = body.querySelector('[data-role="aiken-text"]');
      const inlineError = body.querySelector('[data-role="inline-error"]');
      const validateBtn = body.querySelector('[data-role="validate-upload"]');
      const clearBtn = body.querySelector('[data-role="clear-inline"]');
      const previewContainer = body.querySelector('[data-role="preview-container"]');
      const previewList = body.querySelector('[data-role="preview-list"]');
      const failureSummary = body.querySelector('[data-role="failure-summary"]');
      const failureList = body.querySelector('[data-role="failure-list"]');

      fileButton?.addEventListener('click', () => {
        fileError?.classList.add('hidden');
        if (fileInput) {
          fileInput.value = '';
          fileInput.click();
        }
      });

      fileInput?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const originalLabel = fileButton?.textContent;
        if (fileButton) {
          fileButton.disabled = true;
          fileButton.textContent = 'Uploading…';
        }
        fileError?.classList.add('hidden');
        try {
          const content = await file.text();
          const result = await dataService.importAikenQuestions(topicId, content);
          const count = result?.insertedCount ?? 0;
          showToast(
            `${count} question${count === 1 ? '' : 's'} added to ${plainTopicName}.`,
            { type: 'success' }
          );
          close();
          refresh?.();
        } catch (error) {
          console.error(error);
          const message = error?.message || 'Failed to upload questions.';
          if (fileError) {
            fileError.textContent = message;
            fileError.classList.remove('hidden');
          } else {
            showToast(message, { type: 'error' });
          }
        } finally {
          if (fileButton) {
            fileButton.disabled = false;
            fileButton.textContent = originalLabel || 'Select Aiken file';
          }
          if (fileInput) {
            fileInput.value = '';
          }
        }
      });

      validateBtn?.addEventListener('click', async () => {
        if (!textarea) return;
        inlineError?.classList.add('hidden');
        if (inlineError) inlineError.textContent = '';
        previewContainer?.classList.add('hidden');
        failureSummary?.classList.add('hidden');
        if (previewList) previewList.innerHTML = '';
        if (failureList) failureList.innerHTML = '';

        const text = textarea.value.trim();
        if (!text) {
          if (inlineError) {
            inlineError.textContent = 'Paste Aiken formatted text before uploading.';
            inlineError.classList.remove('hidden');
          }
          textarea.focus();
          return;
        }

        const originalLabel = validateBtn.textContent;
        validateBtn.disabled = true;
        validateBtn.textContent = 'Validating…';

        try {
          const preview = await dataService.previewAikenContent(text);
          const questions = Array.isArray(preview?.questions) ? preview.questions : [];
          const diagnostics = Array.isArray(preview?.diagnostics)
            ? preview.diagnostics
            : [];
          const segments = extractQuestionSegments(textarea.value, diagnostics, questions.length);

          if (previewList && questions.length) {
            previewList.innerHTML = questions
              .map((question, index) => {
                const stem = question?.stem || '';
                const truncated = stem.length > 180 ? `${stem.slice(0, 177)}…` : stem;
                return `
                  <li class="flex items-start gap-2 border-b border-slate-100 py-1">
                    <span class="pt-0.5 text-xs font-semibold text-slate-500">${index + 1}</span>
                    <span class="flex-1 text-slate-700">${escapeHtml(truncated)}</span>
                  </li>
                `;
              })
              .join('');
          }
          if (questions.length) {
            previewContainer?.classList.remove('hidden');
          } else {
            if (inlineError) {
              inlineError.textContent = 'No valid questions were found. Check the formatting and try again.';
              inlineError.classList.remove('hidden');
            }
            return;
          }

          const proceed = window.confirm(
            `Parsed ${questions.length} question${questions.length === 1 ? '' : 's'}. Upload now?`
          );
          if (!proceed) {
            return;
          }

          validateBtn.textContent = `Uploading… 0/${questions.length}`;
          const { imported, failures } = await uploadPreviewedQuestionsSequentially({
            topicId,
            questions,
            segments,
            updateProgress: (completed, total) => {
              validateBtn.textContent = `Uploading… ${completed}/${total}`;
            },
          });

          if (imported > 0) {
            showToast(
              `${imported} question${imported === 1 ? '' : 's'} added to ${plainTopicName}.`,
              { type: 'success' }
            );
            refresh?.();
          }

          if (!failures.length) {
            textarea.value = '';
            previewContainer?.classList.add('hidden');
            if (previewList) previewList.innerHTML = '';
            inlineError?.classList.add('hidden');
            failureSummary?.classList.add('hidden');
            close();
            return;
          }

          const failureSegments = failures
            .map((failure) => failure.segment?.text || '')
            .filter(Boolean);
          if (failureSegments.length) {
            textarea.value = failureSegments.join('\n\n');
          }

          if (inlineError) {
            inlineError.textContent = `${failures.length} question${failures.length === 1 ? '' : 's'} couldn't be saved. They remain above so you can fix and retry.`;
            inlineError.classList.remove('hidden');
          }

          if (failureList) {
            failureList.innerHTML = failures
              .map((failure) => {
                const stem = failure.question?.stem || 'Question';
                const summary = stem.length > 160 ? `${stem.slice(0, 157)}…` : stem;
                const reason = failure.error?.message || failure.error?.cause?.message || 'Unknown error';
                const lineLabel = failure.segment?.startLine
                  ? `Line ${failure.segment.startLine}`
                  : null;
                return `
                  <li>
                    <div class="font-medium">${escapeHtml(summary)}</div>
                    <div class="text-xs">${lineLabel ? `${escapeHtml(lineLabel)} — ` : ''}${escapeHtml(reason)}</div>
                  </li>
                `;
              })
              .join('');
          }
          failureSummary?.classList.remove('hidden');

          setTimeout(() => {
            highlightTextareaLine(textarea, 1);
          }, 0);
        } catch (error) {
          console.error(error);
          const message = error?.message || 'Unable to process Aiken content.';
          if (inlineError) {
            inlineError.textContent = error?.context?.lineNumber
              ? `${message} (Line ${error.context.lineNumber})`
              : message;
            inlineError.classList.remove('hidden');
          } else {
            showToast(message, { type: 'error' });
          }
          if (textarea && error?.context?.lineNumber) {
            highlightTextareaLine(textarea, error.context.lineNumber);
          }
        } finally {
          validateBtn.disabled = false;
          validateBtn.textContent = originalLabel || 'Validate & upload';
        }
      });

      clearBtn?.addEventListener('click', () => {
        if (!textarea) return;
        textarea.value = '';
        inlineError?.classList.add('hidden');
        if (inlineError) inlineError.textContent = '';
        previewContainer?.classList.add('hidden');
        if (previewList) previewList.innerHTML = '';
        failureSummary?.classList.add('hidden');
        if (failureList) failureList.innerHTML = '';
        textarea.focus();
      });

      setTimeout(() => {
        textarea?.focus();
      }, 0);
    },
  });
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return value
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightTextareaLine(textarea, lineNumber) {
  if (!textarea || !lineNumber || lineNumber < 1) return;
  const lines = textarea.value.split('\n');
  let start = 0;
  for (let index = 0; index < lineNumber - 1 && index < lines.length; index += 1) {
    start += lines[index].length + 1;
  }
  const line = lines[lineNumber - 1] || '';
  const end = start + line.length;
  textarea.focus();
  textarea.setSelectionRange(start, end);
  const ratio = lines.length ? (lineNumber - 1) / lines.length : 0;
  textarea.scrollTop = ratio * textarea.scrollHeight;
  textarea.classList.add('ring-2', 'ring-red-500');
  setTimeout(() => textarea.classList.remove('ring-2', 'ring-red-500'), 1200);
}

function extractQuestionSegments(sourceText, diagnostics, expectedCount) {
  const normalized = (sourceText || '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const segments = [];

  if (Array.isArray(diagnostics) && diagnostics.length) {
    diagnostics.forEach((diag, index) => {
      const startLineRaw = Number(diag?.startLine);
      const endLineRaw = Number(diag?.endLine);
      const startLine = Number.isFinite(startLineRaw)
        ? startLineRaw
        : Number.isFinite(endLineRaw)
          ? endLineRaw
          : 1;
      const endLine = Number.isFinite(endLineRaw) ? endLineRaw : startLine;
      const startIndex = Math.max(startLine - 1, 0);
      const endIndex = Math.max(endLine - 1, startIndex);
      const slice = lines.slice(startIndex, endIndex + 1).join('\n').trim();
      segments.push({ index, text: slice, startLine, endLine });
    });
  }

  if (!segments.length) {
    normalized
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .forEach((chunk, index) => {
        segments.push({ index, text: chunk, startLine: null, endLine: null });
      });
  }

  while (segments.length < expectedCount) {
    segments.push({ index: segments.length, text: '', startLine: null, endLine: null });
  }

  return segments;
}

async function uploadPreviewedQuestionsSequentially({
  topicId,
  questions,
  segments,
  updateProgress,
}) {
  const total = Array.isArray(questions) ? questions.length : 0;
  let completed = 0;
  const failures = [];

  if (typeof updateProgress === 'function') {
    updateProgress(0, total);
  }

  for (let index = 0; index < total; index += 1) {
    const question = questions[index];
    const segment = Array.isArray(segments) ? segments[index] : null;
    try {
      await dataService.createQuestion(topicId, {
        stem: question?.stem?.trim() || '',
        options: Array.isArray(question?.options)
          ? question.options.map((option, optionIndex) => ({
              label: option.label || String.fromCharCode(65 + optionIndex),
              content: option.content,
              isCorrect: Boolean(option.isCorrect),
              order: Number.isFinite(option.order) ? option.order : optionIndex,
            }))
          : [],
      });
      completed += 1;
      if (typeof updateProgress === 'function') {
        updateProgress(completed, total);
      }
    } catch (error) {
      failures.push({ index, question, segment, error });
      if (typeof updateProgress === 'function') {
        updateProgress(completed, total);
      }
    }
  }

  return { imported: completed, failures };
}
