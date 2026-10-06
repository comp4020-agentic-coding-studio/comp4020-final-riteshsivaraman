# Crit 8 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was writing down what good means before any app code existed.
Seen only works if it feels slowly uncomfortable, and no test can measure
that. So I wrote CLAUDE.md first, with the rules for what the agent must never
skip, and split every check into two questions: is it broken (automated), and
how does it feel (me, in two browsers). I then had the agent interview me one
question at a time to define good. Two answers came back fast, but "who is it
for" never got a real answer, and that stayed open instead of being filled with
a guess. Having the definition first meant every later choice, like cutting
attachments and keeping every check, had something to be measured against.

## What did this work change about who I want to be as a software developer?

I want to be a developer who can say what good means before building, and who
is honest about which parts a machine can check and which only I can judge.
This week I also found that a written spec does not mean the app follows it.
My design doc had real colours and fonts, but the app was still using a blue
accent and a different typeface until I compared computed styles against the
doc. Before this crit I thought writing the rule was the hard part. Now I think
checking that the app obeys it is the part I own.
