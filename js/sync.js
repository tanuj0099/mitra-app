// Two-device sync via PeerJS (WebRTC data channel, free public broker).
// Face device (phone) hosts a well-known peer id; the stage device (laptop,
// opened with ?stage=1) connects to it. Only small JSON messages flow —
// each device uses its own camera, so no video streaming is needed.

export function initFaceSync(room, { onData, onStatus }) {
  if (typeof Peer === "undefined") return dummy();
  let conn = null;
  const peer = new Peer(`mitra-face-${room}`);
  peer.on("open", () => onStatus("waiting"));
  peer.on("connection", (c) => {
    conn = c;
    c.on("open", () => onStatus("connected"));
    c.on("data", (d) => onData(d));
    c.on("close", () => { conn = null; onStatus("disconnected"); });
  });
  peer.on("error", (e) => onStatus("error:" + e.type));
  return {
    send: (obj) => { if (conn && conn.open) conn.send(obj); },
    isConnected: () => !!(conn && conn.open),
  };
}

export function initStageSync(room, { onData, onStatus }) {
  if (typeof Peer === "undefined") return dummy();
  const peer = new Peer();
  let conn = null;
  let retryTimer = null;
  const retry = () => {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, 2500);
  };
  const connect = () => {
    onStatus("connecting");
    conn = peer.connect(`mitra-face-${room}`, { reliable: true });
    conn.on("open", () => onStatus("connected"));
    conn.on("data", (d) => onData(d));
    conn.on("close", () => { onStatus("disconnected"); retry(); });
    conn.on("error", retry);
  };
  peer.on("open", connect);
  peer.on("error", (e) => {
    onStatus("error:" + e.type);
    if (e.type === "peer-unavailable") retry();
  });
  return {
    send: (obj) => { if (conn && conn.open) conn.send(obj); },
    isConnected: () => !!(conn && conn.open),
  };
}

function dummy() {
  return { send: () => {}, isConnected: () => false };
}
