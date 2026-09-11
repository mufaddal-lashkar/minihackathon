# MiniHackathon

A Next.js project for the MiniHackathon.

## Prerequisites

- [Node.js](https://nodejs.org/) 20.x or later
- npm (comes with Node.js) — or pnpm / yarn / bun, if you prefer
- Git

Check your versions:

```bash
node -v
npm -v
```

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/mufaddal-lashkar/minihackathon.git
   cd minihackathon
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

The page auto-updates as you edit files. Changes to `app/page.tsx` (or `pages/index.tsx`) are reflected immediately via hot reload.

## Creating the Next.js App

If this repo does not yet contain a Next.js app, scaffold one in place:

```bash
npx create-next-app@latest . --typescript --eslint --tailwind --app --src-dir --import-alias "@/*"
```

Use `.` to scaffold into the current directory. Remove `--tailwind`, `--src-dir`, or `--app` if you don't want those options.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server on port 3000 |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## Project Structure

```
minihackathon/
├── public/           # Static assets (images, fonts, favicon)
├── src/
│   └── app/          # App Router: layouts, pages, route handlers
│       ├── layout.tsx
│       ├── page.tsx
│       └── globals.css
├── next.config.ts    # Next.js configuration
├── package.json
├── tsconfig.json
└── README.md
```

If you scaffolded without `--src-dir`, the `app/` directory sits at the repository root instead.

## Environment Variables

Create a `.env.local` file in the project root for local secrets. It is gitignored by default.

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Never commit `.env.local` or any file containing real credentials.

## Building for Production

```bash
npm run build
npm run start
```

The production server runs on port 3000 by default. Override it with `PORT=8080 npm run start`.

## Deployment

The easiest path is [Vercel](https://vercel.com/new), the platform built by the Next.js team:

1. Push this repository to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Vercel detects Next.js automatically — no configuration needed.

Any Node.js host works too — just run `npm run build` followed by `npm run start`.

## Contributing

1. Create a branch: `git switch -c feature/your-feature`
2. Commit your changes: `git commit -m "feat: add your feature"`
3. Push the branch: `git push -u origin feature/your-feature`
4. Open a pull request.

## License

Add a license before distributing this project. [MIT](https://choosealicense.com/licenses/mit/) is a common default.