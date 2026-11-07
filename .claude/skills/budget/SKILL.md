---
name: budget
description: Check spend against the proposed guard lines (pause at 70%, stop at 85%) using the course balance skill, and log it. Use at the start of every wave, after about 10 agents, and when Ritesh asks about money or credit.
---
# Budget guard

1. Invoke the `comp4020:balance` skill to read the proxy balance. Do not print or store the key.
2. First run: write the starting balance to `.agents/budget-baseline`. After that: spent = baseline minus current; share = spent / baseline.
3. Append one line to `.agents/budget.log`: ISO time, balance, spent share, current wave, agents run since last line.
4. Compare: under 70% go on; 70 to 85% pause and ask Ritesh before the next wave; 85% or more hard stop, only verification and Monday bug fixes. Estimate the next wave (agents x tier) and refuse one that crosses the next line.
5. Say plainly if the balance is measured per week rather than as the $500 total: the guard lines apply to whichever number actually limits us.
