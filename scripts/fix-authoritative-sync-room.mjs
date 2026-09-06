import fs from 'node:fs';

const path = 'multiplayer-server.js';
let src = fs.readFileSync(path, 'utf8');
const obsolete = `
    if (mp.inGame && previousHost && previousHost !== room.ownerSessionId) {
      networkInterrupted('Gospodarz opuścił grę. To rozdanie nie może być bezpiecznie kontynuowane.');
      return;
    }
`;
if (src.includes(obsolete)) {
  src = src.replace(obsolete, '\n');
  fs.writeFileSync(path, src);
  console.log('Removed obsolete browser-host abort branch.');
} else {
  console.log('Obsolete browser-host abort branch already absent.');
}
