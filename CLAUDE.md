# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UIGen — an AI-powered React component generator with live preview. Users describe components via chat, Claude generates React code, and it renders in a sandboxed iframe preview using a virtual file system (no files written to disk).

## Commands

```bash
npm run setup          # Install deps + generate Prisma client + run migrations
npm run dev            # Dev server with Turbopack at localhost:3000
npm run build          # Production build
npm run lint           # ESLint (next lint)
npm test               # Vitest (all tests)
npx vitest run <file>  # Run a single test file
npm run db:reset       # Reset database (destructive)
```

Dev server requires `NODE_OPTIONS='--require ./node-compat.cjs'` (handled by npm scripts). This shim removes global `localStorage`/`sessionStorage` on the server to prevent Node.js 25+ from breaking SSR code that detects these globals and assumes a browser environment.

## Environment Variables

- `ANTHROPIC_API_KEY` — (Optional) Enables real Claude Haiku 4.5 calls. Without it, `MockLanguageModel` returns static component responses.
- `JWT_SECRET` — (Optional) Secret for signing auth JWTs. Defaults to `"development-secret-key"`.
- `NODE_ENV` — Set to `"production"` for secure cookies.

## Architecture

**AI Chat Flow:** User message -> `ChatProvider` (client) sends messages + serialized VFS to `POST /api/chat` -> route reconstructs `VirtualFileSystem`, streams response via Vercel AI SDK (`streamText`) with two tools (`str_replace_editor`, `file_manager`) -> tool calls modify VFS server-side -> client-side `FileSystemContext.handleToolCall` mirrors changes to client VFS -> `PreviewFrame` renders via Babel transform + import maps + sandboxed iframe.

**Virtual File System (`src/lib/file-system.ts`):** In-memory tree (`VirtualFileSystem` class) with `Map<string, FileNode>` backing. Serialized as plain objects for client-server transport. The AI tools operate on this VFS — `str_replace_editor` (view/create/str_replace/insert) and `file_manager` (rename/delete).

**Preview Pipeline (`src/lib/transform/jsx-transformer.ts`):** JSX/TSX files are transformed via `@babel/standalone` in the browser, converted to blob URLs, assembled into an import map (with `esm.sh` for third-party deps like React 19), and rendered in an iframe via `createPreviewHTML`. CSS files are injected as `<style>` tags. The `@/` path alias maps to root `/`.

**Auth:** JWT sessions via `jose` stored in httpOnly cookie `auth-token` (7-day expiry, secure in production). Middleware (`src/middleware.ts`) protects `/api/projects` and `/api/filesystem` routes. Server actions in `src/actions/` handle `signUp`, `signIn`, `signOut`, `getUser`, and project CRUD — all return `{ success: boolean; error?: string }`.

**Anonymous User Workflow:** Anonymous users can design without signing up. Chat messages and VFS state are stored in `sessionStorage` via `src/lib/anon-work-tracker.ts`. On sign-in, `useAuth.handlePostSignIn()` migrates the session data into a new project, then clears the session.

**Provider Fallback (`src/lib/provider.ts`):** When `ANTHROPIC_API_KEY` is unset, a `MockLanguageModel` serves static component responses (counter/form/card) implementing the full `LanguageModelV1` interface with `maxSteps: 4` (vs 40 for real API). Production uses `claude-haiku-4-5`.

**Context Providers:** `FileSystemProvider` wraps `ChatProvider` — chat depends on file system for serialization and tool call handling. Both are client-side React contexts.

**Generation Prompt (`src/lib/prompts/generation.tsx`):** System prompt instructs Claude to create `/App.jsx` as root, use `@/` import alias for local files, any npm package via esm.sh, Tailwind CSS only (no inline styles), and realistic placeholder content.

**API Route:** Single endpoint `POST /api/chat` with `maxDuration = 120` seconds. Request body: `{ messages, files, projectId? }`. Uses Anthropic ephemeral prompt caching for the system message.

## Tech Stack

- Next.js 15 (App Router, Turbopack), React 19, TypeScript
- Tailwind CSS v4, Radix UI primitives, shadcn/ui components
- Prisma with SQLite (`prisma/dev.db`) — User (`email` unique, `password` bcrypt), Project (`messages` and `data` as JSON strings, optional `userId` for anonymous support, cascade delete)
- Anthropic Claude via `@ai-sdk/anthropic` + Vercel AI SDK
- Monaco Editor for code editing, `@babel/standalone` for in-browser JSX transform
- Vitest + Testing Library + jsdom for tests

## Path Aliases

`@/*` maps to `./src/*` (configured in `tsconfig.json`).

## Coding Conventions

### TypeScript
- Strict mode enabled — all code must pass `strict: true` checks
- Use `interface` for object shapes and component props; use `type` for unions and intersections
- Explicit type annotations on function parameters; infer return types when obvious
- No `any` — use `unknown` or proper generics instead

### React
- Functional components only (no class components)
- Mark client components with `"use client"`, server actions with `"use server"`
- Props interfaces named `<Component>Props` (e.g., `SignInFormProps`)
- Destructure props in function signature
- Use `useCallback` for functions passed as props to prevent unnecessary re-renders

### Naming
- **Components/interfaces:** PascalCase (`FileTree.tsx`, `ChatInterface`)
- **Utilities/actions/hooks:** kebab-case (`file-system.ts`, `use-auth.ts`, `create-project.ts`)
- **Variables/functions:** camelCase (`handleSubmit`, `selectedFile`)
- **Test files:** `__tests__/<name>.test.ts(x)` co-located with source

### Imports
1. React and third-party packages
2. Internal `@/` alias imports
3. Relative imports (sibling components)

### State Management
- React Context + hooks for global state (`ChatContext`, `FileSystemContext`)
- `useState` for local component state — no external state libraries
- Custom hooks (`useAuth`, `useChat`, `useFileSystem`) must validate context and throw if used outside their provider

### Error Handling
- Server actions return `{ success: boolean; error?: string }` — never throw to the client
- Context hooks throw descriptive errors when used outside their provider
- Use `console.error` for logging, not `console.log`

### Testing
- Vitest + React Testing Library + jsdom
- Use `test()` (not `it()`) for test cases
- Clean up after each test with `afterEach(() => { cleanup(); vi.clearAllMocks(); })`
- Mock external dependencies with `vi.mock()`

### UI Components
- shadcn/ui components live in `src/components/ui/`
- Use `class-variance-authority` (CVA) for component variants
- Use `cn()` utility from `@/lib/utils` for conditional class merging

## CI/CD

GitHub Actions in `.github/workflows/`:
- **ci.yml** — Lint, test, build on push/PR to `main` (Node 20)
- **claude.yml** — Automated Claude Code review on PRs + `@claude` mentions in comments. Requires `ANTHROPIC_API_KEY` repo secret.
