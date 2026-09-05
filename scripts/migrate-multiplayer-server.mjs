import fs from 'node:fs';

const indexPath = 'index.html';
let html = fs.readFileSync(indexPath, 'utf8');
let changed = false;

if (!html.includes('<script src="./multiplayer-server.js"></script>')) {
  const rtcMarker = "  const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };";
  const markerIndex = html.indexOf(rtcMarker);
  if (markerIndex < 0) throw new Error('Could not find legacy WebRTC multiplayer marker');

  const scriptStart = html.lastIndexOf('<script>', markerIndex);
  const bodyEnd = html.lastIndexOf('</body>');
  const scriptEnd = html.lastIndexOf('</script>', bodyEnd);
  if (scriptStart < 0 || scriptEnd < scriptStart) throw new Error('Could not isolate legacy multiplayer script');

  html = html.slice(0, scriptStart)
    + '<script src="./multiplayer-server.js"></script>\n\n'
    + html.slice(scriptEnd + '</script>'.length);
  changed = true;
}

const normalized = html
  .replace('<meta name="skat-signaling-url" content="" />', '<meta name="skat-api-url" content="https://api.qqnd.fyi" />')
  .replace('/* === v16 experimental peer-to-peer multiplayer === */', '/* === multiplayer lobby / shared QQND server === */')
  .replace(/>P2P<\/span>/g, '>SERVER</span>');
if (normalized !== html) {
  html = normalized;
  changed = true;
}
if (changed) fs.writeFileSync(indexPath, html);

const clientPath = 'multiplayer-server.js';
let client = fs.readFileSync(clientPath, 'utf8');
const brokenInsert = "if (button) createSection.insertBefore(label, button);";
const fixedInsert = "if (button) createSection.insertBefore(label, button.closest('.multiplayer-actions') || button);";
if (client.includes(brokenInsert)) {
  client = client.replace(brokenInsert, fixedInsert);
  fs.writeFileSync(clientPath, client);
  changed = true;
}

console.log(changed ? 'Multiplayer migration/update applied.' : 'Multiplayer migration already up to date.');
