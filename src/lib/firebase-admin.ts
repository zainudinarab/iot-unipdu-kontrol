import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

if (getApps().length === 0) {
  try {
    const keyPath = path.join(process.cwd(), 'iot-unipdu-firebase-adminsdk-fbsvc-328a990e64.json');
    if (fs.existsSync(keyPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      initializeApp({
        credential: cert(serviceAccount)
      });
      console.log('Firebase Admin SDK initialized successfully with JSON key (Modular).');
    } else {
      initializeApp();
      console.log('Firebase Admin SDK initialized with Application Default Credentials (Modular).');
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();
