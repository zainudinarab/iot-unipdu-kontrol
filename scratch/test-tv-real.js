const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2 && !line.trim().startsWith('#')) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const clientId = env.TUYA_CLIENT_ID;
const clientSecret = env.TUYA_CLIENT_SECRET;
const endpoint = env.TUYA_ENDPOINT || 'https://openapi-sg.iotbing.com';

function encryptHMAC(data, secret) {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex').toUpperCase();
}

function sha256(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function getSignature(method, path, accessToken, timestamp, bodyStr = '') {
  const contentSha = sha256(bodyStr);
  const headers = '';
  const signUrl = path;
  const signString = `${method}\n${contentSha}\n${headers}\n${signUrl}`;
  const stringToSign = `${clientId}${accessToken}${timestamp}${signString}`;
  return encryptHMAC(stringToSign, clientSecret);
}

async function getAccessToken() {
  const timestamp = Date.now().toString();
  const path = '/v1.0/token?grant_type=1';
  const signature = getSignature('GET', path, '', timestamp);

  const res = await fetch(`${endpoint}${path}`, {
    method: 'GET',
    headers: {
      'client_id': clientId,
      'sign': signature,
      't': timestamp,
      'sign_method': 'HMAC-SHA256',
    },
  });

  const data = await res.json();
  return data.result.access_token;
}

async function checkTVFunctions(deviceId) {
  try {
    const accessToken = await getAccessToken();
    const timestamp = Date.now().toString();
    
    // Check functions
    const pathFunc = `/v1.0/devices/${deviceId}/functions`;
    const signatureFunc = getSignature('GET', pathFunc, accessToken, timestamp);
    const resFunc = await fetch(`${endpoint}${pathFunc}`, {
      method: 'GET',
      headers: {
        'client_id': clientId,
        'access_token': accessToken,
        'sign': signatureFunc,
        't': timestamp,
        'sign_method': 'HMAC-SHA256',
      },
    });
    const dataFunc = await resFunc.json();
    console.log(`\n=== FUNCTIONS FOR TV: ${deviceId} ===`);
    console.log(JSON.stringify(dataFunc, null, 2));

  } catch (error) {
    console.error(`Error checking functions:`, error);
  }
}

async function run() {
  await checkTVFunctions('a3b6c4141fc4828220hosh'); // Real TV ID
}

run();
