# Task 04 Prompt History

The entries preserve user prompts in order. Continue this record with prompts used in later phases and link the decisions and verification evidence they produce.

## Workspace setup

```text
.
```

```text
Create an agent.md with the following rules:

- The work should be done in multiple phases
  - 1\. Planning, defining the problem / feature, clarify goals, check feasibility, decide technologies, choose architecture.
  - 2\. Create an implementation plan, POC, split work into smaller units (tasks), create specifications (documents)
  - 3\. implementation, create project(s), write code, test (unit + e2e), document changes made.
  - 4\. verification and review, run tests, fix bugs, apply human code review suggested chagnes
  - 5\. delivery, maintaining.
- Should test the full code with unit tests, and test the expected behaviour by e2e tests exhaustively.
- Use relevant skills when possible, and search for and isntall relevant skills during the 2nd (implementation plan) phase for later use.
- Focus maintinability and readibility
- Run ai code-review after implementation to catch mistakes earlier
- Use only englisgh language for everything ( docs, code, propmts, etc)
- Commit messages should describe their contents properly, also include the task identifier if applicable as a prefix.
- After each phase and step commit the work, make more small commits rather than 1 large at the end.
- Bugfixes should include test everytime.
- Do not add generated-by notices or attribution to coding assistants or generation tools in project files or commit metadata, including co-author trailers.
- Follow best practices and and use modern approacshes.
- Document your code, espceially the api, and the public parts of the application or components, modules, etc.
- Always verify your findings, for ex.: dont assume version numbers match from memory.
- If something is suspicious (code vise) or contradcits with other requirements, please ask rather than solving it by a workaround. Only exception if I explicitely asked you to work autonomously.
- Try to solve the problem with the least amount of changes, rule of thumb: less code -> easier to maintain.
- Create a docs folder and store every document there for future development.
- If a feautre includes UI create screenshots of the changed elements and include it in the the review doc for the human code review (evidence collcection)
- Explain the relevant options and tradeoffs concisely when asking for a decision.
```

```text
Commit it ( always commit after a promt/task is done unless specified otherwise)
```

```text
I added the brief requirement docs please commit it as well
```

## Phase 1

````text
Start with the phase 1 (p1) for this brief:

`We want users to be able to set up alerts so they get notified when`\
`something important happens in the world — like breaking news, market`\
`movements, natural disasters, that kind of thing. Should work for both email`\
`and Slack. Make it flexible enough that we can add more channels later.`\
`We need an admin view too.`

I would like to use angular, nodejs and some lightweight database. I think for sending the alert a simple websocket message could work, please find some libraries or existing integrations for this use-case. We need to modularize the code so we can add more event sources, and also more notifications channels, and keep the users and subscriptions and their settings separated from those. Explaing how can we integrate multiple event soruces and what kind of event sources are possible to integrate.
````

Result: [Phase 1 World Event Alerts Design](P1-task-04-alerts-feature-design.md).

## Phase 1 News source clarification

```text
- My mistake we dont realy need websocket for those alerts, just email and slack integrations are neccessary. So for now, scrap the webscoket idea (unless its necessary for something else.)
- Can we integrate RSS for news events? What are the other possibilities?
```

Decision: use SMTP and Slack HTTPS for alerts and HTTP for the app. Plan an RSS adapter as the first live news integration, with a saved or synthetic feed for tests. Compare Atom, publisher and aggregator APIs, and HTTP push in the [updated design](P1-task-04-alerts-feature-design.md#news-feed-integration).
