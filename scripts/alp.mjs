#!/usr/bin/env node
// The client side of the ALP skill (spec 10.7). It turns the words of a
// question into values of the vocabulary here, outside the model's context,
// asks the router once, and prints a short answer the model can read.
//
//   node alp.mjs ask --what "villa" --where "ubud" --price-max 100 --unit USD --per night
//   node alp.mjs find "fur coat" montana
//   node alp.mjs report --object food/restaurant/fast-food --geo ru/saint-petersburg \
//                       --hosts a.example,b.example --consent user
//   node alp.mjs demand | sites [--host ubud] | query '<alp_query arguments as JSON>'
//
// ALP_ROUTER_URL sets the router (default https://alp-geo.net). Node 18 or newer, no packages.

const ROUTER = (process.env.ALP_ROUTER_URL || "https://alp-geo.net").replace(/\/+$/, "");
const TIMEOUT_MS = 15_000;

const NOTICE =
  "Before sending, tell the user in their language, and send only after a clear yes:\n" +
  "  ALP had no sites for this; I found some with a web search. May I send their web addresses\n" +
  "  (for example <host>) and the category of the request (<object>, <geo>) to the shared ALP index,\n" +
  "  so the next person asking gets them without a web search? Your words and anything about you\n" +
  "  are not sent. It is voluntary and changes nothing for you. Send them?\n" +
  "Ask at most once in a conversation. After a no, do not send and do not ask again.\n" +
  "Then run the same command with --consent user.";

function fail(message, code = 1) {
  process.stdout.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(code);
}

/** --name value, --flag, and the words that are no option. */
function parseArgs(argv) {
  const flags = new Map();
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    const value = next === undefined || next.startsWith("--") ? true : (i++, next);
    flags.set(name, [...(flags.get(name) ?? []), value]);
  }
  const one = (name) => {
    const values = flags.get(name);
    const last = values?.[values.length - 1];
    return typeof last === "string" ? last : undefined;
  };
  const all = (name) => (flags.get(name) ?? []).filter((value) => typeof value === "string");
  const has = (name) => flags.has(name);
  return { words, one, all, has };
}

