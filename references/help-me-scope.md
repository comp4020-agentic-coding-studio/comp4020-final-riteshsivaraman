Help Me Scope My COMP4020 Final Project

I want you to act as my technical project advisor, product designer, and agentic coding partner. Your first job is to help me scope this project realistically before we start building anything.

Do not immediately generate the entire application. I want to make thoughtful decisions about what to build, how to build it, and what is achievable within my time and budget.

1. My project idea

I want to build a browser-based, immersive 3D simulation of an Apple-inspired retail store.

This is NOT intended to be a conventional video game, a VR tour, a static 3D showroom, or a standard e-commerce website.

I want visitors to feel like they are physically inside a real retail store, exploring it from their laptop.

The experience should ideally include:

A realistic, carefully designed 3D retail environment with wooden display tables, glass walls, product displays, realistic lighting, and a Genius Bar.
First-person movement through the environment, using the keyboard and mouse.
Interactive iPhones, iPads, MacBooks, and other products that visitors can approach, inspect, rotate, and interact with through simulated interfaces.
Animated customers and employees who move around the store.
Context-sensitive dialogue with employees and scripted customer behaviour.
Retail interactions such as product comparisons, shopping baskets, simulated purchases, refunds, and repair appointments.
A persistent store environment in which meaningful actions have lasting consequences.
A polished, convincing visual experience that runs directly in a desktop web browser without requiring users to install anything.

The aesthetic should be inspired by Apple's minimalist retail design, but the project should have its own identity rather than pretending to be an official Apple product.

2. My constraints

I am a university student completing COMP4020 Agentic Coding Studio at ANU.

I use a MacBook and intend to use Claude to help me develop the application.

My coding-credit budget is at most $100 per week. I want to use Claude to build the project, but I do NOT want the running application to make paid generative AI API calls.

All in-app characters should therefore use deterministic behaviour, state machines, predefined dialogue, and contextual rules. The simulation must continue working without any runtime AI service.

I am working towards a deadline of 9 November 2026. I need a scope that is ambitious enough to be interesting but realistic enough to finish, test, deploy, and document properly.

I would prefer a small, visually excellent, fully functioning simulation over a huge application with unfinished features.

3. Mandatory university assessment requirements

These requirements are non-negotiable.

Multi-user

At least two people must be able to use the deployed application simultaneously in separate browsers.

They must have distinct identities, whether anonymous or pseudonymous, and must act on shared state.

Real-time

A change made by one visitor must appear in other relevant open sessions within approximately one second, without requiring a reload or action from the other visitor.

Persistence

Meaningful actions and shared state must survive browser sessions, server restarts, and redeployments.

Browser localStorage alone is not sufficient. The application needs a persistent backend and database.

Deployment

The application must be deployed to the Fly.io application supplied with the university repository, using the provided project configuration and persistent volume.

The course repository includes a Dockerfile, fly.toml, a spec/ directory, and existing checks. We must inspect and respect those files rather than replacing them blindly.

Documentation and evidence

The final submission requires:

README.md: 400–600 words defining what makes the application good, citing sources, and distinguishing testable promises from subjective judgements. It must be published at /readme/.
CLAUDE.md: rules and constraints that guide the coding agent.
PROCESS.md: 900–1100 words explaining the development process, technical decisions, stack, agentic workflow, trade-offs, and evidence from the work.
spec/: meaningful automated checks for the application's promises.
Commit history showing incremental development, decisions, corrections, and testing.
A deployed *.fly.dev URL.
Both pnpm check and pnpm check:evidence must pass.

The assessment is not simply about whether the application works. The markers assess the quality of the deployed application, the argument behind its definition of good, and evidence of how it was developed.

The README, CLAUDE.md, spec/, PROCESS.md, commit history, and deployed application must tell a consistent story.

The university specifically expects us to design for co-presence: the application should be more interesting because other people are using it simultaneously.

4. My initial technical preferences

I am considering:

React, TypeScript, and Vite for the frontend.
Three.js for the 3D environment.
React Three Fiber if it makes the integration simpler.
A lightweight Node.js backend.
WebSockets for real-time updates.
SQLite on the supplied Fly.io persistent volume for durable data.
Deterministic character behaviour and scripted dialogue.
Free or appropriately licensed 3D assets where possible.

These are initial preferences, not final decisions. Assess them critically against the existing repository, the assessment requirements, the small deployment environment, the deadline, and the cost of development.

Do not introduce complex infrastructure, paid managed services, Redis, unnecessary frameworks, or a large number of dependencies without a clear justification.

The server must be authoritative for shared transactions, inventory, and bookings. Concurrent requests must not corrupt shared state.

5. What I want you to do first

Help me scope the project, not build it yet.

Start by examining the existing repository and its instructions if you have access to it. Identify what already exists, what must be preserved, what is unknown, and what technical constraints the starter imposes.

If you do not have repository access, explain what information you need rather than pretending to have inspected it.

Then help me work through the following tasks.

