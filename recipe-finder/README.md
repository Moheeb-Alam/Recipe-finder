# 🍽️ Recipe Finder

A clean, responsive recipe website built with **HTML, CSS, JavaScript, Tailwind CSS and Node.js**.
It uses the free [TheMealDB](https://www.themealdb.com/api.php) API – **no API key needed**.

## Features

- Search recipes by dish name (press Enter, click Search, or just type)
- Recipe cards with image, name, category and area
- Click a card to open a detailed recipe modal: image, category, area, ingredients with measurements, instructions and a **YouTube** button
- 🎲 **Random Meal** button
- Category filter loaded live from the API
- Loading spinner, error message with a "Try again" button, and an empty-result message
- Responsive layout for mobile, tablet and desktop, with hover effects and smooth animations
- Keyboard friendly (Tab, Enter, Esc) and respects "reduced motion" settings

## Project structure

```
recipe-finder/
├── public/              ← the website (this is what gets deployed)
│   ├── index.html       ← page structure
│   ├── css/style.css    ← custom styles & animations
│   └── js/app.js        ← all the logic (API calls, rendering, events)
├── server.js            ← tiny Node.js server for local development
├── package.json
├── vercel.json          ← tells Vercel to publish the "public" folder
├── .gitignore
└── README.md
```

Tailwind CSS is loaded from its CDN in `index.html`, so there is **no build step** and nothing to install.

---

## ▶️ Run it on your computer

1. Install **Node.js 18 or newer** from <https://nodejs.org> (check with `node -v`).
2. Open a terminal inside the `recipe-finder` folder.
3. Start the server:

   ```bash
   npm start
   ```

4. Open <http://localhost:3000> in your browser.

> You need an internet connection (for the TheMealDB API, Tailwind CDN and Google Fonts).
> To use another port: `PORT=4000 npm start` (Mac/Linux) or `set PORT=4000 && npm start` (Windows CMD).

You can also just double-click `public/index.html`, but using the Node server is the recommended way.

---

## ⬆️ Upload to GitHub

1. Create a free account at <https://github.com>.
2. Click **+ → New repository**, name it `recipe-finder`, keep it **empty** (don't add README/.gitignore), and click **Create repository**.
3. Install Git from <https://git-scm.com> if you don't have it.
4. In a terminal inside the project folder, run:

   ```bash
   git init
   git add .
   git commit -m "Initial commit: Recipe Finder"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/recipe-finder.git
   git push -u origin main
   ```

   Replace `YOUR-USERNAME` with your GitHub username. If asked to sign in, use your browser login or a
   [Personal Access Token](https://github.com/settings/tokens) as the password.

To update later:

```bash
git add .
git commit -m "Describe your change"
git push
```

---

## 🚀 Deploy on Vercel (free)

### Option A – from GitHub (recommended, auto-deploys on every push)

1. Go to <https://vercel.com> and sign up with your **GitHub** account.
2. Click **Add New… → Project**.
3. Find the `recipe-finder` repository and click **Import**.
4. Keep the defaults (Framework Preset: **Other**; `vercel.json` already sets the output folder to `public`). Leave Build Command empty.
5. Click **Deploy**. After about a minute you get a live link like `https://recipe-finder-xxxx.vercel.app`.

### Option B – with the Vercel CLI

```bash
npm install -g vercel
vercel          # follow the prompts (first deploy = preview)
vercel --prod   # publish to production
```

The site is fully static, so no environment variables are needed.

---

## 🛠️ Troubleshooting

| Problem | Fix |
| --- | --- |
| Blank page / no recipes | Check your internet connection and reload. Open DevTools (F12) → Console for details. |
| `Port 3000 already in use` | Run on another port, e.g. `PORT=4000 npm start`. |
| `node` not recognized | Install Node.js and reopen the terminal. |
| Vercel shows 404 | Make sure `vercel.json` and the `public` folder were pushed to GitHub. |

## Credits

Recipe data and images by [TheMealDB](https://www.themealdb.com/).
