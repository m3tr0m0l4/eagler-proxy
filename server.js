const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const UPSTREAM_URL = process.env.UPSTREAM_URL || "wss://m3tr0m0l4.eagler.host/";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("proxy running");
});

const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  console.log("upgrade:", req.url);

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    const upstreamWs = new WebSocket(UPSTREAM_URL);
    const pending = [];
    let upstreamOpen = false;

    upstreamWs.on("open", () => {
      upstreamOpen = true;
      console.log("upstream open:", UPSTREAM_URL);
      while (pending.length) {
        const { msg, isBinary } = pending.shift();
        upstreamWs.send(msg, { binary: isBinary });
      }
    });

    clientWs.on("message", (msg, isBinary) => {
      if (upstreamOpen) {
        upstreamWs.send(msg, { binary: isBinary });
      } else {
        pending.push({ msg, isBinary });
      }
    });

    upstreamWs.on("message", (msg, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(msg, { binary: isBinary });
      }
    });

    clientWs.on("close", () => {
      console.log("client closed");
      try { upstreamWs.close(); } catch {}
    });

    upstreamWs.on("close", () => {
      console.log("upstream closed");
      try { clientWs.close(); } catch {}
    });

    clientWs.on("error", (err) => {
      console.error("client error:", err.message);
      try { upstreamWs.close(); } catch {}
    });

    upstreamWs.on("error", (err) => {
      console.error("upstream error:", err.message);
      try { clientWs.close(); } catch {}
    });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`listening on ${PORT}`);
  console.log(`UPSTREAM_URL=${UPSTREAM_URL}`);
});
