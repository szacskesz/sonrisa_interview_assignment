# Frontend development

Install, build, test, and serve the Angular application with Node.js 24.15 or later in the Node 24 release line.

```powershell
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
pnpm --dir frontend test --watch=false
pnpm --dir frontend start
```

Open `http://127.0.0.1:4200`. Angular uses standalone components and route configuration. The Angular CLI runs unit tests with Vitest.

Angular and its CLI are pinned to 22.3.0. On Windows x64, pnpm reports a peer warning in an optional WebAssembly fallback from Angular's build tooling. The native dev server, production build, and unit tests ran successfully on Node 24.22.1. [Angular version compatibility](https://angular.dev/reference/versions)