async function call(method, path, body) {
  let response;
  try {
    response = await fetch(`${ROUTER}${path}`, {
      method,
      headers: {
        accept: "application/json",
        "user-agent": "alp-skill/0.1",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    fail(`the router at ${ROUTER} did not answer: ${error instanceof Error ? error.message : String(error)}`);
  }
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(`the router answered ${response.status} without JSON`);
  }
  if (!response.ok) {
    const error = parsed?.error ?? {};
    const details = Array.isArray(error.details) ? error.details.map((d) => `${d.path}: ${d.message}`).join("; ") : "";
    fail(`${error.message ?? `the router answered ${response.status}`}${details ? ` (${details})` : ""}`);
  }
  return parsed;
}

const csv = (value) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

/** The values the vocabulary has for words, by the number of sites behind each. */
async function lookUp(words) {
  if (words.length === 0) return new Map();
  const answer = await call("GET", `/v1/axes?find=${encodeURIComponent(words.join(","))}&limit=5`);
  return new Map((answer.found ?? []).map((item) => [item.word, item.matches ?? []]));
}

/**
 * The best value for a word on the axes it may stand for. Several values
 * equally strong are an ambiguity: the first is taken, the others reported,
 * so the model can see it and ask again with --value.
 */
function choose(matches, axes) {
  const fitting = matches.filter((match) => axes.includes(match.axis));
  const pool = fitting.length > 0 ? fitting : [];
  if (pool.length === 0) return undefined;
  const best = pool[0];
  const alternatives = pool.slice(1).filter((match) => match.sites === best.sites).map((m) => `${m.axis}=${m.value}`);
  return { axis: best.axis, value: best.value, sites: best.sites, alternatives };
}

function short(result) {
  const trust = result.trust ?? {};
  const check = trust.content_check ?? {};
  return {
    url: result.url,
    score: result.score,
    matched: result.matched,
    trust: [
      check.state === "checked" ? `pages checked ${check.score}` : (check.state ?? "unchecked"),
      trust.review_state,
      trust.tier === null || trust.tier === undefined ? "no tier" : `tier ${trust.tier}`,
      trust.claim_verification === undefined ? null : `claims ${trust.claim_verification}`,
    ]
      .filter(Boolean)
      .join(", "),
    self_description: result.self_description ? String(result.self_description).slice(0, 160) : null,
  };
}

async function ask(args) {
  const what = csv(args.one("what"));
  const where = csv(args.one("where"));
  const words = [...what, ...where];
  const found = await lookUp(words);

  const axes = [];
  const mapped = {};
  const unmapped = [];
  const alternatives = {};
  const add = (axis, value, weight, mode) => {
    if (axes.some((item) => item.axis === axis && item.value === value)) return;
    axes.push({ axis, value, weight, mode });
  };

  // explicit values first: the model knows the grammar, the words may not be in the vocabulary
  for (const pair of args.all("value")) {
    const [axis, value] = pair.split("=");
    if (!axis || !value) fail(`--value takes axis=path, got "${pair}"`);
    add(axis, value, axis === "object" ? 1 : 0.9, "filter");
    mapped[`--value ${axis}`] = value;
  }
  const explicit = new Set(axes.map((item) => item.axis));

  for (const word of what) {
    const pick = choose(found.get(word) ?? [], ["object", "cuisine", "amenity", "setting", "subject", "service"]);
    if (!pick) {
      unmapped.push(word);
      continue;
    }
    if (pick.axis === "object" && explicit.has("object")) continue;
    add(pick.axis, pick.value, pick.axis === "object" ? 1 : 0.7, "filter");
    mapped[word] = `${pick.axis}=${pick.value} (${pick.sites} sites)`;
    if (pick.alternatives.length > 0) alternatives[word] = pick.alternatives;
  }
  for (const word of where) {
    const pick = choose(found.get(word) ?? [], ["geo"]);
    if (!pick) {
      unmapped.push(word);
      continue;
    }
    if (explicit.has("geo")) continue;
    add("geo", pick.value, 0.9, "filter");
    mapped[word] = `geo=${pick.value} (${pick.sites} sites)`;
    if (pick.alternatives.length > 0) alternatives[word] = pick.alternatives;
  }
  for (const pair of args.all("rank")) {
    const [axis, value] = pair.split("=");
    if (!axis || !value) fail(`--rank takes axis=path, got "${pair}"`);
    add(axis, value, 0.5, "rank");
  }

  const min = args.one("price-min");
  const max = args.one("price-max");
  if (min !== undefined || max !== undefined) {
    const range = {
      ...(min !== undefined ? { min: Number(min) } : {}),
      ...(max !== undefined ? { max: Number(max) } : {}),
      unit: (args.one("unit") ?? "USD").toUpperCase(),
      ...(args.one("per") ? { per: args.one("per") } : {}),
      ...(args.has("within") ? { match: "within" } : {}),
    };
    axes.push({ axis: "price", range, weight: 0.9, mode: "filter" });
  }

  if (axes.length === 0) {
    process.stdout.write(
      `${JSON.stringify({
        unmapped,
        next:
          "No word maps to the vocabulary. Translate the user's words to English vocabulary words, or pass values by " +
          "the grammar with --value object=... --value geo=... (references/grammar.md).",
      })}\n`,
    );
    return;
  }

  const answer = await call("POST", "/v1/tools/alp_query", {
    axes,
    limit: Number(args.one("limit") ?? 5),
    ...(args.has("no-demand") ? { record_demand: false } : {}),
  });
  const gaps = answer.gaps ?? [];
  const uncovered = gaps.filter((gap) => gap.state === "not_covered");
  const output = {
    asked: axes.map((item) => (item.range ? `${item.axis}=${JSON.stringify(item.range)}` : `${item.axis}=${item.value}`)),
    mapped,
    ...(unmapped.length > 0 ? { unmapped } : {}),
    ...(Object.keys(alternatives).length > 0 ? { alternatives } : {}),
    total: answer.total_matches,
    results: (answer.results ?? []).map(short),
    ...(answer.notes ? { notes: answer.notes } : {}),
    ...(gaps.length > 0 ? { gaps } : {}),
  };
  if (answer.total_matches === 0) {
    output.next =
      uncovered.length > 0
        ? "ALP does not cover this yet. Answer the user another way, e.g. a web search. If you find sites, you may offer " +
          "the user to add them to ALP: run `report` without --consent to see what to ask them first."
        : (answer.hint ?? "Relax a filter: a broader value, or mode rank.");
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

async function report(args) {
  const need = {
    ...(args.one("object") ? { object: args.one("object") } : {}),
    ...(args.one("geo") ? { geo: args.one("geo") } : {}),
  };
  const hosts = csv(args.one("hosts"));
  if (!need.object && !need.geo) fail("report needs --object, --geo or both: the niche the sites answer");
  if (hosts.length === 0) fail("report needs --hosts a.example,b.example");
  if (args.one("consent") !== "user") {
    process.stdout.write(
      `${JSON.stringify({ sent: false, would_send: { need, hosts }, consent_required: NOTICE })}\n`,
    );
    process.exit(2);
  }
  if (args.has("dry-run")) {
    process.stdout.write(`${JSON.stringify({ sent: false, would_send: { need, hosts, consent: "user" } })}\n`);
    return;
  }
  const answer = await call("POST", "/v1/report-sources", { need, hosts: hosts.slice(0, 10), consent: "user" });
  process.stdout.write(`${JSON.stringify({ sent: true, ...answer })}\n`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (command) {
    case "ask":
      return ask(args);
    case "find": {
      const answer = await call("GET", `/v1/axes?find=${encodeURIComponent(args.words.join(","))}&limit=5`);
      process.stdout.write(`${JSON.stringify(answer.found ?? [])}\n`);
      return;
    }
    case "query": {
      const body = args.words.join(" ");
      if (!body) fail("query takes the arguments of alp_query as JSON");
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        fail("query takes JSON");
      }
      const answer = await call("POST", "/v1/tools/alp_query", parsed);
      process.stdout.write(`${JSON.stringify({ ...answer, results: (answer.results ?? []).map(short) })}\n`);
      return;
    }
    case "report":
      return report(args);
    case "demand": {
      const days = args.one("days");
      process.stdout.write(`${JSON.stringify(await call("GET", `/v1/demand${days ? `?days=${days}` : ""}`))}\n`);
      return;
    }
    case "sites": {
      const host = args.one("host");
      const answer = await call("GET", `/v1/sites?limit=50${host ? `&host=${encodeURIComponent(host)}` : ""}`);
      process.stdout.write(
        `${JSON.stringify({ total: answer.total, sites: (answer.sites ?? []).map((site) => [site.url, site.axes.join("/")]) })}\n`,
      );
      return;
    }
    default:
      fail("commands: ask, find, query, report, demand, sites");
  }
}

await main();
