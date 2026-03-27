const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const UPSTREAM_URL = process.env.UPSTREAM_URL || "wss://YOUR-SERVER.eagler.host/";

const publicDir = path.join(__dirname, "public");
const indexFile = path.join(publicDir, "index.html");

function sendFile(res, filePath, contentType = "text/html; charset=utf-8") {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  if (req.url === "/" || req.url === "/index.html") {
    return sendFile(res, indexFile);
  }

  const safePath = path.normalize(req.url).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8"
  };

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return sendFile(res, filePath, types[ext] || "application/octet-stream");
  }

  return sendFile(res, indexFile);
});

const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    const upstreamWs = new WebSocket(UPSTREAM_URL, {
      headers: {
        "X-Forwarded-For":
          req.headers["x-forwarded-for"] ||
          req.socket.remoteAddress ||
          "",
        "X-Real-IP": req.socket.remoteAddress || ""
      }
    });

    const queue = [];
    let upstreamOpen = false;

    clientWs.on("message", (msg) => {
      if (upstreamOpen) upstreamWs.send(msg);
      else queue.push(msg);
    });

    upstreamWs.on("open", () => {
      upstreamOpen = true;
      while (queue.length) upstreamWs.send(queue.shift());
    });

    upstreamWs.on("message", (msg) => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(msg);
    });

    const closeBoth = () => {
      try { clientWs.close(); } catch {}
      try { upstreamWs.close(); } catch {}
    };

    clientWs.on("close", closeBoth);
    upstreamWs.on("close", closeBoth);
    clientWs.on("error", closeBoth);
    upstreamWs.on("error", closeBoth);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Proxy listening on ${PORT}`);
});
