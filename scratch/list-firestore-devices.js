const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2 && !line.trim().startsWith('#')) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

// Set environment variables for admin SDK to bypass real time check if possible
process.env.FIRESTORE_EMULATOR_HOST = env.FIRESTORE_EMULATOR_HOST;

const serviceAccount = require('../serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  console.log('--- FIRESTORE DEVICES ---');
  const snap = await db.collection('devices').get();
  snap.forEach(doc => {
    console.log(`Document ID: ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
    console.log('-------------------------');
  });
}

run();
