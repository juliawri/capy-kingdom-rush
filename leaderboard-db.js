// Thin wrapper around Firebase so the rest of the game never has to think
// about whether Firebase is actually configured yet.
import { firebaseConfig, LEADERBOARD_COLLECTION, LEADERBOARD_SIZE } from "./firebase-config.js";

let appPromise = null;

export function isFirebaseConfigured() {
  return (
    !!firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith("YOUR_") &&
    !!firebaseConfig.projectId &&
    !firebaseConfig.projectId.startsWith("YOUR_")
  );
}

async function getDb() {
  if (!isFirebaseConfigured()) return null;
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp } = await import(
        "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js"
      );
      const firestore = await import(
        "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js"
      );
      const app = initializeApp(firebaseConfig);
      const db = firestore.getFirestore(app);
      return { db, firestore };
    })();
  }
  return appPromise;
}

// Submit one run to the global leaderboard. Resolves { ok: true } on
// success, or { ok: false, error } if Firebase isn't configured / the
// write failed (e.g. offline, or Firestore rules rejected it).
export async function submitScoreToLeaderboard({ name, score, distance, topSpeed, species, icon }) {
  try {
    const ctx = await getDb();
    if (!ctx) return { ok: false, error: "Firebase is not configured yet." };
    const { db, firestore } = ctx;
    await firestore.addDoc(firestore.collection(db, LEADERBOARD_COLLECTION), {
      name: String(name).slice(0, 24),
      score: Math.round(score),
      distance: Math.round(distance),
      topSpeed: Math.round(topSpeed * 10) / 10,
      species,
      icon,
      createdAt: firestore.serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    console.error("submitScoreToLeaderboard failed", err);
    return { ok: false, error: err.message || String(err) };
  }
}

// Fetch the top N scores, highest first.
export async function fetchLeaderboard(limitCount = LEADERBOARD_SIZE) {
  const ctx = await getDb();
  if (!ctx) return { ok: false, error: "Firebase is not configured yet.", entries: [] };
  try {
    const { db, firestore } = ctx;
    const q = firestore.query(
      firestore.collection(db, LEADERBOARD_COLLECTION),
      firestore.orderBy("score", "desc"),
      firestore.limit(limitCount)
    );
    const snap = await firestore.getDocs(q);
    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return { ok: true, entries };
  } catch (err) {
    console.error("fetchLeaderboard failed", err);
    return { ok: false, error: err.message || String(err), entries: [] };
  }
}
