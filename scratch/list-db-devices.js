const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

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

// Load service account key
const serviceAccountPath = path.join(__dirname, '..', 'iot-unipdu-firebase-adminsdk-fbsvc-328a990e64.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({
  credential: cert(serviceAccount),
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'iot-unipdu'
});

const db = getFirestore();

async function run() {
  console.log('Fetching devices from Firestore...');
  const snapshot = await db.collection('devices').get();
  const devices = [];
  snapshot.forEach(doc => {
    devices.push({ id: doc.id, ...doc.data() });
  });
  
  console.log('DEVICES:');
  console.log(JSON.stringify(devices, null, 2));

  console.log('\nFetching rooms from Firestore...');
  const roomsSnapshot = await db.collection('rooms').get();
  const rooms = [];
  roomsSnapshot.forEach(doc => {
    rooms.push({ id: doc.id, ...doc.data() });
  });
  console.log('ROOMS:');
  console.log(JSON.stringify(rooms, null, 2));
}

run();
