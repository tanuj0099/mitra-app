// Two-device sync via PeerJS (WebRTC, free public broker).
// The face device (phone) hosts a well-known peer id and does ALL the work:
// camera, pose tracking, speech. The stage device (laptop, ?stage=1) is a
// pure display — it receives the phone's composited camera+overlay canvas
// as a video stream, plus small JSON HUD updates.

// Optional ?peer=host:port URL param points at a self-hosted PeerJS server
// (used for testing; also a venue fallback if the public broker is blocked).
function peerOpts() {
  const p = new URLSearchParams(location.search);
  const spec = p.get("peer");
  if (!spec) return {};
  const [host, port] = spec.split(":");
  return {
    host,
    port: Number(port) || 443,
    path: p.get("peerpath") || "/",
    secure: location.protocol === "https:" && !host.startsWith("localhost"),
  };
}

export function initFaceSync(room, { onStatus }) {
  if (typeof Peer === "undefined") return dummy();
  let peer = null, conn = null, media = null;

  const make = () => {
    peer = new Peer(`mitra-face-${room}`, peerOpts());
    peer.on("open", () => onStatus("waiting"));
    peer.on("connection", (c) => {
      conn = c;
      c.on("open", () => onStatus("connected"));
      c.on("close", () => { conn = null; onStatus("disconnected"); });
    });
    peer.on("disconnected", () => { try { peer.reconnect(); } catch {} });
    peer.on("error", (e) => {
      onStatus("error:" + e.type);
      // A stale session may still hold our id after a refresh — retake it.
      if (e.type === "unavailable-id") {
        try { peer.destroy(); } catch {}
        setTimeout(make, 3000);
      }
    });
  };
  make();

  return {
    send: (obj) => { if (conn && conn.open) conn.send(obj); },
    isConnected: () => !!(conn && conn.open),
    callStage: (stream) => {
      if (!conn) return;
      try { if (media) media.close(); } catch {}
      media = peer.call(conn.peer, stream);
    },
    endCall: () => {
      try { if (media) media.close(); } catch {}
      media = null;
    },
  };
}

export function initStageSync(room, { onData, onStream, onCallEnd, onStatus }) {
  if (typeof Peer === "undefined") return dummy();
  const peer = new Peer(peerOpts());
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
  peer.on("call", (call) => {
    call.answer(); // display only — we send no stream back
    call.on("stream", (s) => onStream(s));
    call.on("close", () => onCallEnd());
  });
  peer.on("error", (e) => {
    onStatus("error:" + e.type);
    if (e.type === "peer-unavailable") retry();
  });
  return {
    send: (obj) => { if (conn && conn.open) conn.send(obj); },
    isConnected: () => !!(conn && conn.open),
    // Drop the current connection and reconnect (used when we reached a
    // stale ghost session that never completes the handshake).
    retryNow: () => { try { if (conn) conn.close(); } catch {} },
  };
}

function dummy() {
  return { send: () => {}, isConnected: () => false, callStage: () => {}, endCall: () => {} };
}
