// Keep-alive script to prevent Render free tier cold starts
const axios = require('axios');

const API_URL = process.env.API_URL || 'https://bici-ryder-api.onrender.com';
const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes

async function keepAlive() {
  try {
    const response = await axios.get(`${API_URL}/health`, { timeout: 5000 });
    console.log(`✅ Keep-alive ping successful - ${new Date().toISOString()} - Status: ${response.data.status}`);
  } catch (error) {
    console.log(`❌ Keep-alive ping failed - ${new Date().toISOString()} - Error: ${error.message}`);
  }
}

// Start keep-alive pings
console.log(`🔄 Starting keep-alive for ${API_URL} every ${PING_INTERVAL / 60000} minutes`);
setInterval(keepAlive, PING_INTERVAL);

// Initial ping
keepAlive();