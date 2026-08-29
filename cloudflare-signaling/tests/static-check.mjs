import fs from "node:fs";

const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const failures = [];

for (const forbidden of [
  'id="mp-incoming-code"',
  'id="mp-answer-code"',
  'id="mp-outgoing-code"',
  'id="mp-response-code"',
  "function pack(",
  "function unpack(",
]) {
  if (html.includes(forbidden)) failures.push(`Pozostał ręczny element multiplayer: ${forbidden}`);
}

for (const required of [
  "function openSignaling(",
  "function acceptSignalOffer(",
  "function applySignalAnswer(",
  "type:'close-room'",
  'data-action="mp-copy-room"',
]) {
  if (!html.includes(required)) failures.push(`Brakuje wymaganego elementu: ${required}`);
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
for (const [index, match] of scripts.entries()) {
  try {
    new Function(match[1]);
  } catch (error) {
    failures.push(`Błąd składni w skrypcie HTML ${index + 1}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Sprawdzono ${scripts.length} skryptów HTML; ręczna wymiana kodów została usunięta.`);
