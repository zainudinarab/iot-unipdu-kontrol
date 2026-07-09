'use client';

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

interface Building {
  id: string;
  name: string;
  coordinates?: string;
}

interface AuditLog {
  id: string;
  userName: string;
  action: string;
  timestamp: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [time, setTime] = useState('');
  
  const router = useRouter();
  const pathname = usePathname();

  // Real-time Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleDateString('id-ID', {
          weekday: 'long',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }) + ` | ` + now.toLocaleTimeString('id-ID')
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auth and profile checking
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push('/login');
        return;
      }
      setUser(currentUser);
      
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const profileData = userDoc.data();
          setUserProfile(profileData);
          await fetchBuildings(profileData);
        } else {
          const fallback = { name: currentUser.email?.split('@')[0], role: 'user', allowedRooms: [] };
          setUserProfile(fallback);
          await fetchBuildings(fallback);
        }
      } catch (err) {
        console.error('Error in authentication check:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Real-time audit logs ticker feed
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(5));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsList: AuditLog[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const date = data.timestamp?.toDate() as Date;
        logsList.push({
          id: doc.id,
          userName: data.userName || 'System',
          action: data.action || '',
          timestamp: date ? date.toLocaleTimeString('id-ID') : ''
        });
      });
      setLogs(logsList);
    });
    return () => unsubscribe();
  }, [user]);

  const fetchBuildings = async (profile: any) => {
    try {
      const bSnap = await getDocs(collection(db, 'locations'));
      const buildingList: Building[] = [];

      for (const bDoc of bSnap.docs) {
        const roomsSnap = await getDocs(collection(db, `locations/${bDoc.id}/rooms`));
        let hasAccess = false;

        roomsSnap.forEach((rDoc) => {
          const isAllowed = profile.role === 'admin' || (profile.allowedRooms && profile.allowedRooms.includes(rDoc.id));
          if (isAllowed) {
            hasAccess = true;
          }
        });

        if (hasAccess) {
          buildingList.push({ id: bDoc.id, name: bDoc.data().name });
        }
      }
      setBuildings(buildingList);
    } catch (err) {
      console.error('Error fetching layout buildings:', err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans text-slate-800">
        <span className="loading loading-spinner text-indigo-600"></span>
        <p className="text-slate-400 text-xs mt-2 tracking-widest uppercase font-semibold">Memuat Sistem...</p>
      </div>
    );
  }

  // Find active building from URL pathname
  const activeBuildingId = pathname.startsWith('/building/') ? pathname.split('/')[2] : '';
  const isAdminPage = pathname === '/admin';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex font-sans relative">
      
      {/* 1. Sidebar (Desktop & Mobile View drawer) */}
      <aside className={`w-80 bg-white border-r border-slate-200 flex flex-col justify-between p-6 shrink-0 z-35 transition-transform duration-300 md:translate-x-0 ${
        isMobileSidebarOpen ? 'translate-x-0 fixed inset-y-0 left-0 shadow-2xl' : '-translate-x-full fixed inset-y-0 left-0 md:relative md:flex'
      }`}>
        <div className="space-y-8">
          
          {/* Logo Branding */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <Link href="/" className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-lg text-white shadow-md shadow-indigo-150">
                UP
              </div>
              <div>
                <h1 className="text-sm font-black tracking-wider uppercase bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  UNIPDU IOT
                </h1>
                <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">
                  Smart Room Control
                </p>
              </div>
            </Link>

            {/* Mobile close button */}
            <button 
              onClick={() => setIsMobileSidebarOpen(false)}
              className="md:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-400"
            >
              ✕
            </button>
          </div>

          {/* Navigation Links */}
          <div className="space-y-4">
            {isAdminPage ? (
              <>
                <div className="text-[10px] font-black text-rose-500 tracking-wider uppercase px-2">
                  PENGATURAN KONSOL
                </div>
                <div className="space-y-1">
                  <Link
                    href="/admin?tab=lokasi"
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all text-xs font-bold uppercase border ${
                      pathname === '/admin' && (new URLSearchParams(window.location.search).get('tab') || 'lokasi') === 'lokasi'
                        ? 'bg-rose-50 text-rose-600 border-rose-100'
                        : 'border-transparent hover:bg-slate-50 text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>🏫 Lokasi & Gedung</span>
                  </Link>
                  <Link
                    href="/admin?tab=perangkat"
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all text-xs font-bold uppercase border ${
                      pathname === '/admin' && new URLSearchParams(window.location.search).get('tab') === 'perangkat'
                        ? 'bg-rose-50 text-rose-600 border-rose-100'
                        : 'border-transparent hover:bg-slate-50 text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>🔌 Perangkat IoT</span>
                  </Link>
                  <Link
                    href="/admin?tab=users"
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all text-xs font-bold uppercase border ${
                      pathname === '/admin' && new URLSearchParams(window.location.search).get('tab') === 'users'
                        ? 'bg-rose-50 text-rose-600 border-rose-100'
                        : 'border-transparent hover:bg-slate-50 text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>🔑 Otorisasi User (RBAC)</span>
                  </Link>
                  <Link
                    href="/"
                    className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all text-xs font-bold uppercase border border-transparent hover:bg-slate-50 text-indigo-600 font-black mt-4 block border-t border-slate-100 pt-3"
                  >
                    <span>← Kembali ke Dashboard</span>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] font-black text-slate-400 tracking-wider uppercase px-2">
                  DAFTAR GEDUNG KAMPUS
                </div>
                
                {buildings.length === 0 ? (
                  <div className="text-[10px] text-slate-400 font-bold px-2 py-4 border border-dashed border-slate-200 rounded-xl uppercase text-center">
                    Belum Ada Gedung
                  </div>
                ) : (
                  <div className="space-y-1">
                    {buildings.map((b) => (
                      <Link
                        key={b.id}
                        href={`/building/${b.id}`}
                        onClick={() => setIsMobileSidebarOpen(false)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left text-xs font-bold uppercase border ${
                          activeBuildingId === b.id
                            ? 'bg-indigo-50/70 text-indigo-600 border-indigo-100 shadow-xs shadow-indigo-50/50'
                            : 'hover:bg-slate-50 text-slate-500 border-transparent'
                        }`}
                      >
                        <span>{b.name}</span>
                        <span className="text-[9px] font-mono opacity-65">Gedung {b.id}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-150">
          <div className="text-[9px] font-black text-slate-400 tracking-wider uppercase mb-1">
            AKUN AKTIF
          </div>
          <div className="text-xs font-bold text-slate-700 truncate">{userProfile?.name}</div>
          <div className="text-[9px] font-mono text-slate-400 truncate mb-3">{user?.email}</div>
          
          <div className="flex justify-between items-center text-[10px] pt-2.5 border-t border-slate-200">
            <span className="text-slate-400 font-semibold uppercase">Otoritas:</span>
            <span className={`px-2 py-0.5 rounded font-black uppercase text-[8px] tracking-wider ${
              userProfile?.role === 'admin' 
                ? 'bg-rose-50 text-rose-600 border border-rose-100'
                : 'bg-slate-200 text-slate-600'
            }`}>
              {userProfile?.role || 'user'}
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div 
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-xs z-30 md:hidden"
        ></div>
      )}

      {/* 2. Main Right Side Panel Area */}
      <div className="flex-grow flex flex-col min-h-screen min-w-0">
        
        {/* Top Header Row with dynamic Logs ticker */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0 gap-4">
          
          <div className="flex items-center space-x-3 min-w-0">
            {/* Mobile Menu Hamburger */}
            <button 
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-650 border border-slate-200 shrink-0"
            >
              ☰
            </button>

            {/* Audit Logs Ticker Stream (Hidden on mobile for responsive space) */}
            <div className="hidden sm:flex items-center space-x-3 overflow-hidden max-w-xs md:max-w-sm lg:max-w-xl">
              <span className="bg-indigo-50 border border-indigo-100 text-indigo-650 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0">
                LOGS
              </span>
              <div className="text-[10px] font-mono text-slate-500 truncate whitespace-nowrap">
                {logs.length > 0 ? (
                  <span>[{logs[0].timestamp}] <strong className="text-indigo-650">{logs[0].userName}</strong> {logs[0].action}</span>
                ) : (
                  <span className="text-slate-400 uppercase font-bold tracking-widest">Sinkronisasi log...</span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons (optimized for mobile size) */}
          <div className="flex items-center space-x-2 md:space-x-4 shrink-0">
            {userProfile?.role === 'admin' && !isAdminPage && (
              <Link 
                href="/admin"
                className="px-2.5 py-1.5 md:px-3.5 md:py-1.5 bg-rose-50 border border-rose-100 hover:bg-rose-100/50 text-rose-600 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all flex items-center space-x-1.5 shadow-xs"
              >
                <span>Console</span>
              </Link>
            )}

            {isAdminPage && (
              <Link 
                href="/"
                className="px-2.5 py-1.5 md:px-3.5 md:py-1.5 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100/50 text-indigo-600 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider transition-all flex items-center space-x-1.5 shadow-xs"
              >
                <span>← Dashboard</span>
              </Link>
            )}
            
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider hidden lg:inline">
              {time || 'Mengambil waktu...'}
            </span>

            <button 
              onClick={handleLogout}
              className="text-[10px] md:text-xs text-slate-450 hover:text-slate-650 font-black uppercase transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Dynamic page children rendering */}
        <section className="flex-grow p-4 md:p-8 space-y-8 overflow-y-auto">
          {children}
        </section>

        {/* Footer */}
        <footer className="h-14 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between px-6 md:px-8 text-[9px] md:text-[10px] text-slate-400 font-bold uppercase shrink-0 py-2 sm:py-0 text-center gap-1">
          <span>© 2026 Universitas Pesantren Tinggi Darul Ulum</span>
          <span>IoT Campus Hub v2.2.0</span>
        </footer>
      </div>

    </div>
  );
}
