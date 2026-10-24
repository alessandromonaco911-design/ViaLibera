import { applyProgressAnswer, applyProgressExam, chooseDailyAdvice, emptyProgress, localDay, readProgress, type ProgressAnswer, type ProgressData, type ProgressExam } from "./model";

const databaseName = "vialibera-progress-v1";
export const progressChanged = "vialibera:progress-changed";
let connection: Promise<IDBDatabase> | null = null;
function database() {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("summary");
    request.onsuccess = () => {
      const db = request.result; db.onversionchange = () => { db.close(); connection = null; }; resolve(db);
    };
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => { connection = null; reject(new Error("Progress storage blocked")); };
  });
  return connection;
}
/** A single atomic transaction also serializes simultaneous writes from different app tabs. */
async function update(change: (data: ProgressData) => ProgressData): Promise<ProgressData> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("summary", "readwrite"), store = transaction.objectStore("summary");
    let result = emptyProgress(crypto.randomUUID());
    const request = store.get("current");
    request.onsuccess = () => {
      const current = readProgress(request.result, result.profile);
      result = change(current);
      if (result !== current || !request.result) store.put(result, "current");
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error ?? new Error("Progress storage unavailable"));
    transaction.onerror = () => reject(transaction.error);
  });
}
export async function loadProgress(): Promise<ProgressData> {
  return update(data => {
    const advice = chooseDailyAdvice(data, localDay());
    return data.advice === advice ? data : { ...data, advice };
  });
}
export async function recordProgressAnswers(answers: ProgressAnswer[], exam?: ProgressExam): Promise<boolean> {
  try {
    await update(data => {
      let next = data;
      for (const answer of answers) next = applyProgressAnswer(next, answer);
      return exam ? applyProgressExam(next, exam) : next;
    });
    window.dispatchEvent(new Event(progressChanged)); return true;
  } catch { return false; }
}
