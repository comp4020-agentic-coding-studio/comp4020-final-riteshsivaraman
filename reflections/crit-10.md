# Crit 10 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was noticing that my event log lived in the wrong place. Every
state change already wrote a row to the events table, so I counted that as
logging. However, `flyctl logs` only showed "listening on", which meant neither
the agent nor I could read any of it when something went wrong. The week 10
lecture puts it as: logs help only when a command the agent can run prints
them. So every events row now prints one line to stdout with the time, the
event and the visitor
([`a60962b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/a60962b)),
and later I added names so two people can be told apart at a glance
([`73bb0a0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/73bb0a0)).
Reading the log from a test run then showed two holes: one notice written 140
times, and an error that left no line at all. Both are fixed and tested
([`c5fbeff`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-riteshsivaraman/commit/c5fbeff)).

## What did this work change about who I want to be as a software developer?

I want to be a developer who builds the way I will later read the app back.
The staff only back room rule was believed missing until I found it under
another name, `clampToWalkable`. Now I check a rule like that three ways: a
test, a mutation that turns the test red, and a log line that shows the
refusal. The lecture says authorisation is checked on the server for every
action, and I can now show that from the log alone. One gap remains. Role is
chosen by the visitor, so staff only holds against a customer who stays a
customer, and ADR 3 says so. Before this crit I thought logging was something
to add at the end. Now I think of the log as part of how I check the app.
