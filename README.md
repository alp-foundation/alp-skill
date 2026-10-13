# The ALP skill

An [Agent Skill](https://agentskills.io) that lets an AI agent find websites by meaning through an ALP router: what, where and how much, each site with a trust block, in one call of a few hundred tokens. It is the reference client of the agent side of the ALP specification (0.0.0.04, § 10.7), published with the reference router at [alp-geo.net](https://alp-geo.net).

## What is in it

| File | What it is |
|---|---|
| `SKILL.md` | the instructions the agent reads when the skill applies |
| `scripts/alp.mjs` | the client: maps words to vocabulary values, asks the router, prints a short answer; Node 18 or newer, no packages |
| `references/grammar.md` | how values are built, read only when a word is not in the vocabulary |

## Install

For Claude Code, put this folder at `~/.claude/skills/alp/` for all projects, or at `.claude/skills/alp/` of one project. Other tools that follow the Agent Skills format take the same folder. The skill needs Node 18 or newer and network access to the router; `ALP_ROUTER_URL` points it to another one.

```bash
git clone https://github.com/alp-foundation/alp-skill ~/.claude/skills/alp
```

Without git, the same files are served by the router:

```bash
mkdir -p ~/.claude/skills/alp/scripts ~/.claude/skills/alp/references
for f in SKILL.md README.md scripts/alp.mjs references/grammar.md; do
  curl -fsSL "https://alp-geo.net/skill/alp/$f" -o ~/.claude/skills/alp/$f
done
```

To update, `git -C ~/.claude/skills/alp pull`.

## Why a skill and not only MCP

The router is also an MCP server, `https://alp-geo.net/mcp`. Its tool descriptions stay in the agent's context for the whole session, about two thousand tokens, whether the agent searches or not. A skill costs its name and description until it is needed, and its script resolves the vocabulary outside the model's context. Both can be used together; a client that cannot run code keeps MCP.

## Privacy and consent

ALP grows its index where people ask (specification § 9.7). Two things the skill does are part of that, and both are bounded:

- **Demand.** When ALP has nothing for a well-formed request, the router counts it: the vocabulary values, the day and an alias of the client that changes every day. Not the user's words, not the address, not the results. The skill passes `--no-demand` when the user asked not to be tracked or the topic is personal.
- **Found sites.** When ALP had nothing and the agent found sites another way, it may send their host names to ALP so that the next person gets them from the index. **Only after telling the user what goes where and why, and only after the user agreed.** At most one question per conversation; a no is final; nothing is sent for personal or health topics without a separate yes; only host names and ALP values are sent. The script refuses to send without `--consent user` and prints the text the agent has to put to the user first.

Reported hosts are candidates, not facts: the router describes each from its own pages and checks it before it reaches the index.

## Source

This repository is published from `skill/alp/` of the reference router. Changes go there first and are mirrored here with every release of the skill.

## License

Apache-2.0, as all code of the ALP reference implementation; see `LICENSE`.
