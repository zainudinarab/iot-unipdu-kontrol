const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

// Path ke berkas kunci Service Account JSON Anda
const serviceAccountPath = path.join(__dirname, 'iot-unipdu-firebase-adminsdk-fbsvc-328a990e64.json');
const serviceAccount = require(serviceAccountPath);

// Initialize Admin SDK using modular syntax
initializeApp({
  credential: cert(serviceAccount)
});

const auth = getAuth();
const db = getFirestore();

async function runInjection() {
  console.log('Starting Firebase injection database initialization...');
  
  const email = 'admin@unipdu.ac.id';
  const password = 'admin123';
  
  // Default mock UID to write to Firestore if Auth creation fails
  // NOTE: If you register admin@unipdu.ac.id manually in the Firebase Auth console,
  // replace this Firestore document ID with the actual UID from Auth console.
  let uid = 'admin-puskom-default-uid';

  // 1. Try to Create User Auth Account (optional fallback)
  try {
    const userRecord = await auth.getUserByEmail(email);
    uid = userRecord.uid;
    console.log(`User ${email} already exists in Firebase Auth. UID: ${uid}`);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      try {
        const newUser = await auth.createUser({
          email: email,
          password: password,
          displayName: 'Admin Puskom',
          emailVerified: true
        });
        uid = newUser.uid;
        console.log(`Successfully created new user account in Firebase Auth. UID: ${uid}`);
      } catch (authErr) {
        console.warn('\n[Pemberitahuan] Tidak dapat mendaftarkan akun di Authentication secara otomatis:');
        console.warn(authErr.message);
        console.warn('-> Akun harus dibuat manual di tab Authentication Firebase Console.');
        console.warn('-> Data Firestore akan tetap disuntikkan menggunakan ID: admin-puskom-default-uid\n');
      }
    } else {
      console.warn('Auth check skipped due to permission restrictions.');
    }
  }

  // 2. Write User Document Profile in Firestore (RBAC: role = admin)
  await db.collection('users').doc(uid).set({
    name: 'Admin Puskom',
    email: email,
    role: 'admin',
    allowedRooms: [] // Admin gets access to all rooms automatically
  }, { merge: true });
  console.log(`Firestore profile created for user document ID: ${uid}`);

  // 3. Create Location Hierarchy: Gedung FTI -> Lantai 1 -> Lab 1A
  const buildingId = 'gedung-fti';
  const roomId = 'lab-1a';
  
  await db.collection('locations').doc(buildingId).set({
    name: 'Gedung FTI'
  });
  console.log(`Building Gedung FTI registered.`);

  await db.collection('locations').doc(buildingId).collection('rooms').doc(roomId).set({
    name: 'Lab 1A - Smart Classroom',
    floorId: 'Lantai 1'
  });
  console.log(`Room Lab 1A registered under Gedung FTI.`);

  // 4. Register BARDI 3-Gang Switch Device ID
  const deviceId = 'a31c32702df451a2d9lscb';
  await db.collection('devices').doc(deviceId).set({
    name: 'BARDI Wall Switch 3 Gang',
    tuyaDeviceId: deviceId,
    roomId: roomId,
    type: 'switch',
    status: {
      state1: false,
      state2: false,
      state3: false
    }
  }, { merge: true });
  console.log(`BARDI 3-Gang Device registered and mapped to Room Lab 1A.`);

  // 5. Add initial log
  await db.collection('logs').add({
    userId: uid,
    userName: 'Sistem',
    action: 'Inisialisasi server IoT Kampus berhasil dilakukan',
    timestamp: FieldValue.serverTimestamp()
  });
  console.log(`Initial audit logs successfully created.`);

  console.log('\n--- PROSES SEED SELESAI ---');
  console.log('Semua data Gedung, Ruang, dan Device Bardi sudah masuk ke Firestore.');
  console.log('PENTING:');
  console.log('1. Buka Firebase Console -> Authentication dan tambahkan user:');
  console.log(`   Email: ${email} | Password: ${password}`);
  console.log('2. Salin UID-nya, lalu ganti ID dokumen di Firestore "users/admin-puskom-default-uid" dengan UID asli tersebut agar sinkron.');
  process.exit(0);
}

runInjection().catch(err => {
  console.error('Injection failed:', err);
  process.exit(1);
});
