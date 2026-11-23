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

## Phase 1 Shared RSS polling

```text
"The Node service will poll each approved feed once for all subscribers" its not really scalable. the RSS url-s should be provided by the admin, so whe shouldnt poll it for every user, just once for the whole application. ALso need to store some last poll time to decide which are  the new news. Make the polling interval admin configurable as well.
```

Decision: admins manage feed URLs and per-feed intervals. The application polls each due URL centrally and saves its schedule, last attempt, last successful poll, and item checkpoint. The [news feed design](P1-task-04-alerts-feature-design.md#news-feed-integration) explains how the worker handles late items and failed polls.

## Phase 1 RSS test fixture

```text
Also include in the plan to create a "fake" rss  node server for testing purposes, which will generate a news every minute with "News 2026-11-23T09:02:00.000Z" formatted content.
``

Decision: build the [fake RSS server](P1-task-04-alerts-feature-design.md#fake-rss-server-for-the-demo-and-tests) in Phase 2 with one item per UTC minute and a controllable clock.

## Phase 1 Demo scope

```text
the main goal is to create a working demo with email and the fake rss. SO check other requirements for those. we will integracte slack, and other event sources later, BUT keep it modularized so its easy to integrate
```

Decision: the demo uses the real RSS and SMTP adapters with the fake feed and a local Mailpit inbox. Keep user subscriptions, shared admin polling settings, and delivery evidence in scope. Schedule Slack and additional event sources as follow-ups that use the same adapter boundaries.

## Phase 1 RSS checkpoint review

```text
During review i saw this: "On the first successful poll, record existing items as seen so enabling a feed does not send its backlog". Will you store every event/news from the rss into the database? Thas a bad idea, we only need the last news time (or id) so we know which are the new news and the old  news. Please check this.
```

Decision: store one publication timestamp per feed and no per-item seen history. Process new entries in memory and persist only the minimal email job data for matching items.

## Phase 1 Readiness review

```text
Looks good to me, before continuing to the 2nd phase do you seen anything worth describing, studying, examining more? Please review the plan and ask if anything comes into mind.
```

- Catch-up after downtime needs a confirmed rule. The proposed default is one email per eligible headline in the last five minutes for the one-minute demo, with longer polling intervals accounted for separately. Sending only the latest headline reduces email volume but skips other recent matches.
- New and resumed subscriptions need a clear time boundary. The proposed default is to alert only on headlines published after the latest activation, even if an older headline appears in the next poll.
- Docker and Compose are installed, but the Docker engine could not be reached from this session. Mailpit was absent from PATH. Verify a repeatable Mailpit startup path during the Phase 2 proof of concept.
- The proof of concept should demonstrate that a failed queue write leaves the feed checkpoint intact, and that an email queued before restart appears in Mailpit after the worker resumes.

## Phase 1 Recovery and demo setup decisions

```text
Decisions:

1. we should send every missed event/news/etc while the server was down
2. no, new users only get the new events after activation





why would u use docker? i dont remember mentioning it. please explain
```

Decision: recover every eligible item since the saved checkpoint after downtime. New and resumed subscriptions receive only events published after their latest activation. The fake feed can reconstruct missed minutes in pages without an article archive. Docker was checked as an optional way to run Mailpit. The demo uses the standalone Mailpit executable.

## Phase 2 Start

```text
Okey i started the docker engine, we can use it for that purpose. Ready for phase 2?
``

Decision: start Phase 2 and use Docker for the Mailpit demo inbox. Keep the Node.js services on the host. See the [implementation plan](P2-task-04-demo-implementation-plan.md).

## Phase 2 Database review

```text
PLease create and visualize the planned database domain objects (tables) so i can verifiy them
```

Result: the [database review](P2-task-04-database-review.md) shows the proposed relationships, and the [SQLite schema](P2-task-04-demo-schema.sql) lists the fields and constraints.

## Phase 2 Task breakdown review

```text
Plase make smaller tasks, because `Create the Node and Angular projects and establish start and test commands. Add SQLite migrations and provision a demo admin and user`  is definitely too much. Database modellin, nodejs porject creation, nodejs database integration, nodejs rss integration, nodejs email integration, nodejs public API (for forntend) implementation, FE project scaffoldin, FE API integration, FE admin page implementation, FE user page implementation, and anyting else which could be separated.
```

Decision: split the [implementation tasks](P2-task-04-demo-implementation-plan.md#implementation-tasks) into individually reviewable changes. Each has an ID, dependencies, and a completion check.

## Phase 2 Delivery and session tables

```text
After reviewing the sql scheme pls epxlain what are the purpose of these tables:

- delivery_jobs
- delivery_attempts
- delivery_job_subscriptions
- sessions
```

Explanation: a delivery job represents one notification, attempts record each send, and the link table identifies the subscriptions that matched the job. Sessions associate expiring login tokens with accounts. See the [database review](P2-task-04-database-review.md) for the relationships.

## Phase 2 Database simplification review

```text
- so `delivery_attempts`  is only for logging? if so we dont need it
- for sesions we cen use jwt so we dont need to store any sessions related data
- why do we need to store `delivery_jobs` , cant we just send it right away after fetching the news/events/etc?
- also the `delivery_job_subscriptions`   seems unnecessary just send every event to every "subscirber" which matches the given event source, topic, etc.



Analzize my requirements, and if what I said doesnt make sense let me know, and ask questions
```

Recommendation pending confirmation: remove per-attempt history, use expiring signed JWTs without stored sessions, and recheck current subscription eligibility for the job's recipient without retaining a subscription link table. Keep a small delivery job record per item, channel, and destination so the service can send promptly and recover individual failed sends without replaying the whole batch. The open questions are delivery durability, JWT logout behavior, and topic-only versus feed-specific matching in the demo.
