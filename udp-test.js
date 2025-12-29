const dgram = require("dgram");

const client = dgram.createSocket("udp4");
const PORT = 4370;
const HOST = "192.168.1.5";

// timeout after 5 seconds if no reply
const timeout = setTimeout(() => {
  console.log("⏳ No response — UDP 4370 may be blocked or device is ignoring packets.");
  client.close();
}, 5000);

client.on("error", (err) => {
  console.log("❌ UDP Error:", err.message);
  clearTimeout(timeout);
  client.close();
});

client.on("message", (msg, rinfo) => {
  console.log(`✅ UDP reply from ${rinfo.address}:${rinfo.port} -> ${msg.toString()}`);
  clearTimeout(timeout);
  client.close();
});

client.send("ping", PORT, HOST, (err) => {
  if (err) {
    console.log("❌ Send error:", err.message);
    clearTimeout(timeout);
    client.close();
  } else {
    console.log(`📤 Sent UDP test packet to ${HOST}:${PORT}`);
  }
});
