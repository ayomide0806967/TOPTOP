import {
  getSupabaseClient,
  SupabaseConfigurationError,
} from '../../../shared/supabaseClient.js';
import { authService } from '../../../shared/auth.js';
import { recordError } from '../../../shared/instrumentation.js';

export class QuizBuilderServiceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'QuizBuilderServiceError';
    if (options.cause) this.cause = options.cause;
    if (options.context) this.context = options.context;
  }
}

function mapSupabaseError(error, context) {
  if (!error) return null;
  const message = error.message || 'Unexpected Supabase error';
  const options = { cause: error, context };
  if (error.code === '42P01' || message.includes('relation') && message.includes('does not exist')) {
    return new QuizBuilderServiceError(
      'Quiz tables are missing. Run the latest Supabase migrations for quiz blueprints and classrooms.',
      options
    );
  }
  if (error.code === '42501') {
    return new QuizBuilderServiceError(
      'Permission denied. Check Supabase policies for quiz builder tables.',
      options
    );
  }
  if (error.code === '23505') {
    return new QuizBuilderServiceError(
      'Duplicate entry detected. Please choose a unique name.',
      options
    );
  }
  return new QuizBuilderServiceError(message, options);
}

export class QuizBuilderService {
  constructor() {
    this.clientPromise = getSupabaseClient();
  }

  async _client() {
    try {
      return await this.clientPromise;
    } catch (error) {
      if (error instanceof SupabaseConfigurationError) {
        throw new QuizBuilderServiceError(error.message, { cause: error });
      }
      throw error;
    }
  }

  async listBlueprints() {
    const client = await this._client();
    const { data, error } = await client
      .from('quiz_blueprints')
      .select(
        `
        id,
        title,
        description,
        status,
        total_questions,
        estimated_duration_seconds,
        updated_at,
        created_at,
        owner_id,
        settings
      `
      )
      .order('updated_at', { ascending: false });
    if (error) throw mapSupabaseError(error, { operation: 'listBlueprints' });
    return Array.isArray(data) ? data : [];
  }

