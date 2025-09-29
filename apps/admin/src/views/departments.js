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

      const uploadInput = document.createElement('input');
      uploadInput.type = 'file';
      uploadInput.accept = '.txt,.md,.aiken';
      uploadInput.className = 'hidden';
      container.appendChild(uploadInput);

      let activeUpload = null;

      uploadInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file || !activeUpload) {
          uploadInput.value = '';
          return;
        }

        const { topicId, button, topicName } = activeUpload;
        const originalLabel = button.textContent;
        button.textContent = 'Uploading...';
        button.disabled = true;

        try {
          const content = await file.text();
          const result = await dataService.importAikenQuestions(
            topicId,
            content
          );
          const count = result?.insertedCount ?? 0;
          showToast(
            `${count} question${count === 1 ? '' : 's'} added to ${topicName}.`,
            { type: 'success' }
          );
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Failed to upload questions.', {
            type: 'error',
          });
        } finally {
          button.textContent = originalLabel;
          button.disabled = false;
          uploadInput.value = '';
          activeUpload = null;
        }
      });

      container
        .querySelectorAll('[data-role="upload-aiken"]')
        .forEach((button) => {
          button.addEventListener('click', () => {
            activeUpload = {
              topicId: button.dataset.topicId,
              topicName: decodeURIComponent(button.dataset.topicName),
              button,
            };
            uploadInput.click();
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
