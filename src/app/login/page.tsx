'use client';

import React, { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, setDoc, addDoc, collection } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [initLoading, setInitLoading] = useState(false);
  const router = useRouter();

  // If already logged in, redirect to dashboard automatically
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/');
      } else {
        setCheckingAuth(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email dan kata sandi wajib diisi');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Email atau kata sandi tidak valid.');
      } else {
        setError('Gagal masuk. Periksa koneksi atau kredensial Firebase Anda.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Seeding/Initialization database from Client SDK
  const handleSystemInitialize = async () => {
    setInitLoading(true);
    setError('');
    setSuccess('');
    
    const adminEmail = 'admin@unipdu.ac.id';
    const adminPassword = 'admin123';

    try {
      console.log('Initializing user...');
      let uid = '';
      
      // 1. Create User in Auth
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
        uid = userCredential.user.uid;
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          const userCredential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
          uid = userCredential.user.uid;
        } else {
          throw authErr;
        }
      }

      // 2. Write admin role profile in Firestore
      await setDoc(doc(db, 'users', uid), {
        name: 'Admin Puskom',
        email: adminEmail,
        role: 'admin',
        allowedRooms: []
      }, { merge: true });

      // 3. Create Locations (Gedung FTI -> Lantai 1 -> Lab 1A)
      const buildingId = 'gedung-fti';
      const roomId = 'lab-1a';

      await setDoc(doc(db, 'locations', buildingId), {
        name: 'Gedung FTI'
      });

      await setDoc(doc(db, `locations/${buildingId}/rooms`, roomId), {
        name: 'Lab 1A - Smart Classroom',
        floorId: 'Lantai 1'
      });

      // 4. Register BARDI 3-Gang Switch Device
      const deviceId = 'a31c32702df451a2d9lscb';
      await setDoc(doc(db, 'devices', deviceId), {
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

      // 5. Add initial audit log
      await addDoc(collection(db, 'logs'), {
        userId: uid,
        userName: 'Sistem (Client)',
        action: 'Inisialisasi database kampus via browser berhasil',
        timestamp: new Date()
      });

      setSuccess('Inisialisasi database BERHASIL! Silakan masuk menggunakan form di bawah.');
      setEmail(adminEmail);
      setPassword(adminPassword);
    } catch (err: any) {
      console.error(err);
      setError(`Gagal melakukan inisialisasi: ${err.message || 'Periksa apakah konfigurasi Firebase API Key di .env.local sudah benar dan Rules Firestore diaktifkan.'}`);
    } finally {
      setInitLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-mono text-slate-800">
        <span className="loading loading-spinner text-indigo-600 loading-md"></span>
        <p className="text-slate-500 text-[10px] mt-2 tracking-widest uppercase">Mengecek Sesi Keamanan...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex font-sans relative overflow-hidden">
      
      {/* Soft Pastel Background Blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-indigo-100/50 blur-[130px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-violet-100/40 blur-[130px] rounded-full pointer-events-none"></div>

      {/* LEFT COLUMN: Clean Light Info Panel (hidden on small screens) */}
      <div className="hidden lg:flex lg:w-7/12 p-16 flex-col justify-between relative overflow-hidden select-none border-r border-slate-200/80 bg-white/40 backdrop-blur-md">
        
        {/* Branding Header */}
        <div className="flex items-center space-x-3 z-10">
          <div className="inline-flex w-10 h-10 rounded-xl bg-indigo-650 text-white items-center justify-center font-black text-sm shadow-md shadow-indigo-150">
            UP
          </div>
          <div>
            <h2 className="text-xs font-black tracking-widest text-slate-800 uppercase">UNIPDU</h2>
            <p className="text-[8px] font-black text-slate-400 tracking-widest uppercase">Smart IoT Gateway</p>
          </div>
        </div>

        {/* Content Showcase */}
        <div className="max-w-md my-auto space-y-7 z-10">
          <div className="space-y-3">
            <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 inline-block">
              🚀 Smart Campus System v2.0
            </span>
            <h1 className="text-3xl font-light text-slate-800 leading-tight tracking-wide uppercase">
              Kendali Penuh <br />
              <span className="font-black bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-750 bg-clip-text text-transparent">
                IoT Ruangan Kampus
              </span>
            </h1>
            <p className="text-xs text-slate-650 leading-relaxed font-semibold">
              Integrasi cerdas untuk mengontrol lampu, pendingin ruangan (AC), proyektor, dan televisi di seluruh gedung Unipdu secara instan, aman, dan real-time.
            </p>
          </div>

          {/* Clean Glassmorphic Grid Cards */}
          <div className="grid grid-cols-2 gap-3.5 pt-2">
            <div className="p-4 bg-white/60 border border-slate-200/60 rounded-2xl shadow-xs space-y-2 hover:border-indigo-300 hover:bg-white/80 transition-all duration-300">
              <span className="text-indigo-600 text-lg">⚡</span>
              <h3 className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Kendali Instan</h3>
              <p className="text-[9px] text-slate-500 font-medium leading-relaxed">Operasikan saklar gang lampu dan remote AC secara real-time tanpa delay.</p>
            </div>
            
            <div className="p-4 bg-white/60 border border-slate-200/60 rounded-2xl shadow-xs space-y-2 hover:border-indigo-300 hover:bg-white/80 transition-all duration-300">
              <span className="text-indigo-600 text-lg">🛡️</span>
              <h3 className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Akses Terenkripsi</h3>
              <p className="text-[9px] text-slate-500 font-medium leading-relaxed">Manajemen RBAC ketat memastikan user hanya mengakses ruangannya.</p>
            </div>

            <div className="p-4 bg-white/60 border border-slate-200/60 rounded-2xl shadow-xs space-y-2 hover:border-indigo-300 hover:bg-white/80 transition-all duration-300">
              <span className="text-indigo-600 text-lg">📊</span>
              <h3 className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Audit Log Transparan</h3>
              <p className="text-[9px] text-slate-500 font-medium leading-relaxed">Setiap aktivitas operasional terekam lengkap demi keamanan kampus.</p>
            </div>

            <div className="p-4 bg-white/60 border border-slate-200/60 rounded-2xl shadow-xs space-y-2 hover:border-indigo-300 hover:bg-white/80 transition-all duration-300">
              <span className="text-indigo-600 text-lg">🗺️</span>
              <h3 className="text-[10px] font-black uppercase text-slate-700 tracking-wider">GPS & Peta Presisi</h3>
              <p className="text-[9px] text-slate-500 font-medium leading-relaxed">Informasi gedung lengkap dengan tautan koordinat navigasi akurat.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest z-10">
          © {new Date().getFullYear()} Universitas Pesantren Tinggi Darul 'Ulum Jombang
        </div>
      </div>

      {/* RIGHT COLUMN: Modern Clean Form Panel */}
      <div className="w-full lg:w-5/12 flex items-center justify-center p-8 bg-slate-50 relative">
        <div className="w-full max-w-sm space-y-8 z-10">
          
          {/* Header Branding */}
          <div className="space-y-2.5">
            <div className="inline-flex lg:hidden w-10 h-10 rounded-xl bg-indigo-600 items-center justify-center font-black text-sm text-white shadow-md shadow-indigo-150 mb-2">
              UP
            </div>
            <h1 className="text-2xl font-black tracking-wide text-slate-800 uppercase">
              Selamat Datang
            </h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              Masukkan alamat email kampus dan sandi untuk mengelola panel IoT.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 py-3 px-4 rounded-xl text-xs font-semibold text-center tracking-wide">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-600 py-3 px-4 rounded-xl text-xs font-semibold text-center tracking-wide">
                {success}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-500 tracking-wider uppercase block">
                Alamat Email Kampus
              </label>
              <input
                type="email"
                placeholder="nama@unipdu.ac.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 focus:bg-white focus:border-indigo-650 focus:ring-1 focus:ring-indigo-100 rounded-xl text-sm outline-none text-slate-800 placeholder-slate-400 transition-all font-mono"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-500 tracking-wider uppercase block">
                Kata Sandi (Password)
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 focus:bg-white focus:border-indigo-650 focus:ring-1 focus:ring-indigo-100 rounded-xl text-sm outline-none text-slate-800 placeholder-slate-400 transition-all font-mono"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-650 hover:to-indigo-750 text-white font-bold text-xs uppercase tracking-wider rounded-xl active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-indigo-150/40"
            >
              {loading ? 'MEMVERIFIKASI...' : 'MASUK KE DASHBOARD'}
            </button>
          </form>

          {/* Footer Brand for Small Screens */}
          <div className="block lg:hidden text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest pt-8 border-t border-slate-200">
            © {new Date().getFullYear()} Universitas Pesantren Tinggi Darul 'Ulum Jombang
          </div>

        </div>
      </div>

    </div>
  );
}
