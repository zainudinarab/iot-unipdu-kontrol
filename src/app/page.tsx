'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';

export default function HomeRedirect() {
  const router = useRouter();
  const [noAccess, setNoAccess] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }
      setUserEmail(user.email || '');

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const profile = userDoc.exists() ? userDoc.data() : { role: 'user', allowedRooms: [] };

        const bSnap = await getDocs(collection(db, 'locations'));
        
        // Admin: redirect to first building directly without room check
        if (profile.role === 'admin') {
          if (bSnap.docs.length > 0) {
            router.replace(`/building/${bSnap.docs[0].id}`);
          } else {
            router.replace('/admin?tab=lokasi');
          }
          return;
        }

        // Non-admin: check room access
        let firstBuildingId = '';
        for (const bDoc of bSnap.docs) {
          const roomsSnap = await getDocs(collection(db, `locations/${bDoc.id}/rooms`));
          let hasAccess = false;
          roomsSnap.forEach((rDoc) => {
            if (profile.allowedRooms && profile.allowedRooms.includes(rDoc.id)) {
              hasAccess = true;
            }
          });
          if (hasAccess) {
            firstBuildingId = bDoc.id;
            break;
          }
        }

        if (firstBuildingId) {
          router.replace(`/building/${firstBuildingId}`);
        } else {
          setNoAccess(true);
        }
      } catch (err) {
        console.error('Error redirecting to first building:', err);
        setNoAccess(true);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  if (noAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-200/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-200/20 blur-[120px] rounded-full"></div>

        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 shadow-xl shadow-slate-100 relative z-10 text-center space-y-6">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 items-center justify-center text-rose-500 text-2xl font-black">
            ✕
          </div>
          
          <div className="space-y-2">
            <h1 className="text-lg font-black tracking-wider uppercase text-slate-800">
              AKSES DITANGGUHKAN
            </h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
              Belum Ada Hak Akses Ruangan
            </p>
          </div>

          <div className="bg-slate-50 p-4 border border-slate-150 rounded-xl text-left space-y-2">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Akun Anda:</div>
            <div className="font-mono text-xs text-slate-700 font-bold break-all">{userEmail}</div>
            <div className="text-[10px] text-slate-500 leading-relaxed pt-1.5 border-t border-slate-100">
              Hubungi administrator kampus untuk memetakan hak akses gedung dan ruangan Anda di panel manajemen RBAC.
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs uppercase tracking-wider rounded-xl border border-rose-100 active:scale-[0.98] transition-all"
          >
            KELUAR & LOGIN LAIN
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans text-slate-800">
      <span className="loading loading-spinner text-indigo-650"></span>
      <p className="text-slate-455 text-xs mt-2 tracking-widest uppercase font-semibold">Menghubungkan sensor...</p>
    </div>
  );
}
