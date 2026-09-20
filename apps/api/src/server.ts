import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3001);

createServer((request, response) => {
  if (request.method !== "GET" || request.url !== "/health") {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ service: "company-human-api", status: "ok" }));
}).listen(port);
