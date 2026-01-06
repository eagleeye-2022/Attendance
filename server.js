const ZKLib = require("node-zklib");
const axios = require("axios");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const cron = require("node-cron");

dayjs.extend(utc);
dayjs.extend(timezone);

// ========== CONFIG ==========
const DEVICE_IP = "192.168.10.33";

// Zoho Credentials
const ZOHO = {
    client_id: "1000.37EJYZH0R3H1Z4PQPRYGNVND8GJ04F",
    client_secret: "db678b5ced25c8c3c32b6b0005a02c300805757418",
    refresh_token: "1000.fd87f82ce6758ccbf7bccb05cc133494.6a55971c2fa740b6fc6981e9a66d2260",
    domain: "https://people.zoho.in"
};

let ACCESS_TOKEN = "";
const IST = "Asia/Kolkata";

// ==========================================================
// 1️⃣ REFRESH ZOHO ACCESS TOKEN
// ==========================================================
async function refreshZohoToken() {
    try {
        const res = await axios.post(
            "https://accounts.zoho.in/oauth/v2/token",
            new URLSearchParams({
                refresh_token: ZOHO.refresh_token,
                client_id: ZOHO.client_id,
                client_secret: ZOHO.client_secret,
                grant_type: "refresh_token",
            }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        ACCESS_TOKEN = res.data.access_token;
        console.log("🔄 Access token refreshed");
    } catch (err) {
        console.error("❌ Failed to refresh access token:", err.response?.data || err);
    }
}

// ==========================================================
// 2️⃣ SEND DATA TO ZOHO PEOPLE
// ==========================================================
async function sendToZoho(records) {
    try {
        const res = await axios.post(
            `${ZOHO.domain}/people/api/attendance/bulkImport`,
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

        console.log("🟢 Zoho response:", res.data);
    } catch (err) {
        console.error("❌ Zoho error:", err.response?.data || err.message);
    }
}

// ==========================================================
// 3️⃣ MAIN POLLING FUNCTION (NO LOCAL DB)
// ==========================================================
async function pollTodayAttendance() {
    let zk;

    const TODAY = dayjs().tz(IST).format("YYYY-MM-DD");
    console.log(`📅 Fetching attendance for: ${TODAY}`);

    try {
        zk = new ZKLib(DEVICE_IP, 4370, 10000, 4000);
        await zk.createSocket();
        console.log("✅ Connected to device");

        const logs = await zk.getAttendances();
        if (!logs?.data?.length) {
            console.log("⚠ No logs received");
            return;
        }

        console.log(`📌 Logs fetched: ${logs.data.length}`);

        const attendanceMap = {};

        for (const log of logs.data) {
            const userId = log.deviceUserId;
            const attTime = log.recordTime ? new Date(log.recordTime) : null;
            if (!userId || !attTime) continue;

            const empId = `EED${userId}`;
            const date = dayjs(attTime).tz(IST).format("YYYY-MM-DD");
            if (date !== TODAY) continue;

            if (!attendanceMap[empId])
                attendanceMap[empId] = { In_Time: null, Out_Time: null };

            const formatted = dayjs(attTime).tz(IST).format("YYYY-MM-DD HH:mm:ss");

            if (!attendanceMap[empId].In_Time || attTime < new Date(attendanceMap[empId].In_Time)) {
                attendanceMap[empId].In_Time = formatted;
            }

            if (!attendanceMap[empId].Out_Time || attTime > new Date(attendanceMap[empId].Out_Time)) {
                attendanceMap[empId].Out_Time = formatted;
            }
        }

        for (const empId in attendanceMap) {
            const att = attendanceMap[empId];
            const records = [];

            if (att.In_Time) {
                records.push({
                    empId,
                    checkIn: att.In_Time,
                    location: "Indore",
                    building: "Head Office"
                });
            }

            if (att.Out_Time) {
                records.push({
                    empId,
                    checkOut: att.Out_Time
                });
            }

            if (records.length) {
                console.log("📤 Sending to Zoho:", records);
                await sendToZoho(records);
                await new Promise(r => setTimeout(r, 5000)); // API limit safety
            }
        }

    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        if (zk) try { await zk.disconnect(); } catch {}
    }
}

// ==========================================================
// 4️⃣ SCHEDULER (7:30 PM – 7:40 PM IST)
// ==========================================================
cron.schedule(
  "30-45 15 * * *",
  async () => {
    const nowIST = dayjs().tz("Asia/Kolkata").format("HH:mm:ss");
    console.log("⏰ Cron triggered at IST:", nowIST);

    await refreshZohoToken();
    await pollTodayAttendance();
  },
  {
    timezone: "Asia/Kolkata"
  }
);


console.log("⏳ Scheduler started. Script will run daily from 7:30 PM to 7:40 PM IST.");
