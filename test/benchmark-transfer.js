const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const zlib = require("node:zlib");
const { weatherUrl } = require("../src/weather-parser.js");

const [directory, latitude, longitude] = process.argv.slice(2);
const upstream = weatherUrl({ lat: latitude, lon: longitude });

const server = http.createServer((incoming, outgoing) => {
    const variant = incoming.url.slice(1);
    if (incoming.method !== "GET" || !["Old", "New"].includes(variant)) {
        outgoing.writeHead(404).end();
        return;
    }
    const headers = {};
    for (const name of ["user-agent", "accept-language", "accept-encoding", "cache-control"]) {
        if (incoming.headers[name]) headers[name] = incoming.headers[name];
    }
    const request = https.get(upstream, { headers }, response => {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("error", error => outgoing.destroy(error));
        response.on("end", () => {
            const body = Buffer.concat(chunks);
            const encoding = response.headers["content-encoding"] || "identity";
            const metadata = { status: response.statusCode, offered: headers["accept-encoding"] || "", encoding, bytes: body.length };
            try {
                metadata.decoded = encoding === "gzip" ? zlib.gunzipSync(body).length : body.length;
                fs.writeFileSync(path.join(directory, variant + "-wire.json"), JSON.stringify(metadata));
                const outputHeaders = { "Content-Type": response.headers["content-type"] || "text/html", "Cache-Control": "no-store" };
                if (response.headers["content-encoding"]) outputHeaders["Content-Encoding"] = encoding;
                outgoing.writeHead(response.statusCode, outputHeaders).end(body);
            } catch (error) { outgoing.destroy(error); }
        });
    });
    request.setTimeout(20000, () => request.destroy(new Error("Yandex request timed out")));
    request.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
});
server.listen(0, "127.0.0.1", () => {
    const filename = path.join(directory, "port");
    fs.writeFileSync(filename + ".part", String(server.address().port));
    fs.renameSync(filename + ".part", filename);
});
setTimeout(() => server.close(), 120000).unref();