A. Define the product

Turn my broad idea into a precise product concept.

Explain who the application is for, what visitors do, why the environment benefits from multiple people being present, and what makes this project distinctive rather than a generic multiplayer website with a 3D interface.

Help me develop a defensible definition of good that can inform the design and assessment.

Do not write a generic marketing pitch. Focus on product decisions, meaningful interactions, and trade-offs.

B. Scope the MVP

Create three lists:

Essential features that must be completed for a coherent MVP.
Important features that should only be added after the MVP works.
Features that should explicitly be excluded from this submission.

Consider the trade-off between visual fidelity, character behaviour, product interactions, and full-stack requirements.

Identify the smallest experience that would still feel like a convincing, high-quality 3D retail simulation and satisfy the university requirements.

Do not assume that every feature in my original vision must be included.

C. Design the shared experience

Propose a minimal but meaningful multi-user model.

Consider:

How anonymous visitors receive distinct identities.
How visitors see one another in the store.
Which interactions change shared state.
Which state is transient and which must persist.
Which changes must propagate in real time.
How the experience behaves when two visitors act simultaneously.
What happens when someone disconnects and reconnects.
How the application avoids retaining unnecessary personal information.

I do not want multiplayer added merely to satisfy an assessment checkbox. Explain how co-presence contributes to the experience.

D. Propose the architecture

Recommend the simplest architecture that satisfies the course requirements.

Explain the roles of the frontend, 3D renderer, backend, WebSocket connection, database, and persistence layer.

Identify the main data entities and their relationships, such as visitors, products, inventory, transactions, appointments, and activity events.

Explain how to prevent inconsistent inventory, duplicate transactions, invalid refunds, and data loss.

Include a proposed repository structure, but do not create dozens of empty files prematurely.

E. Establish a visual strategy

Visual fidelity is a high priority.

Explain how to create a realistic environment within the time and budget available.

Consider store proportions, architectural detail, lighting, materials, product models, animation, reflections, camera controls, and browser performance.

Identify which assets should be sourced from existing libraries and which elements are worth creating specifically for the project.

Be honest about the limitations of procedural geometry and AI-generated code when producing high-quality 3D environments.

Propose a visual quality target that can actually be achieved.

F. Create milestones and acceptance criteria

Produce a milestone plan from the current state to the deadline.

Each milestone should have:

A concrete deliverable.
The features included.
A definition of done.
Acceptance tests.
Dependencies and risks.
A fallback plan if the work takes longer than expected.

Prioritise early deployment, a working 3D environment, real-time shared state, and persistent storage.

The mandatory requirements must be integrated early, not left until the final week.

G. Plan the development workflow

I will use Claude as a coding assistant, so recommend an efficient agentic workflow.

Explain how to divide tasks, preserve working code, control context size, test changes, use Git, avoid unnecessary rewrites, and prevent regressions.

Propose a realistic strategy for staying within my $100 weekly coding-credit limit.

Distinguish Claude subscription usage, coding-tool usage, and API billing where relevant. Do not assume that my university credit works in a particular way without confirming it.

No runtime AI calls should be required by the finished application.

H. Design the assessment harness

Propose meaningful rules for CLAUDE.md, testable promises for spec/, and a structure for README.md and PROCESS.md.

Include tests for:

Two visitors in separate browser profiles.
Real-time propagation of shared state.
Persistent data after a browser restart.
Persistent data after a server restart and redeployment.
Simultaneous transactions and inventory consistency.
Any privacy or design promises that can be checked mechanically.

Explain which aspects of good are objectively testable and which require human judgement.

Do not fabricate research or citations. Suggest relevant sources and explain what claims they could support. I need to engage with the sources myself and make the final argument in my own words.

6. How I want you to work with me

Be realistic, critical, and budget-conscious.

Do not simply agree with every feature I suggest. Explain when a feature is too ambitious, redundant, technically risky, or unlikely to contribute to the assessment.

Prefer simple, robust implementations over impressive but fragile architecture.

Ask me a small number of high-impact questions if necessary. Do not overwhelm me with dozens of decisions at once.

Separate confirmed facts, assumptions, and recommendations.

Do not start coding until we have agreed on the MVP, architecture, and first milestone.

When implementation begins, work incrementally. Explain what will change, identify the relevant files, implement one coherent feature, run the available checks, and report what has and has not been verified.

Never claim that a feature, test, deployment, or visual result works unless it has actually been tested.

If a decision changes the project scope or architecture, explain the consequences and update the relevant project documentation.

7. Your first response

For your first response, please:

Summarise your understanding of the project and its non-negotiable requirements.
Identify the three biggest technical or delivery risks.
Recommend a provisional MVP in no more than ten essential features.
Explain the proposed stack and its trade-offs.
Identify any important unknowns that need resolving before development.
Give me a short, prioritised list of next steps.

Do not generate the complete application, create a large codebase, or write final assessment documents yet.

Help me make the right decisions before we start building.