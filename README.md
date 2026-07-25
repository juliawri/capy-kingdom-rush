# 🦫 Capy Kingdom Rush 🐼

Hop across crocodile backs and bamboo platforms as a capybara, panda, or capyanda hybrid, racing toward the Gate of Capyanda Kingdom. Don't fall in the water or bonk an obstacle! Track your distance, speed, and score, then compare against your own past runs — and optionally add your score to a global leaderboard.

## 🎮 Playing locally

Because the game uses ES modules (`import`/`export`), you need to serve the files over `http://`, not open `index.html` directly from disk. From this folder, run any static server, for example:

```bash
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```

or

```bash
npx serve .
```

## 🌐 Publishing with GitHub Pages

1. Push this folder to a GitHub repository (as the root of the repo, or in a `docs/` folder).
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", choose **Deploy from a branch**, pick your branch (e.g. `main`) and the folder (`/root` or `/docs`).
4. Save — GitHub will give you a URL like `https://yourusername.github.io/your-repo/`.

No build step is required — it's plain HTML/CSS/JS.

## 🔥 Turning on the global leaderboard (Firebase)

The game works great with zero setup — everyone's scores and personal-best history are saved locally in their own browser. To turn on a **shared, global** leaderboard:

1. Go to the [Firebase console](https://console.firebase.google.com/) and create a new project (the free "Spark" plan is enough).
2. Click the **`</>`** (web app) icon to register a web app in the project. You don't need Firebase Hosting — just the config.
3. Firebase shows you a `firebaseConfig` object. Open **`firebase-config.js`** in this project and paste those exact values in.
4. In the left sidebar, go to **Build → Firestore Database → Create database**. Start in production mode.
5. Open the **Rules** tab for Firestore and paste in something like this, then publish:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /capyKingdomRushScores/{entry} {
         allow read: if true;
         allow create: if request.resource.data.name is string
                       && request.resource.data.name.size() <= 24
                       && request.resource.data.score is number
                       && request.resource.data.score >= 0
                       && request.resource.data.score <= 1000000;
         allow update, delete: if false;
       }
     }
   }
   ```

   This lets anyone read the leaderboard and submit a new score, but nobody can edit or delete existing entries, and it sanity-checks the submitted data.

6. Save `firebase-config.js` and reload the game — the "🚧 leaderboard not set up" message will disappear, and the checkbox on the game-over screen will let players opt in to submitting their score.

That's the only file you need to touch — `firebase-config.js` is designed to be a drop-in.

### Optional hardening

Firestore rules above are enough for a casual project, but a determined person can still spam scores from the browser console. If this becomes a problem, consider adding [Firebase App Check](https://firebase.google.com/docs/app-check) to the project.

## 🎨 Customizing characters

- Species and default/alternate look options live in `characters.js`.
- To add more looks, drop a transparent-background PNG into `assets/characters/` (or `assets/crocs/` for platform art) and add its filename to the relevant array in `characters.js`.
- The game currently ships with 3 species (Capybara 🦫, Panda 🐼, Capyanda 🌟), each with several selectable looks, plus 6 crocodile-back variants used at random for platforms.

## 🕹️ Gameplay & scoring notes

- Tap the game, or press **Space** / **↑** / **W**, to jump.
- Land on bamboo 🎋 or crocodile-back 🐊 platforms. Missing a jump = splash in the water. Landing on top of an obstacle (🪨🕸️🦂🔥🐝) without jumping high enough = game over too.
- Speed increases the farther you go (capped), and score is based on distance traveled, current speed, and clean jump bonuses.
- Reaching 2500m (the Gate of Capyanda Kingdom 🏯) gives a score bonus and a celebration — but the run keeps going afterward for bragging rights.
- All constants (gravity, speed ramp, gate distance, obstacle chance, etc.) are declared at the top of `game.js` if you want to tune difficulty.

## 📁 File overview

```
index.html            game + character-select screen
leaderboard.html       standalone global leaderboard page
style.css              shared visual theme
characters.js          character/crocodile art data
game.js                game engine (physics, rendering, scoring, game-over modal)
firebase-config.js     ← the only file you edit to enable the global leaderboard
leaderboard-db.js      Firebase read/write helpers used by game.js and leaderboard.html
assets/characters/     capybara, panda & capyanda icons
assets/crocs/          crocodile-back platform art
```

Have fun hopping! 🦫🐼✨
