// One-off: how do dnd5e's authored activities pair activity type with activation type?
//
// Question behind it: is "an activity of type `damage` never costs an action" safe as a general rule,
// or are there authored damage activities that legitimately cost one? Run against the unpacked
// content in the research corpus:
//   node scripts/census-damage-activities.mjs C:\Project\_research\dnd5e\packs\_source

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

const root = process.argv[2];
if (!root) {
  console.error("usage: node scripts/census-damage-activities.mjs <packs/_source dir>");
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".yml") || entry.endsWith(".yaml")) out.push(full);
  }
  return out;
}

const pairs = new Map(); // `${activityType}|${activationType}` -> { count, examples: [] }
let files = 0;
let activities = 0;

for (const file of walk(root)) {
  let doc;
  try {
    doc = YAML.parse(readFileSync(file, "utf8"));
  } catch {
    continue;
  }
  const acts = doc?.system?.activities;
  if (!acts || typeof acts !== "object") continue;
  files += 1;
  for (const activity of Object.values(acts)) {
    if (!activity || typeof activity !== "object") continue;
    activities += 1;
    const type = String(activity.type ?? "");
    const activation = String(activity.activation?.type ?? "");
    const key = `${type}|${activation}`;
    let bucket = pairs.get(key);
    if (!bucket) {
      bucket = { count: 0, examples: [] };
      pairs.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.examples.length < 6) bucket.examples.push(doc.name ?? "?");
  }
}

console.log(`files with activities: ${files}, activities: ${activities}\n`);

const rows = [...pairs.entries()].sort((a, b) => b[1].count - a[1].count);
console.log("activityType | activationType | count | examples");
for (const [key, bucket] of rows) {
  const [type, activation] = key.split("|");
  console.log(
    `${type || "(none)"} | ${activation || "(empty)"} | ${bucket.count} | ${bucket.examples.join(", ")}`,
  );
}

console.log("\n--- damage-type activities that claim a real slot ---");
for (const [key, bucket] of rows) {
  const [type, activation] = key.split("|");
  if (type !== "damage") continue;
  if (!["action", "bonus", "reaction"].includes(activation)) continue;
  console.log(`${activation}: ${bucket.count} — ${bucket.examples.join(", ")}`);
}
