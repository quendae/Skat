import fs from 'node:fs';

const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');

if (html.includes('<script src="./multiplayer-server.js"></script>')) {
  console.log('Skat multiplayer server client is already wired into index.html');
  process.exit(0);
}

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

html = html.replace(
  '<meta name="skat-signaling-url" content="" />',
  '<meta name="skat-api-url" content="https://api.qqnd.fyi" />'
);
html = html.replace('/* === v16 experimental peer-to-peer multiplayer === */', '/* === multiplayer lobby / shared QQND server === */');
html = html.replace(/>P2P<\/span>/g, '>SERVER</span>');

fs.writeFileSync(path, html);
console.log('Replaced legacy WebRTC/Cloudflare signaling client with multiplayer-server.js');
