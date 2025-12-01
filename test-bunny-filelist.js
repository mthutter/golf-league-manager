import http from "http";
import * as BunnyStorageSDK from "@bunny.net/storage-sdk";

const sz_zone = 1277495;
//const sz_zone = process.env.STORAGE_ZONE;
const access_key = 'dc1ab5e8-46d6-4c81-935dab5c7697-910d-4bc4';
//const access_key = process.env.STORAGE_ACCESS_KEY;

const sz = BunnyStorageSDK.zone.connect_with_accesskey(
  BunnyStorageSDK.regions.StorageRegion.Falkenstein,
  sz_zone,
  access_key
);

console.log("Starting server on http://127.0.0.1:8080...");

const server = http.createServer(async (req, res) => {
  console.log(`[INFO]: ${req.method} - ${req.url}`);

  try {
    const list = await BunnyStorageSDK.file.list(sz, "/");

    res.writeHead(200, {
      "Content-Type": "application/json"
    });
    res.end(JSON.stringify(list));

  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.listen(8080, "127.0.0.1");

