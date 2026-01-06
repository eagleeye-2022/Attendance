const express = require("express");
const axios = require("axios");
const dayjs = require("dayjs");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================= CONFIG =================
const PORT = 3000;

// 🔐 ZOHO CREDENTIALS (hardcoded as you requested)
const ZOHO_CLIENT_ID = "1000.37EJYZH0R3H1Z4PQPRYGNVND8GJ04F";
const ZOHO_CLIENT_SECRET = "db678b5ced25c8c3c32b6b0005a02c300805757418";
const ZOHO_REFRESH_TOKEN = "1000.fd87f82ce6758ccbf7bccb05cc133494.6a55971c2fa740b6fc6981e9a66d2260";
const ZOHO_DOMAIN = "https://people.zoho.in";

let ACCESS_TOKEN = "";

// ================= ZOHO TOKEN =================
async function refreshZohoToken() {
    const res = await axios.post(
        "https://accounts.zoho.in/oauth/v2/token",
        new URLSearchParams({
            refresh_token: ZOHO_REFRESH_TOKEN,
            client_id: ZOHO_CLIENT_ID,
            client_secret: ZOHO_CLIENT_SECRET,
            grant_type: "refresh_token"
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    ACCESS_TOKEN = res.data.access_token;
    console.log("🔄 Zoho access token refreshed");
}

// ================= SEND TO ZOHO =================
async function sendToZoho(records) {
    await axios.post(
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

    console.log("🟢 Attendance sent to Zoho");
}

// ================= PUSH ENDPOINT =================
app.post("/zk-push", async (req, res) => {
    console.log("📥 Data received from device:", req.body);

    /*
      Common payload sent by devices (varies by model):
      {
        PIN: "12",
        DateTime: "2026-01-06 09:30:15",
        Status: "0"
      }
    */

    try {
        if (!ACCESS_TOKEN) {
            await refreshZohoToken();
        }

        const empId = `EED${req.body.PIN}`;
        const time = dayjs(req.body.DateTime).format("YYYY-MM-DD HH:mm:ss");

        const record = [{
            empId,
            checkIn: time,
            location: "Indore",
            building: "Head Office"
        }];

        await sendToZoho(record);

        res.status(200).send("OK");
    } catch (err) {
        console.error("❌ Error handling push:", err.response?.data || err);
        res.status(500).send("ERROR");
    }
});

// ================= START SERVER =================
app.listen(PORT, () => {
    console.log(`🚀 Attendance PUSH API running on port ${PORT}`);
    console.log(`📡 Waiting for biometric device data...`);
});
