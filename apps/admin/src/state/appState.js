export class AppState extends EventTarget {
  constructor() {
    super();
    this.currentView = 'dashboard';
    this.selectedDepartmentId = null;
    this.selectedCourseId = null;
    this.selectedTopicId = null;
  }

  setView(view, { departmentId, courseId, topicId } = {}) {
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
    this._notify();
  }

  clearDepartmentSelection() {
    this.selectedDepartmentId = null;
    this.selectedCourseId = null;
    this.selectedTopicId = null;
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

  _notify() {
    this.dispatchEvent(
      new CustomEvent('change', {
        detail: {
          currentView: this.currentView,
          selectedDepartmentId: this.selectedDepartmentId,
          selectedCourseId: this.selectedCourseId,
          selectedTopicId: this.selectedTopicId,
        },
      })
    );
  }
}
