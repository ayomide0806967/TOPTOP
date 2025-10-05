const STORAGE_KEY = 'an.quizSnapshots';
const MAX_ENTRIES = 12;

function getLocalStorageSafe() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch (error) {
    console.warn('[QuizSnapshotStore] localStorage unavailable', error);
  }
  return null;
}

function readSnapshots() {
  const storage = getLocalStorageSafe();
  if (!storage) return [];
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[QuizSnapshotStore] Failed to parse snapshots', error);
    storage.removeItem(STORAGE_KEY);
    return [];
  }
}

function writeSnapshots(entries) {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn('[QuizSnapshotStore] Failed to persist snapshots', error);
  }
}

export function listQuizSnapshots() {
  return readSnapshots();
}

export function getQuizSnapshot(subscriptionId, assignedDate) {
  if (!subscriptionId) return null;
  const snapshots = readSnapshots();
  const matches = snapshots.filter(
    (entry) => entry.subscriptionId === subscriptionId,
  );

  if (!matches.length) {
    return null;
  }

  if (assignedDate) {
    return (
      matches.find((entry) => entry.assignedDate === assignedDate) || null
    );
  }

  return matches
    .slice()
    .sort((a, b) => new Date(b.storedAt) - new Date(a.storedAt))[0];
}

export function saveQuizSnapshot({
  subscriptionId,
  assignedDate,
  quiz,
  questions,
}) {
  if (!subscriptionId || !assignedDate || !quiz || !questions) {
    return;
  }

  const snapshots = readSnapshots().filter(
    (entry) =>
      !(
        entry.subscriptionId === subscriptionId &&
        entry.assignedDate === assignedDate
      )
  );

  const sanitizedQuiz = JSON.parse(JSON.stringify(quiz));
  const sanitizedQuestions = JSON.parse(JSON.stringify(questions));

  snapshots.push({
    subscriptionId,
    assignedDate,
    storedAt: new Date().toISOString(),
    quiz: sanitizedQuiz,
    questions: sanitizedQuestions,
  });

  snapshots.sort((a, b) => new Date(b.storedAt) - new Date(a.storedAt));

  writeSnapshots(snapshots.slice(0, MAX_ENTRIES));
}

export function removeQuizSnapshot(subscriptionId, assignedDate) {
  if (!subscriptionId) return;
  const snapshots = readSnapshots().filter((entry) => {
    if (entry.subscriptionId !== subscriptionId) return true;
    if (!assignedDate) return false;
    return entry.assignedDate !== assignedDate;
  });
  writeSnapshots(snapshots);
}
