// netlify/functions/log-session.js
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { clientName, messages } = body;

    if (!clientName || !Array.isArray(messages)) {
      return { statusCode: 400, body: "Missing clientName or messages[]" };
    }

    const dataDir = path.join(__dirname, "data");
    const filePath = path.join(dataDir, `${clientName}.json`);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    let history = [];
    if (fs.existsSync(filePath)) {
      history = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    history.push({ timestamp: Date.now(), messages });

    fs.writeFileSync(filePath, JSON.stringify(history, null, 2));

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, clientName, count: history.length }),
    };
  } catch (err) {
    return { statusCode: 500, body: "Error: " + err.message };
  }
};
