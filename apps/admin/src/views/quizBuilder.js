export async function quizBuilderView() {
  return {
    html: `
      <section class="space-y-6">
        <header>
          <h1 class="text-2xl font-semibold text-gray-900">Quiz Builder</h1>
          <p class="text-gray-500">Connect the learner-facing quiz builder once the Supabase tables are in place.</p>
        </header>
        <article class="bg-white rounded-xl shadow p-6">
          <p class="text-sm text-gray-600">
            The quiz builder authoring tools live inside <code>apps/learner</code>. Wire up Supabase tables (<code>quiz_blueprints</code>, <code>quiz_blueprint_topics</code>, <code>quiz_attempts</code>)
            and expose APIs to list question templates, duplicate blueprints, and launch exams. This panel will surface analytics once the integration is complete.
          </p>
        </article>
      </section>
    `,
  };
}
