# Car Parts Quiz

A Kahoot-style multiplayer quiz where teams build a dream car by choosing parts across five categories. Points are hidden until the final leaderboard.

## How to play

1. **Host:** Click "Create Game" and share the 6-character code.
2. **Players:** Enter the code and a team name, then click "Join."
3. **Start:** When everyone is in the lobby, the host clicks "Start Game."
4. **Rounds:** Each category (Body Type, Chassis, Engine, Interior, Electrical System) shows options—teams pick one per category. Points are secret.
5. **Results:** After all five categories, the leaderboard shows team names and total points.

## Run locally

```bash
npm install
npm start
```

Open **http://localhost:3000** in your browser. Use multiple tabs or devices to test with several teams.

---

## Why Netlify alone doesn’t work

This app uses a **Node.js server with Socket.io** for real-time multiplayer. Netlify only hosts **static files** (and short-lived serverless functions). It does **not** run a long-lived Node server or WebSockets, so you can’t deploy the whole app there and have the game work.

You have two options:

### Option A: Deploy the full app to Render (easiest)

[Render](https://render.com) can run the Node server and host the site in one place.

1. Push your repo to GitHub.
2. Go to [render.com](https://render.com) → **New** → **Web Service**.
3. Connect the repo, set **Build Command** to `npm install`, **Start Command** to `npm start`.
4. Deploy. Your game will be at `https://your-app-name.onrender.com`.

No Netlify needed; everything runs on Render.

### Option B: Frontend on Netlify + backend on Render

If you want the UI on Netlify and the game server elsewhere:

1. **Deploy the backend to Render** (same as Option A) and note the URL, e.g. `https://car-parts-quiz.onrender.com`.

2. **Deploy the frontend to Netlify:**
   - Connect your GitHub repo to Netlify.
   - In **Site settings** → **Environment variables**, add:
     - **Key:** `SOCKET_URL`  
     - **Value:** `https://your-render-app.onrender.com` (no trailing slash)
   - **Build command:** `node scripts/inject-env.js`  
   - **Publish directory:** `public`
   - Deploy.

The `netlify.toml` in the repo is already set up for this. The frontend will connect to your Render backend using `SOCKET_URL`.

---

## Tech

- **Backend:** Node.js, Express, Socket.io
- **Frontend:** HTML, CSS, JavaScript (vanilla)
- **Design:** Car-themed, dark UI with Unsplash images
