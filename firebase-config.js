// ============================================================================
//  🔥 FIREBASE CONFIG — this is the ONLY file you need to edit to turn on
//  the global leaderboard.
// ============================================================================
//
//  1. Go to https://console.firebase.google.com/  and create a project
//     (free "Spark" plan is enough).
//  2. In the project, click the "</>" (Web) icon to register a web app.
//  3. Firebase will show you a config object — copy those values into
//     `firebaseConfig` below (leave the quotes).
//  4. In the left sidebar, go to Build → Firestore Database → Create database
//     (start in production mode is fine — see README.md for the security
//     rules to paste in).
//  5. Save this file. That's it — no other code changes are required.
//
//  Until you fill this in, the game still works great, it just keeps the
//  leaderboard local to each player's browser instead of a global one.
// ============================================================================

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Name of the Firestore collection that stores leaderboard entries.
// Change it if you'd like, no need to create it manually — Firestore
// creates collections automatically on first write.
export const LEADERBOARD_COLLECTION = "capyKingdomRushScores";

// Max number of entries shown on the global leaderboard page.
export const LEADERBOARD_SIZE = 50;
