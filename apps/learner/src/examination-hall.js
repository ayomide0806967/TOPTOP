import { getSupabaseClient } from '../../shared/supabaseClient.js';

const form = document.getElementById('exam-hall-form');
const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');

function setStatus(message) {
  statusEl.textContent = message || '';
  statusEl.classList.toggle('hidden', !message);
}

function setError(message) {
  errorEl.textContent = message || '';
  errorEl.classList.toggle('hidden', !message);
}

function setLoading(loading) {
  startBtn.disabled = loading;
  startBtn.textContent = loading ? 'Checking…' : 'Start / Continue Exam';
}

function readTrimmed(id) {
  const el = document.getElementById(id);
  return (el?.value || '').toString().trim();
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError('');
  setStatus('');

  const pin = readTrimmed('pin');
  const admissionNo = readTrimmed('admissionNo');
  const firstName = readTrimmed('firstName');
  const lastName = readTrimmed('lastName');
  const phone = readTrimmed('phone');

  if (!pin || !admissionNo || !firstName || !lastName || !phone) {
    setError('Please fill in all fields.');
    return;
  }

  setLoading(true);
  setStatus('Validating PIN and admission number…');

  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('start_exam_hall', {
      p_pin: pin,
      p_admission_no: admissionNo,
      p_first_name: firstName,
      p_last_name: lastName,
      p_phone: phone,
    });
    if (error) throw error;

    const attemptId = data?.attempt?.id;
    if (!attemptId) {
      throw new Error('Unable to start exam. Please try again.');
    }

    const url = new URL(window.location.href);
    if (data?.status === 'completed' || data?.attempt?.completed_at) {
      url.pathname = url.pathname.replace(/[^/]+$/, 'result-face.html');
      url.searchParams.set('exam_hall_attempt', attemptId);
      window.location.assign(url.toString());
      return;
    }

    url.pathname = url.pathname.replace(/[^/]+$/, 'exam-face.html');
    url.searchParams.set('exam_hall_attempt', attemptId);
    window.location.assign(url.toString());
  } catch (err) {
    console.error('[Examination Hall] start failed', err);
    setError(err?.message || 'Unable to start exam. Please try again.');
    setStatus('');
  } finally {
    setLoading(false);
  }
});
