import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

// POST: Create or Update User in Firebase Auth only, return uid for client Firestore write
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { uid, email, password, name, role } = body;

    if (!email || !name) {
      return NextResponse.json({ success: false, message: 'Email and Name are required.' }, { status: 400 });
    }

    let targetUid = uid;
    let isNewUser = false;

    if (!uid || uid.startsWith('user-')) {
      try {
        const existingRecord = await adminAuth.getUserByEmail(email);
        targetUid = existingRecord.uid;
        
        if (password) {
          await adminAuth.updateUser(targetUid, { password });
        }
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          const newRecord = await adminAuth.createUser({
            email,
            password: password || '123456',
            displayName: name,
          });
          targetUid = newRecord.uid;
          isNewUser = true;
        } else {
          throw err;
        }
      }
    } else {
      const updateData: any = { displayName: name, email };
      if (password) {
        updateData.password = password;
      }
      await adminAuth.updateUser(uid, updateData);
    }

    return NextResponse.json({
      success: true,
      message: isNewUser 
        ? `Akun baru ${name} berhasil dibuat dengan password default.` 
        : `Akun ${name} berhasil diperbarui.`,
      uid: targetUid
    });

  } catch (error: any) {
    console.error('Error managing user auth:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// DELETE: Remove User from both Firebase Auth and Firestore
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');

    if (!uid) {
      return NextResponse.json({ success: false, message: 'UID is required.' }, { status: 400 });
    }

    // 1. Delete from Firebase Authentication
    // (ignore if it's a mock local ID starting with 'user-')
    if (!uid.startsWith('user-')) {
      try {
        await adminAuth.deleteUser(uid);
      } catch (authErr: any) {
        // If not found in Auth, we still want to clean up
        console.warn(`User not found in Firebase Auth: ${uid}, proceeding to client cleanup.`);
      }
    }

    return NextResponse.json({ success: true, message: 'Autentikasi User berhasil dihapus.' });

  } catch (error: any) {
    console.error('Error deleting user auth:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
