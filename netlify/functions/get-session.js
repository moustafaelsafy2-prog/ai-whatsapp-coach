// netlify/functions/get-session.js
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const clientName = event.queryStringParameters?.client;
    if (!clientName) {
      return { statusCode: 400, body: "Missing client parameter" };
    }

    const filePath = path.join(__dirname, "data", `${clientName}.json`);
    if (!fs.existsSync(filePath)) {
      return { statusCode: 404, body: "Client not found" };
    }

    const history = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    return {
      statusCode: 200,
      body: JSON.stringify(history),
    };
  } catch (err) {
    return { statusCode: 500, body: "Error: " + err.message };
  }
};
