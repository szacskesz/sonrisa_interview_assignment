# Project working agreement

Use English for all project work, including code and identifiers, comments, documentation, prompts, review notes, and commit messages.

## 1. Define and plan

- Define the problem or feature, clarify the goals and scope, and agree on acceptance criteria.
- Check feasibility, dependencies, and constraints. Compare the relevant options, choose the technologies and architecture, and record the decisions and their tradeoffs in `docs/`.

## 2. Prepare the implementation

- Write an implementation plan and specifications in `docs/`. Break the work into small tasks with clear expected outcomes and a verification plan.
- Build a proof of concept sized to the task to validate the approach before committing to the full implementation. Record what it verified and any open questions.
- Search for and install relevant skills during this phase so they are available when needed. Record which tasks they support. Use relevant skills throughout the work whenever possible.

## 3. Implement

- Set up the required projects and implement the planned tasks. Favor readable, maintainable code and the smallest change that fully meets the requirements. Reuse existing code and conventions where they fit. Follow current best practices appropriate to the project's verified toolchain.
- Write unit tests across the full codebase and end-to-end tests that exhaustively cover expected behavior. Use the acceptance criteria to track coverage of supported workflows, edge cases, and failure paths. Include a regression test with every bug fix and verify that it catches the original bug.
- Document the changes and the public parts of the application, especially APIs and public interfaces of components and modules. Explain their purpose, contracts, usage, and relevant failure behavior. Store development documents in `docs/` and keep reference comments near the code they describe.
- Run an AI code review as soon as implementation is complete to catch mistakes early. Verify its findings before making changes.

## 4. Verify and review

- Run the full unit and end-to-end test suites. Fix any defects, add the required regression tests, and rerun the relevant checks. Run the full suites again before delivery.
- Prepare a human review document in `docs/` with the change summary, verification results, and relevant evidence. For every feature that changes the UI, capture screenshots of the changed elements, save them under `docs/`, and embed them in the review document.
- Apply changes requested in human code review and verify the updated behavior. Raise any review request that conflicts with another requirement before proceeding.

## 5. Deliver and maintain

- Deliver the verified changes with the documentation needed to use and maintain them. Record any known limitations and agreed follow-up work in `docs/`.
- Keep the documentation and tests current as the project evolves. Follow this workflow for maintenance changes and bug fixes.

## Rules for every phase

- Verify findings against the repository, observed behavior, or authoritative sources. Check version numbers and compatibility against manifests, lockfiles, installed tools, or official documentation as applicable.
- If code looks suspicious or requirements conflict, stop the affected work and ask for clarification before choosing a workaround. Proceed without asking only when the user explicitly requests autonomous work. In that case, record the assumption and the decision. When asking for a decision, explain the relevant options and tradeoffs concisely.
- Commit the work after each completed step and at the end of each phase whenever there are changes to record. Prefer small, focused commits throughout the work. At the end of every prompt or task, commit any remaining changes from that work unless the user specifies otherwise. Use messages that describe what changed, prefixed with the task identifier when applicable, for example `TASK-123 Add validation for empty submissions`.
- Keep project documents and review evidence under `docs/`.
- Omit generated-by notices and attribution to coding assistants or generation tools from project files and commit metadata, including co-author trailers.
