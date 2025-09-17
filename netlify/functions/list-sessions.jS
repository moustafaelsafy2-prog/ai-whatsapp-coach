// netlify/functions/list-sessions.js
const fs = require('fs');
const path = require('path');

exports.handler = async () => {
  try {
    const dataDir = path.join(__dirname, "data");
    if (!fs.existsSync(dataDir)) {
      return { statusCode: 200, body: JSON.stringify([]) };
    }

    const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json"));
    const clients = files.map(f => f.replace(".json", ""));

    return {
      statusCode: 200,
      body: JSON.stringify(clients),
    };
  } catch (err) {
    return { statusCode: 500, body: "Error: " + err.message };
  }
};
