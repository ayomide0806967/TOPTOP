import { dataService } from '../services/dataService.js';
import { showToast } from '../components/toast.js';

export async function questionsView(state) {
  const topic = await dataService.getTopic(state.selectedTopicId);
  let questions = await dataService.listQuestions(state.selectedTopicId);

  const renderQuestions = (searchTerm = '') => {
    const filteredQuestions = questions.filter((q) =>
      q.stem.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return filteredQuestions.map((q) => renderQuestion(q, searchTerm)).join('');
  };

  return {
    html: `
      <section class="space-y-6">
        <header class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-semibold text-gray-900">Manage Questions for ${topic.name}</h1>
            <p class="text-gray-500">Create, edit, and search questions for this topic.</p>
          </div>
          <button type="button" class="bg-cyan-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-cyan-800" data-role="create-question">Add Question</button>
        </header>
        <div id="question-form-container" class="hidden"></div>
        <div class="space-y-4">
          <input type="search" id="question-search" class="w-full border border-gray-300 rounded-md p-2" placeholder="Search questions...">
          <div id="question-list" class="space-y-4">
            ${renderQuestions()}
          </div>
        </div>
      </section>
    `,
    onMount(container, appState, actions) {
      const searchInput = container.querySelector('#question-search');
      const questionList = container.querySelector('#question-list');
      const createButton = container.querySelector(
        '[data-role="create-question"]'
      );
      const formContainer = container.querySelector('#question-form-container');

      const openQuestionForm = (question) => {
        formContainer.innerHTML = renderQuestionForm(question);
        formContainer.classList.remove('hidden');
        attachFormListeners(
          formContainer,
          question,
          actions,
          () => {
            formContainer.innerHTML = '';
            formContainer.classList.add('hidden');
          },
          appState.selectedTopicId
        );
      };

      createButton.addEventListener('click', () => openQuestionForm(null));

      searchInput.addEventListener('input', (e) => {
        questionList.innerHTML = renderQuestions(e.target.value);
      });

      questionList.addEventListener('click', (e) => {
        if (e.target.dataset.role === 'edit-question') {
          const question = questions.find((q) => q.id === e.target.dataset.id);
          openQuestionForm(question);
        }
        if (e.target.dataset.role === 'delete-question') {
          // TODO: Add confirmation modal
          dataService.deleteQuestion(e.target.dataset.id).then(() => {
            showToast('Question deleted.', { type: 'success' });
            actions.refresh();
          });
        }
      });
    },
  };
}

function renderQuestion(question, searchTerm = '') {
  const highlightedStem = searchTerm
    ? question.stem.replace(
        new RegExp(searchTerm, 'gi'),
        (match) => `<mark>${match}</mark>`
      )
    : question.stem;

  return `
    <div class="bg-white p-4 rounded-lg shadow">
      <div class="flex justify-between">
        <p>${highlightedStem}</p>
        <div>
          <button data-role="edit-question" data-id="${question.id}" class="text-sm text-cyan-700">Edit</button>
          <button data-role="delete-question" data-id="${question.id}" class="text-sm text-red-600">Delete</button>
        </div>
      </div>
      ${question.image_url ? `<img src="${question.image_url}" class="mt-2 max-h-48">` : ''}
    </div>
  `;
}

function renderQuestionForm(question) {
  return `
    <div class="bg-white p-6 rounded-lg shadow">
      <h2 class="text-xl font-semibold mb-4">${question ? 'Edit' : 'Create'} Question</h2>
      <form id="question-form">
        <div class="space-y-4">
          <label class="block">
            <span class="text-gray-700">Question Stem</span>
            <textarea name="stem" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" rows="3">${question?.stem ?? ''}</textarea>
          </label>
          <label class="block">
            <span class="text-gray-700">Explanation</span>
            <textarea name="explanation" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" rows="2">${question?.explanation ?? ''}</textarea>
          </label>
          <div>
            <span class="text-gray-700">Image</span>
            <input type="file" name="image" accept="image/*" class="mt-1 block w-full">
            ${question?.image_url ? `<img src="${question.image_url}" class="mt-2 max-h-48">` : ''}
          </div>
          <div id="options-container"></div>
          <button type="button" id="add-option" class="bg-gray-200 py-2 px-4 rounded-lg">Add Option</button>
        </div>
        <div class="flex justify-end mt-4">
          <button type="button" id="cancel-edit" class="mr-2 bg-gray-200 py-2 px-4 rounded-lg">Cancel</button>
          <button type="submit" class="bg-cyan-700 text-white font-semibold py-2 px-4 rounded-lg">Save Question</button>
        </div>
      </form>
    </div>
  `;
}

function attachFormListeners(container, question, actions, close, topicId) {
  const form = container.querySelector('#question-form');
  const optionsContainer = container.querySelector('#options-container');
  const addOptionBtn = container.querySelector('#add-option');
  const cancelBtn = container.querySelector('#cancel-edit');

  const addOptionRow = (option = {}) => {
    const optionEl = document.createElement('div');
    optionEl.classList.add('flex', 'items-center', 'space-x-2', 'mb-2');
    optionEl.innerHTML = `
        <input type="text" value="${option.content || ''}" class="w-full border border-gray-300 rounded-md p-2" placeholder="Option content">
        <input type="checkbox" ${option.isCorrect ? 'checked' : ''}>
        <button type="button" class="text-red-500">Remove</button>
    `;
    optionEl.querySelector('button').addEventListener('click', () => {
      optionEl.remove();
    });
    optionsContainer.appendChild(optionEl);
  };

  if (question && question.options) {
    question.options.forEach(addOptionRow);
  } else {
    addOptionRow();
    addOptionRow();
  }

  addOptionBtn.addEventListener('click', () => addOptionRow());
  cancelBtn.addEventListener('click', close);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const imageFile = formData.get('image');

    const payload = {
      stem: formData.get('stem'),
      explanation: formData.get('explanation'),
      options: [...optionsContainer.children].map((optionEl) => {
        const inputs = optionEl.querySelectorAll('input');
        return {
          content: inputs[0].value,
          isCorrect: inputs[1].checked,
        };
      }),
      imageFile: imageFile.size > 0 ? imageFile : null,
    };

    try {
      if (question) {
        await dataService.updateQuestion(question.id, payload);
        showToast('Question updated.', { type: 'success' });
      } else {
        await dataService.createQuestion(topicId, payload);
        showToast('Question created.', { type: 'success' });
      }
      close();
      actions.refresh();
    } catch (error) {
      showToast(error.message, { type: 'error' });
    }
  });
}