  async createBlueprint(payload) {
    const client = await this._client();
    const { data, error } = await client
      .from('quiz_blueprints')
      .insert([
        {
          title: payload.title,
          description: payload.description ?? '',
          status: 'draft',
          settings: payload.settings ?? {},
        },
      ])
      .select()
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'createBlueprint' });
    return data;
  }

  async updateBlueprint(id, changes) {
    const client = await this._client();
    const { data, error } = await client
      .from('quiz_blueprints')
      .update({
        title: changes.title,
        description: changes.description,
        status: changes.status,
        settings: changes.settings,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'updateBlueprint' });
    return data;
  }

  async duplicateBlueprint(id) {
    const client = await this._client();
    const { data, error } = await client.rpc('duplicate_quiz_blueprint', {
      p_blueprint_id: id,
    });
    if (error) throw mapSupabaseError(error, { operation: 'duplicateBlueprint' });
    return data;
  }

  async archiveBlueprint(id) {
    const client = await this._client();
    const { error } = await client
      .from('quiz_blueprints')
      .update({ status: 'archived' })
      .eq('id', id);
    if (error) throw mapSupabaseError(error, { operation: 'archiveBlueprint' });
  }

  async listClassrooms() {
    const client = await this._client();
    const { data, error } = await client
      .from('classrooms')
      .select(
        `
        id,
        name,
        access_mode,
        seat_quota,
        active_participants,
        pending_invites,
        status,
        scheduled_exam_count,
        next_exam_at,
        created_at
      `
      )
      .order('created_at', { ascending: false });
    if (error) throw mapSupabaseError(error, { operation: 'listClassrooms' });
    return Array.isArray(data) ? data : [];
  }

  async createClassroom(payload) {
    const client = await this._client();
    const { data, error } = await client
      .from('classrooms')
      .insert([
        {
          name: payload.name,
          purpose: payload.purpose ?? null,
          access_mode: payload.accessMode ?? 'invite_only',
          seat_quota: payload.seatQuota ?? 10,
          join_pin: payload.joinPin ?? null,
          join_link_token: payload.joinLinkToken ?? null,
          join_phone_whitelist: payload.phoneWhitelist ?? [],
          status: 'active',
        },
      ])
      .select()
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'createClassroom' });
    return data;
  }

  async scheduleExam(payload) {
    const client = await this._client();
    const { data, error } = await client
      .from('classroom_exams')
      .insert([
        {
          classroom_id: payload.classroomId,
          quiz_blueprint_id: payload.blueprintId,
          starts_at: payload.startsAt,
          ends_at: payload.endsAt,
          delivery_mode: payload.deliveryMode ?? 'synchronous',
          pin_required: payload.pinRequired ?? false,
          access_pin: payload.accessPin ?? null,
          invite_only: payload.inviteOnly ?? false,
          visibility: payload.visibility ?? 'classroom',
        },
      ])
      .select(
        `
        id,
        classroom_id,
        quiz_blueprint_id,
        starts_at,
        ends_at,
        delivery_mode,
        status
      `
      )
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'scheduleExam' });
    return data;
  }

  async listUpcomingExams() {
    const client = await this._client();
    const { data, error } = await client
      .from('classroom_exams_view')
      .select('*')
      .order('starts_at', { ascending: true })
      .limit(20);
    if (error) throw mapSupabaseError(error, { operation: 'listUpcomingExams' });
    return Array.isArray(data) ? data : [];
  }

  async listSharedQuizzes() {
    const client = await this._client();
    const { data, error } = await client
      .from('quiz_distribution_links')
      .select(
        `
        id,
        quiz_blueprint_id,
        title,
        max_participants,
        status,
        submissions,
        created_at,
        last_submission_at
      `
      )
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw mapSupabaseError(error, { operation: 'listSharedQuizzes' });
    return Array.isArray(data) ? data : [];
  }

  async getSubscriptionSummary() {
    const client = await this._client();
    const { data, error } = await client
      .from('quiz_subscription_summary')
      .select('*')
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'getSubscriptionSummary' });
    return data;
  }

  async initiateSeatIncrease(additionalSeats) {
    if (!additionalSeats || additionalSeats <= 0) {
      throw new QuizBuilderServiceError('Seat increase must be greater than zero.');
    }
    const client = await this._client();
    const { data, error } = await client.functions.invoke('quiz-seat-upgrade', {
      body: { additionalSeats },
      // Ensure Edge Function receives our app token expected by decodeToken()
      headers: authService.getAuthHeaders(),
    });
    if (error) throw mapSupabaseError(error, { operation: 'initiateSeatIncrease' });
    if (data?.error) {
      throw new QuizBuilderServiceError(data.error, { context: data });
    }
    return data;
  }

  async subscribeToExamChannel(examId, handler) {
    const client = await this._client();
    const channel = client
      .channel(`exam-monitor-${examId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exam_attempt_events', filter: `exam_id=eq.${examId}` },
        handler
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          recordError('QuizBuilderService', new Error('Real-time channel failed'), {
            examId,
          });
        }
      });
    return channel;
  }

  async getClassroomDetail(id) {
    if (!id) throw new QuizBuilderServiceError('Classroom ID is required.');
    const client = await this._client();
    const { data, error } = await client
      .from('classrooms_view')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'getClassroomDetail', id });
    return data;
  }

  async listClassroomMembers(id) {
    if (!id) throw new QuizBuilderServiceError('Classroom ID is required.');
    const client = await this._client();
    const { data, error } = await client
      .from('classroom_members_view')
      .select('*')
      .eq('classroom_id', id)
      .order('joined_at', { ascending: false });
    if (error) throw mapSupabaseError(error, { operation: 'listClassroomMembers', id });
    return Array.isArray(data) ? data : [];
  }

  async listClassroomExams(id) {
    if (!id) throw new QuizBuilderServiceError('Classroom ID is required.');
    const client = await this._client();
    const { data, error } = await client
      .from('classroom_exams_view')
      .select('*')
      .eq('classroom_id', id)
      .order('starts_at', { ascending: false });
    if (error) throw mapSupabaseError(error, { operation: 'listClassroomExams', id });
    return Array.isArray(data) ? data : [];
  }

  async getExamDetail(id) {
    if (!id) throw new QuizBuilderServiceError('Exam ID is required.');
    const client = await this._client();
    const { data, error } = await client
      .from('classroom_exams_view')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'getExamDetail', id });
    return data;
  }

  async listExamAttempts(id) {
    if (!id) throw new QuizBuilderServiceError('Exam ID is required.');
    const client = await this._client();
    const { data, error } = await client
      .from('exam_attempts_view')
      .select('*')
      .eq('exam_id', id)
      .order('started_at', { ascending: true });
    if (error) throw mapSupabaseError(error, { operation: 'listExamAttempts', id });
    return Array.isArray(data) ? data : [];
  }

  async getSharedQuizDetail(id) {
    if (!id) throw new QuizBuilderServiceError('Share link ID is required.');
    const client = await this._client();
    const { data, error } = await client
      .from('quiz_distribution_links')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'getSharedQuizDetail', id });
    return data;
  }

  async listSharedQuizAttempts(id) {
    if (!id) throw new QuizBuilderServiceError('Share link ID is required.');
    const client = await this._client();
    const { data, error } = await client
      .from('quiz_distribution_attempts_view')
      .select('*')
      .eq('distribution_id', id)
      .order('submitted_at', { ascending: false });
    if (error) throw mapSupabaseError(error, { operation: 'listSharedQuizAttempts', id });
    return Array.isArray(data) ? data : [];
  }

  async getBlueprintDetail(id) {
    if (!id) throw new QuizBuilderServiceError('Blueprint ID is required.');
    const client = await this._client();
    const { data, error } = await client
      .from('quiz_blueprints')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'getBlueprintDetail', id });
    return data;
  }

  async getBlueprintQuestions(blueprintId) {
    if (!blueprintId) throw new QuizBuilderServiceError('Blueprint ID is required.');
    const client = await this._client();
    const { data, error } = await client
      .from('quiz_questions')
      .select('*')
      .eq('blueprint_id', blueprintId)
      .order('order_index', { ascending: true });
    if (error) throw mapSupabaseError(error, { operation: 'getBlueprintQuestions', blueprintId });
    return Array.isArray(data) ? data : [];
  }

  async createQuestion(blueprintId, questionData) {
    if (!blueprintId) throw new QuizBuilderServiceError('Blueprint ID is required.');
    const client = await this._client();

    // Get the next order index
    const { data: existingQuestions } = await client
      .from('quiz_questions')
      .select('order_index')
      .eq('blueprint_id', blueprintId)
      .order('order_index', { ascending: false })
      .limit(1);

    const nextOrderIndex = existingQuestions && existingQuestions.length > 0
      ? (existingQuestions[0].order_index || 0) + 1
      : 1;

    const { data, error } = await client
      .from('quiz_questions')
      .insert([
        {
          blueprint_id: blueprintId,
          type: questionData.type,
          text: questionData.text,
          points: questionData.points,
          time_limit_seconds: questionData.timeLimit,
          explanation: questionData.explanation,
          options: questionData.options,
          correct_answer: questionData.correctAnswer,
          rubric: questionData.rubric,
          order_index: nextOrderIndex,
        },
      ])
      .select()
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'createQuestion', blueprintId });
    return data;
  }

  async updateQuestion(questionId, questionData) {
    if (!questionId) throw new QuizBuilderServiceError('Question ID is required.');
    const client = await this._client();
    const { data, error } = await client
      .from('quiz_questions')
      .update({
        type: questionData.type,
        text: questionData.text,
        points: questionData.points,
        time_limit_seconds: questionData.timeLimit,
        explanation: questionData.explanation,
        options: questionData.options,
        correct_answer: questionData.correctAnswer,
        rubric: questionData.rubric,
      })
      .eq('id', questionId)
      .select()
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'updateQuestion', questionId });
    return data;
  }

  async deleteQuestion(questionId) {
    if (!questionId) throw new QuizBuilderServiceError('Question ID is required.');
    const client = await this._client();
    const { error } = await client
      .from('quiz_questions')
      .delete()
      .eq('id', questionId);
    if (error) throw mapSupabaseError(error, { operation: 'deleteQuestion', questionId });
  }

  async duplicateQuestion(questionId) {
    if (!questionId) throw new QuizBuilderServiceError('Question ID is required.');
    const client = await this._client();
    const { data, error } = await client.rpc('duplicate_quiz_question', {
      p_question_id: questionId,
    });
    if (error) throw mapSupabaseError(error, { operation: 'duplicateQuestion', questionId });
    return data;
  }

  async reorderQuestions(blueprintId, questionIds) {
    if (!blueprintId) throw new QuizBuilderServiceError('Blueprint ID is required.');
    if (!questionIds || !Array.isArray(questionIds)) throw new QuizBuilderServiceError('Question IDs array is required.');

    const client = await this._client();
    const updates = questionIds.map((id, index) => ({
      id,
      order_index: index + 1,
    }));

    const { error } = await client.rpc('reorder_quiz_questions', {
      p_blueprint_id: blueprintId,
      p_question_updates: updates,
    });
    if (error) throw mapSupabaseError(error, { operation: 'reorderQuestions', blueprintId });
  }

  async scheduleExamFromClassroom(classroomId, examData) {
    if (!classroomId) throw new QuizBuilderServiceError('Classroom ID is required.');
    const client = await this._client();

    const { data, error } = await client
      .from('classroom_exams')
      .insert([
        {
          classroom_id: classroomId,
          quiz_blueprint_id: examData.blueprintId,
          starts_at: examData.startsAt,
          ends_at: examData.endsAt,
          delivery_mode: examData.deliveryMode || 'synchronous',
          pin_required: examData.pinRequired || false,
          access_pin: examData.accessPin || null,
          invite_only: examData.inviteOnly || false,
          visibility: examData.visibility || 'classroom',
          max_attempts: examData.maxAttempts || 1,
          passing_score: examData.passingScore || 70,
        },
      ])
      .select()
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'scheduleExamFromClassroom', classroomId });
    return data;
  }

  async inviteClassroomMember(classroomId, memberData) {
    if (!classroomId) throw new QuizBuilderServiceError('Classroom ID is required.');
    const client = await this._client();

    const { data, error } = await client
      .from('classroom_invitations')
      .insert([
        {
          classroom_id: classroomId,
          email: memberData.email,
          phone: memberData.phone,
          display_name: memberData.displayName,
          role: memberData.role || 'student',
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      ])
      .select()
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'inviteClassroomMember', classroomId });
    return data;
  }

  async removeClassroomMember(classroomId, memberId) {
    if (!classroomId) throw new QuizBuilderServiceError('Classroom ID is required.');
    if (!memberId) throw new QuizBuilderServiceError('Member ID is required.');
    const client = await this._client();

    const { error } = await client
      .from('classroom_members')
      .delete()
      .eq('classroom_id', classroomId)
      .eq('id', memberId);
    if (error) throw mapSupabaseError(error, { operation: 'removeClassroomMember', classroomId, memberId });
  }

  async suspendClassroomMember(classroomId, memberId) {
    if (!classroomId) throw new QuizBuilderServiceError('Classroom ID is required.');
    if (!memberId) throw new QuizBuilderServiceError('Member ID is required.');
    const client = await this._client();

    const { error } = await client
      .from('classroom_members')
      .update({ status: 'suspended' })
      .eq('classroom_id', classroomId)
      .eq('id', memberId);
    if (error) throw mapSupabaseError(error, { operation: 'suspendClassroomMember', classroomId, memberId });
  }

  async resetMemberAttempts(classroomId, memberId) {
    if (!classroomId) throw new QuizBuilderServiceError('Classroom ID is required.');
    if (!memberId) throw new QuizBuilderServiceError('Member ID is required.');
    const client = await this._client();

    const { error } = await client.rpc('reset_member_attempts', {
      p_classroom_id: classroomId,
      p_member_id: memberId,
    });
    if (error) throw mapSupabaseError(error, { operation: 'resetMemberAttempts', classroomId, memberId });
  }

  async getQuizAnalytics(blueprintId, filters = {}) {
    if (!blueprintId) throw new QuizBuilderServiceError('Blueprint ID is required.');
    const client = await this._client();

    let query = client
      .from('quiz_analytics_view')
      .select('*')
      .eq('blueprint_id', blueprintId);

    if (filters.startDate) {
      query = query.gte('completed_at', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('completed_at', filters.endDate);
    }
    if (filters.classroomId) {
      query = query.eq('classroom_id', filters.classroomId);
    }

    const { data, error } = await query.order('completed_at', { ascending: false });
    if (error) throw mapSupabaseError(error, { operation: 'getQuizAnalytics', blueprintId });
    return Array.isArray(data) ? data : [];
  }

  async exportClassroomRoster(classroomId, format = 'csv') {
    if (!classroomId) throw new QuizBuilderServiceError('Classroom ID is required.');
    const client = await this._client();

    const { data, error } = await client.rpc('export_classroom_roster', {
      p_classroom_id: classroomId,
      p_format: format,
    });
    if (error) throw mapSupabaseError(error, { operation: 'exportClassroomRoster', classroomId });
    return data;
  }

  async getQuestionAnalytics(questionId) {
    if (!questionId) throw new QuizBuilderServiceError('Question ID is required.');
    const client = await this._client();

    const { data, error } = await client
      .from('question_analytics_view')
      .select('*')
      .eq('question_id', questionId)
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'getQuestionAnalytics', questionId });
    return data;
  }

  async uploadQuestionMedia(file, questionId) {
    if (!file) throw new QuizBuilderServiceError('File is required.');
    if (!questionId) throw new QuizBuilderServiceError('Question ID is required.');
    const client = await this._client();

    const fileName = `question-${questionId}-${Date.now()}-${file.name}`;
    const { data, error } = await client.storage
      .from('quiz-media')
      .upload(fileName, file);

    if (error) throw mapSupabaseError(error, { operation: 'uploadQuestionMedia', questionId });

    const { data: publicUrl } = client.storage
      .from('quiz-media')
      .getPublicUrl(fileName);

    return {
      path: data.path,
      url: publicUrl.publicUrl,
      type: file.type,
      size: file.size,
    };
  }

  async deleteQuestionMedia(mediaPath) {
    if (!mediaPath) throw new QuizBuilderServiceError('Media path is required.');
    const client = await this._client();

    const { error } = await client.storage
      .from('quiz-media')
      .remove([mediaPath]);

    if (error) throw mapSupabaseError(error, { operation: 'deleteQuestionMedia', mediaPath });
  }

  async getAttemptResponses(attemptId) {
    if (!attemptId) throw new QuizBuilderServiceError('Attempt ID is required.');
    const client = await this._client();

    const { data, error } = await client
      .from('quiz_attempt_responses')
      .select('*')
      .eq('attempt_id', attemptId)
      .order('question_order', { ascending: true });
    if (error) throw mapSupabaseError(error, { operation: 'getAttemptResponses', attemptId });
    return Array.isArray(data) ? data : [];
  }

  async getBlueprintStats(blueprintId) {
    if (!blueprintId) throw new QuizBuilderServiceError('Blueprint ID is required.');
    const client = await this._client();

    const { data, error } = await client
      .from('quiz_blueprint_stats')
      .select('*')
      .eq('blueprint_id', blueprintId)
      .single();
    if (error) throw mapSupabaseError(error, { operation: 'getBlueprintStats', blueprintId });
    return data;
  }

  async getBlueprintQuestionStats(blueprintId) {
    if (!blueprintId) throw new QuizBuilderServiceError('Blueprint ID is required.');
    const client = await this._client();

    const { data, error } = await client
      .from('quiz_question_stats')
      .select('*')
      .eq('blueprint_id', blueprintId)
      .order('correct_rate', { ascending: false });
    if (error) throw mapSupabaseError(error, { operation: 'getBlueprintQuestionStats', blueprintId });
    return Array.isArray(data) ? data : [];
  }

  async generateQuizReport(blueprintId, format = 'csv', filters = {}) {
    if (!blueprintId) throw new QuizBuilderServiceError('Blueprint ID is required.');
    const client = await this._client();

    const { data, error } = await client.rpc('generate_quiz_report', {
      p_blueprint_id: blueprintId,
      p_format: format,
      p_filters: filters,
    });
    if (error) throw mapSupabaseError(error, { operation: 'generateQuizReport', blueprintId });
    return data;
  }
}

export const quizBuilderService = new QuizBuilderService();
