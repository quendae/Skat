import './b2-presence-client-hardening.mjs';
import fs from 'node:fs';

const path = 'tests/multiplayer_server_smoke.mjs';
let src = fs.readFileSync(path, 'utf8');
let changed = false;

function replaceOnce(before, after, label) {
  if (src.includes(after)) return;
  if (!src.includes(before)) throw new Error(`Missing marker: ${label}`);
  src = src.replace(before, after);
  changed = true;
}

replaceOnce(
`  ["type: 'game.action'", 'server action routing'],
  ["type: 'game.state.commit'", 'canonical state commit'],
  ["type: 'game.state.publish'", 'seat-private state publication'],
  ["message.type === 'game.player.connection'", 'connection notifications'],`,
`  ["type: 'game.action'", 'server action routing'],
  ["type: 'game.state.get'", 'authoritative state retrieval'],
  ["message.type === 'game.presence'", 'recoverable presence snapshots'],
  ["message.type === 'game.player.connection'", 'connection notifications'],`,
  'authoritative client markers',
);

if (changed) fs.writeFileSync(path, src);
console.log(changed ? 'B2 presence client hardening v2 applied.' : 'B2 presence client hardening v2 already applied.');
