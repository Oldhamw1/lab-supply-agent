# Lab Supply Agent

AI-powered R&D inventory and order management. Built with React + Vite, deployed on Vercel, powered by Claude.

## Deploy to Vercel (5 steps)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/lab-supply-agent.git
git push -u origin main
```

### 2. Import to Vercel
- Go to https://vercel.com/new
- Click **"Import Git Repository"**
- Select your `lab-supply-agent` repo
- Framework will auto-detect as **Vite** ✓

### 3. Add your API key
In the Vercel import screen (or later under Project Settings → Environment Variables):
```
Name:  ANTHROPIC_API_KEY
Value: sk-ant-xxxxxxxxxxxx
```

### 4. Deploy
Click **Deploy**. Vercel builds and deploys in ~60 seconds.

### 5. Done
Your app is live at `https://lab-supply-agent-[hash].vercel.app`

---

## Local development

```bash
npm install
cp .env.example .env.local
# Add your key to .env.local

# Run Vite dev server + Vercel functions together:
npx vercel dev
# Or just the frontend (API calls will fail without the proxy):
npm run dev
```

For local dev with the API proxy working, `npx vercel dev` is the easiest path — it runs both the Vite frontend and the `/api/agent` serverless function together on port 3000.

---

## Architecture

```
Browser (React/Vite)
    │
    ├── localStorage  (inventory, orders, chat history)
    │
    └── POST /api/agent   ← Vercel serverless function
              │
              └── Anthropic API  (key stored server-side only)
```

## Adding inventory items
Edit `SEED_INVENTORY` in `src/App.jsx`. After deploying, click **↺ Reset Demo** in the Inventory tab to reload seed data into localStorage.
