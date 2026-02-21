const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const dayjs = require("dayjs");

const app = express();

// ZKTeco sends TEXT not JSON
app.use(bodyParser.text({ type: "*/*" }));

// ===== Zoho Config =====
let ACCESS_TOKEN = "";
const REFRESH_TOKEN = "1000.a63d730e17e9e334f29623c1ced66e58.759dbf10148075f798262af7e53e4740";
const CLIENT_ID = "1000.37EJYZH0R3H1Z4PQPRYGNVND8GJ04F";
const CLIENT_SECRET = "db678b5ced25c8c3c32b6b0005a02c300805757418";
const ZOHO_DOMAIN = "https://people.zoho.in";

// ===== Refresh Zoho Token =====
async function refreshAccessToken() {
    try {
        const res = await axios.post(
            "https://accounts.zoho.in/oauth/v2/token",
            null,
            {
                params: {
                    refresh_token: REFRESH_TOKEN,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    grant_type: "refresh_token"
                }
            }
        );

        ACCESS_TOKEN = res.data.access_token;
        console.log("✅ Zoho token refreshed");

    } catch (err) {
        console.log("❌ Token refresh error:", err.response?.data || err.message);
    }
}

// ===== Send Attendance to Zoho BULK API =====
async function sendToZoho(empId, inTime, outTime) {

    if (!ACCESS_TOKEN) await refreshAccessToken();

    const records = [];

    if (inTime) {
        records.push({
            empId,
            checkIn: inTime,
            location: "Indore",
            building: "Head Office"
        });
    }

    if (outTime) {
        records.push({
            empId,
            checkOut: outTime
        });
    }

    if (!records.length) return;

    console.log("📤 Sending bulk attendance payload:", records);

    try {

        const res = await axios.post(
            `${ZOHO_DOMAIN}/people/api/attendance/bulkImport`,
            new URLSearchParams({
                dateFormat: "yyyy-MM-dd HH:mm:ss",
                data: JSON.stringify(records)
            }),
            {
                headers: {
                    Authorization: `Zoho-oauthtoken ${ACCESS_TOKEN}`,
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        console.log("🟢 Zoho Bulk Response:", res.data);

    } catch (err) {
        console.log("❌ Zoho Bulk Error:", err.response?.data || err.message);
    }
}

// ===== DEVICE HANDSHAKE =====
app.get("/iclock/cdata", (req, res) => {
    console.log("🔌 Device handshake received");
    res.send("OK");
});

// ===== DEVICE PUSH HANDLER =====
app.post("/iclock/cdata", async (req, res) => {

    try {

        const raw = req.body;
        console.log("📩 Raw Data From Device:\n", raw);

        const lines = raw.split("\n");
        const attendanceMap = {};

        for (let line of lines) {

            if (!line.trim()) continue;

            const parts = line.split("\t");

            const userId = parts[0];
            const time = parts[1];

            if (!userId || !time) continue;

            const empId = "EED" + userId;

            if (!attendanceMap[empId])
                attendanceMap[empId] = { in: null, out: null };

            const t = dayjs(time);

            if (!attendanceMap[empId].in || t.isBefore(attendanceMap[empId].in))
                attendanceMap[empId].in = t.format("YYYY-MM-DD HH:mm:ss");

            if (!attendanceMap[empId].out || t.isAfter(attendanceMap[empId].out))
                attendanceMap[empId].out = t.format("YYYY-MM-DD HH:mm:ss");

            console.log(`📌 Parsed: ${empId} | ${time}`);
        }

        // Send aggregated data to Zoho
        for (const empId in attendanceMap) {
            const a = attendanceMap[empId];
            await sendToZoho(empId, a.in, a.out);
        }

        res.send("OK");

    } catch (err) {
        console.log("❌ Push Error:", err.message);
        res.status(500).send("ERROR");
    }
});

// ===== START SERVER =====
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 ADMS Push API running on port ${PORT}`);
});