import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dataService } from './dataService.js';
import { getSupabaseClient } from '../../../shared/supabaseClient.js';

vi.mock('../../../shared/supabaseClient.js');

describe('DataService', () => {
  let mockSupabaseClient;

  beforeEach(() => {
    vi.resetAllMocks();
    mockSupabaseClient = {
      from: vi.fn(() => mockSupabaseClient),
      select: vi.fn(() => mockSupabaseClient),
      order: vi.fn(() => mockSupabaseClient),
      insert: vi.fn(() => mockSupabaseClient),
      update: vi.fn(() => mockSupabaseClient),
      delete: vi.fn(() => mockSupabaseClient),
      eq: vi.fn(() => mockSupabaseClient),
      single: vi.fn(),
      rpc: vi.fn(),
      storage: {
        from: vi.fn(() => mockSupabaseClient.storage),
        upload: vi.fn(),
        getPublicUrl: vi.fn(),
        remove: vi.fn(),
      },
    };
    getSupabaseClient.mockResolvedValue(mockSupabaseClient);
  });

  it('should list departments', async () => {
    const departments = [{ id: '1', name: 'Nursing', color_theme: 'blue' }];
    mockSupabaseClient.order.mockResolvedValue({ data: departments, error: null });

    const result = await dataService.listDepartments();

    expect(getSupabaseClient).toHaveBeenCalled();
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('departments');
    expect(mockSupabaseClient.select).toHaveBeenCalledWith('id, name, color_theme');
    expect(mockSupabaseClient.order).toHaveBeenCalledWith('name');
    expect(result).toEqual([{ id: '1', name: 'Nursing', color: 'blue' }]);
  });

  it('should create a department', async () => {
    const newDepartment = { name: 'Midwifery', color: 'purple' };
    const createdDepartment = { id: '2', name: 'Midwifery', color_theme: 'purple' };
    mockSupabaseClient.single.mockResolvedValue({ data: createdDepartment, error: null });

    const result = await dataService.createDepartment(newDepartment);

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('departments');
    expect(mockSupabaseClient.insert).toHaveBeenCalledWith({ name: 'Midwifery', color_theme: 'purple', slug: 'midwifery' });
    expect(result).toEqual({ id: '2', name: 'Midwifery', color: 'purple' });
  });

  it('should update a department', async () => {
    const updatedDepartment = { id: '1', name: 'Nursing Updated', color_theme: 'blue' };
    mockSupabaseClient.single.mockResolvedValue({ data: updatedDepartment, error: null });

    const result = await dataService.updateDepartment('1', { name: 'Nursing Updated' });

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('departments');
    expect(mockSupabaseClient.update).toHaveBeenCalledWith({ name: 'Nursing Updated', slug: 'nursing-updated' });
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', '1');
    expect(result).toEqual({ id: '1', name: 'Nursing Updated', color: 'blue' });
  });

  it('should delete a department', async () => {
    mockSupabaseClient.eq.mockResolvedValue({ error: null });

    const result = await dataService.deleteDepartment('1');

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('departments');
    expect(mockSupabaseClient.delete).toHaveBeenCalled();
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', '1');
    expect(result).toBe(true);
  });

  it('should list courses for a department', async () => {
    const courses = [{ id: '1', name: 'Course 1', description: '' }];
    mockSupabaseClient.order.mockResolvedValue({ data: courses, error: null });

    const result = await dataService.listCourses('1');

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('courses');
    expect(mockSupabaseClient.select).toHaveBeenCalledWith('id, department_id, name, description');
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('department_id', '1');
    expect(mockSupabaseClient.order).toHaveBeenCalledWith('name');
    expect(result).toEqual(courses);
  });

  it('should create a course', async () => {
    const newCourse = { name: 'Course 2', description: '' };
    const createdCourse = { id: '2', name: 'Course 2', description: '' };
    mockSupabaseClient.single.mockResolvedValue({ data: createdCourse, error: null });

    const result = await dataService.createCourse('1', newCourse);

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('courses');
    expect(mockSupabaseClient.insert).toHaveBeenCalledWith({ department_id: '1', name: 'Course 2', description: '', slug: 'course-2' });
    expect(result).toEqual(createdCourse);
  });

  it('should update a course', async () => {
    const updatedCourse = { id: '1', name: 'Course 1 Updated', description: '' };
    mockSupabaseClient.single.mockResolvedValue({ data: updatedCourse, error: null });

    const result = await dataService.updateCourse('1', { name: 'Course 1 Updated' });

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('courses');
    expect(mockSupabaseClient.update).toHaveBeenCalledWith({ name: 'Course 1 Updated', slug: 'course-1-updated' });
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', '1');
    expect(result).toEqual(updatedCourse);
  });

  it('should delete a course', async () => {
    mockSupabaseClient.eq.mockResolvedValue({ error: null });

    const result = await dataService.deleteCourse('1');

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('courses');
    expect(mockSupabaseClient.delete).toHaveBeenCalled();
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', '1');
    expect(result).toBe(true);
  });

  it('should get a topic', async () => {
    const topic = { id: '1', name: 'Topic 1', question_count: 0 };
    mockSupabaseClient.single.mockResolvedValue({ data: topic, error: null });

    const result = await dataService.getTopic('1');

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('topics');
    expect(mockSupabaseClient.select).toHaveBeenCalledWith('id, course_id, name, question_count');
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', '1');
    expect(result).toEqual(topic);
  });

  it('should list topics for a course', async () => {
    const topics = [{ id: '1', name: 'Topic 1', question_count: 0 }];
    mockSupabaseClient.order.mockResolvedValue({ data: topics, error: null });

    const result = await dataService.listTopics('1');

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('topics');
    expect(mockSupabaseClient.select).toHaveBeenCalledWith('id, course_id, name, question_count');
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('course_id', '1');
    expect(mockSupabaseClient.order).toHaveBeenCalledWith('name');
    expect(result).toEqual(topics);
  });

  it('should create a topic', async () => {
    const newTopic = { name: 'Topic 2', question_count: 0 };
    const createdTopic = { id: '2', name: 'Topic 2', question_count: 0 };
    mockSupabaseClient.single.mockResolvedValue({ data: createdTopic, error: null });

    const result = await dataService.createTopic('1', newTopic);

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('topics');
    expect(mockSupabaseClient.insert).toHaveBeenCalledWith({ course_id: '1', name: 'Topic 2', question_count: 0, slug: 'topic-2' });
    expect(result).toEqual(createdTopic);
  });

  it('should update a topic', async () => {
    const updatedTopic = { id: '1', name: 'Topic 1 Updated', question_count: 0 };
    mockSupabaseClient.single.mockResolvedValue({ data: updatedTopic, error: null });

    const result = await dataService.updateTopic('1', { name: 'Topic 1 Updated' });

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('topics');
    expect(mockSupabaseClient.update).toHaveBeenCalledWith({ name: 'Topic 1 Updated', slug: 'topic-1-updated' });
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', '1');
    expect(result).toEqual(updatedTopic);
  });

  it('should delete a topic', async () => {
    mockSupabaseClient.eq.mockResolvedValue({ error: null });

    const result = await dataService.deleteTopic('1');

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('topics');
    expect(mockSupabaseClient.delete).toHaveBeenCalled();
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', '1');
    expect(result).toBe(true);
  });

  it('should list questions for a topic', async () => {
    const questions = [{ id: '1', stem: 'Question 1', explanation: '', image_url: null, options: [] }];
    mockSupabaseClient.order.mockResolvedValue({ data: questions, error: null });

    const result = await dataService.listQuestions('1');

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('questions');
    expect(mockSupabaseClient.select).toHaveBeenCalledWith(`id, topic_id, question_type, stem, explanation, created_at, updated_at,
           question_options(id, label, content, is_correct, order_index)`);
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('topic_id', '1');
    expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result).toEqual(questions);
  });

  it('should create a question', async () => {
    const newQuestion = { stem: 'Question 2', options: [] };
    const createdQuestion = { id: '2', stem: 'Question 2', explanation: '', image_url: null, options: [] };
    mockSupabaseClient.single.mockResolvedValue({ data: createdQuestion, error: null });

    const result = await dataService.createQuestion('1', newQuestion);

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('questions');
    expect(mockSupabaseClient.insert).toHaveBeenCalledWith({ topic_id: '1', question_type: 'multiple_choice_single', stem: 'Question 2', explanation: '', metadata: {} });
    expect(result).toEqual(createdQuestion);
  });

  it('should update a question', async () => {
    const updatedQuestion = { id: '1', stem: 'Question 1 Updated', explanation: '', image_url: null, options: [] };
    mockSupabaseClient.single.mockResolvedValue({ data: updatedQuestion, error: null });

    const result = await dataService.updateQuestion('1', { stem: 'Question 1 Updated' });

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('questions');
    expect(mockSupabaseClient.update).toHaveBeenCalledWith({ stem: 'Question 1 Updated' });
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', '1');
    expect(result).toEqual(updatedQuestion);
  });

  it('should delete a question', async () => {
    mockSupabaseClient.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { topic_id: '1' }, error: null }),
      })),
      delete: vi.fn().mockReturnThis(),
    }));

    const result = await dataService.deleteQuestion('1');

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('questions');
    expect(result).toBe(true);
  });
});
