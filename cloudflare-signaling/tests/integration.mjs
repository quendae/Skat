import assert from "node:assert/strict";

const base = process.env.SKAT_TEST_URL || "http://127.0.0.1:8787";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function roomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function socketUrl(room) {
  const url = new URL(`/api/rooms/${room}/socket`, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

function client(room, credentials) {
  const socket = new WebSocket(socketUrl(room));
  const queued = [];
  const waiters = [];

  function deliver(message) {
    const index = waiters.findIndex((waiter) => waiter.test(message));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else queued.push(message);
  }

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "auth-required") {
      socket.send(JSON.stringify({ type: "authenticate", ...credentials }));
    }
    deliver(message);
  });

  function waitFor(type, predicate = () => true, timeoutMs = 5000) {
    const test = (message) => message.type === type && predicate(message);
    const index = queued.findIndex(test);
    if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { test, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        const waiterIndex = waiters.indexOf(waiter);
        if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
        reject(new Error(`Timeout waiting for ${type}`));
      }, timeoutMs);
      waiters.push(waiter);
    });
  }

  return { socket, waitFor, send: (message) => socket.send(JSON.stringify(message)) };
}

const health = await fetch(`${base}/api/health`).then((response) => response.json());
assert.equal(health.ok, true);

const room = roomCode();
const auth = "a".repeat(64);
const createdResponse = await fetch(`${base}/api/rooms`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ room, nick: "Host Test", auth, passwordProtected: false }),
});
assert.equal(createdResponse.status, 201);
const created = await createdResponse.json();
assert.equal(created.room, room);
assert.ok(created.hostToken.length >= 24);

const host = client(room, { role: "host", token: created.hostToken });
await host.waitFor("authenticated");

const guest1 = client(room, { role: "guest", auth, nick: "Guest One" });
const guest1Auth = await guest1.waitFor("authenticated");
assert.ok(guest1Auth.guestId);
await host.waitFor("guest-joined", (message) => message.guestId === guest1Auth.guestId);

const offer = { type: "offer", sdp: "v=0\r\no=guest-one 1 1 IN IP4 127.0.0.1\r\ns=Skat\r\n" };
guest1.send({ type: "offer", sdp: offer });
await host.waitFor("offer", (message) => message.guestId === guest1Auth.guestId && message.sdp.sdp === offer.sdp);

const answer = { type: "answer", sdp: "v=0\r\no=host 1 1 IN IP4 127.0.0.1\r\ns=Skat\r\n" };
host.send({ type: "answer", guestId: guest1Auth.guestId, seat: 1, sdp: answer });
const receivedAnswer = await guest1.waitFor("answer");
assert.equal(receivedAnswer.seat, 1);
assert.equal(receivedAnswer.sdp.sdp, answer.sdp);
guest1.send({ type: "connected" });
await host.waitFor("guest-connected", (message) => message.guestId === guest1Auth.guestId);

const guest2 = client(room, { role: "guest", auth, nick: "Guest Two" });
await guest2.waitFor("authenticated");

const guest3 = client(room, { role: "guest", auth, nick: "Guest Three" });
const fullClose = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Third guest was not rejected")), 5000);
  guest3.socket.addEventListener("close", (event) => {
    clearTimeout(timer);
    resolve(event);
  }, { once: true });
});
const closeEvent = await fullClose;
assert.equal(closeEvent.code, 4009);

host.send({ type: "close-room" });
await guest1.waitFor("room-closed");

for (const connection of [host, guest1, guest2, guest3]) {
  try { connection.socket.close(); } catch {}
}

console.log("Integracja sygnalizacji działa: pokój, dwóch gości, oferta, odpowiedź, limit oraz zamknięcie.");
