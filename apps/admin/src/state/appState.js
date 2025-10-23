export class AppState extends EventTarget {
  constructor(initialView = 'dashboard') {
    super();
    this.currentView = initialView;
    this.selectedDepartmentId = null;
    this.selectedCourseId = null;
    this.selectedTopicId = null;
    this.selectedExtraQuestionSetId = null;
  }

  setView(view, { departmentId, courseId, topicId, extraQuestionSetId } = {}) {
    if (this.currentView !== view) {
      this.currentView = view;
    }
    if (departmentId !== undefined) {
      this.selectedDepartmentId = departmentId;
    }
    if (courseId !== undefined) {
      this.selectedCourseId = courseId;
    }
    if (topicId !== undefined) {
      this.selectedTopicId = topicId;
    }
    if (extraQuestionSetId !== undefined) {
      this.selectedExtraQuestionSetId = extraQuestionSetId;
    }
    this._notify();
  }

  clearDepartmentSelection() {
    this.selectedDepartmentId = null;
    this.selectedCourseId = null;
    this.selectedTopicId = null;
    this.selectedExtraQuestionSetId = null;
    this._notify();
  }

  selectDepartment(departmentId) {
    this.selectedDepartmentId = departmentId;
    this.selectedCourseId = null;
    this.selectedTopicId = null;
    this._notify();
  }

  selectCourse(courseId) {
    this.selectedCourseId = courseId;
    this.selectedTopicId = null;
    this._notify();
  }

  selectTopic(topicId) {
    this.selectedTopicId = topicId;
    this._notify();
  }

  selectExtraQuestionSet(setId) {
    this.selectedExtraQuestionSetId = setId;
    this._notify();
  }

  clearExtraQuestionSet() {
    this.selectedExtraQuestionSetId = null;
    this._notify();
  }

  _notify() {
    this.dispatchEvent(
      new CustomEvent('change', {
        detail: {
          currentView: this.currentView,
          selectedDepartmentId: this.selectedDepartmentId,
          selectedCourseId: this.selectedCourseId,
          selectedTopicId: this.selectedTopicId,
          selectedExtraQuestionSetId: this.selectedExtraQuestionSetId,
        },
      })
    );
  }
}
