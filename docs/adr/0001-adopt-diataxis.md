# 0001. Adopt Diátaxis for documentation structure

## Status

Accepted

## Context

`docs/` held four flat files, two of them work lists, so a reader had no cue which doc served which
need. [Diátaxis](https://diataxis.fr) sorts docs by reader need into tutorials, how-to guides,
reference and explanation.

## Decision

Organize `docs/` as `{tutorials,how-to,reference,explanation}/`, each doc filed by its dominant
purpose and moved whole. [docs/README.md](../README.md) is the map. ADRs stay at `docs/adr/`: they
are a genre with their own convention (numbered with no gaps, a reversed decision deleted and
replaced).

## Consequences

- Each doc has one home, chosen by reader need.
- Links to repo files are `../../…` from a quadrant, and heading anchors are link targets, so a
  rename needs a repo-wide grep.
- The `diataxis-docs` skill holds the writing conventions per quadrant.
- Borderline docs are filed by dominant purpose, not split.
