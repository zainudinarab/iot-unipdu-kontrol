'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';

interface Room {
  id: string;
  name: string;
  floorId: string;
  buildingId: string;
}

interface Building {
  id: string;
  name: string;
  coordinates?: string;
}

interface Device {
  id: string;
  name: string;
  tuyaDeviceId: string;
  roomId: string;
  type: 'switch' | 'ir_remote';
  gangCount?: number;
  gang1Name?: string;
  gang2Name?: string;
  gang3Name?: string;
  gang4Name?: string;
  irDevices?: string[];
  acCount?: number;
  tvCount?: number;
  projectorCount?: number;
  isSequential?: boolean;
  sequentialDelay?: number;
  onOrder?: 'forward' | 'reverse';
  offOrder?: 'forward' | 'reverse';
}

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: string;
  allowedRooms: string[];
  allowedBuildings?: string[];
}

interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  isDanger: boolean;
  onConfirm: () => void | Promise<void>;
}

interface ToastState {
  isOpen: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

function AdminPageContent() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Active Tab: 'lokasi' | 'perangkat' | 'users'
  const activeTab = searchParams.get('tab') || 'lokasi';

  // Locations State
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  
  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Konfirmasi',
    isDanger: false,
    onConfirm: () => {}
  });

  // Custom Toast State
  const [toast, setToast] = useState<ToastState>({
    isOpen: false,
    message: '',
    type: 'success'
  });

  // Helper to show custom toast
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, isOpen: false }));
    }, 3000);
  };

  // Forms State
  const [newBuildingName, setNewBuildingName] = useState('');
  const [newBuildingCoordinates, setNewBuildingCoordinates] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedFloorLevel, setSelectedFloorLevel] = useState(1);

  // Edit States for Locations
  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomBuildingId, setEditingRoomBuildingId] = useState<string | null>(null);

  // Devices Form State
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newTuyaDeviceId, setNewTuyaDeviceId] = useState('');
  const [newDeviceType, setNewDeviceType] = useState<'switch' | 'ir_remote'>('switch');
  const [targetRoomId, setTargetRoomId] = useState('');
  const [newGangCount, setNewGangCount] = useState<number>(3);
  const [newGang1Name, setNewGang1Name] = useState('');
  const [newGang2Name, setNewGang2Name] = useState('');
  const [newGang3Name, setNewGang3Name] = useState('');
  const [newGang4Name, setNewGang4Name] = useState('');
  const [newIrDevices, setNewIrDevices] = useState<string[]>([]);
  const [newAcCount, setNewAcCount] = useState<number>(1);
  const [newTvCount, setNewTvCount] = useState<number>(1);
  const [newProjectorCount, setNewProjectorCount] = useState<number>(1);
  const [newIsSequential, setNewIsSequential] = useState<boolean>(false);
  const [newSequentialDelay, setNewSequentialDelay] = useState<number>(2);
  const [newOnOrder, setNewOnOrder] = useState<'forward' | 'reverse'>('forward');
  const [newOffOrder, setNewOffOrder] = useState<'forward' | 'reverse'>('forward');

  // Users State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin'>('user');
  const [selectedAllowedBuildings, setSelectedAllowedBuildings] = useState<string[]>([]);
  const [selectedAllowedRooms, setSelectedAllowedRooms] = useState<string[]>([]);

  const [seeding, setSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState('');

  const closeConfirmModal = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  const handleGenerateCampus = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Inisialisasi Kelas Kampus',
      message: 'Apakah Anda yakin ingin membuat struktur kampus otomatis? Ini akan membuat Gedung A, B, G, U masing-masing 3 lantai dengan 10 ruang kelas per lantai (total 120 ruangan).',
      confirmText: 'Ya, Buat Struktur',
      isDanger: false,
      onConfirm: async () => {
        closeConfirmModal();
        setSeeding(true);
        setSeedProgress('Memulai inisialisasi struktur kampus...');

        const campusData = {
          'A': { name: 'Gedung A (FIK)', coords: '-7.540112, 112.245100' },
          'B': { name: 'Gedung B (Santek)', coords: '-7.540212, 112.245200' },
          'G': { name: 'Gedung G (Graha)', coords: '-7.540312, 112.245300' },
          'U': { name: 'Gedung U (Kampus Utama)', coords: '-7.540412, 112.245400' }
        };

        try {
          for (const [code, info] of Object.entries(campusData)) {
            setSeedProgress(`Membuat data Gedung: ${info.name}...`);
            await setDoc(doc(db, 'locations', code), { 
              name: info.name,
              coordinates: info.coords
            });

            for (let floor = 1; floor <= 3; floor++) {
              setSeedProgress(`Membuat ${info.name} - Lantai ${floor}...`);
              for (let roomNum = 1; roomNum <= 10; roomNum++) {
                const roomCode = `${code}${floor}${roomNum.toString().padStart(2, '0')}`;
                await setDoc(doc(db, `locations/${code}/rooms`, roomCode), {
                  name: roomCode,
                  floorId: `Lantai ${floor}`
                });
              }
            }
          }
          setSeedProgress('');
          showToast('120 Ruang Kelas berhasil disuntikkan secara otomatis!', 'success');
          await loadAdminData();
        } catch (err: any) {
          console.error(err);
          showToast(`Gagal membuat struktur kelas: ${err.message}`, 'error');
        } finally {
          setSeeding(false);
        }
      }
    });
  };

  // Verify Role and Fetch initial data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push('/login');
        return;
      }

      setUser(currentUser);

      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists() && userDoc.data().role === 'admin') {
          setIsAdmin(true);
          await loadAdminData();
        } else {
          setIsAdmin(false);
          router.push('/');
        }
      } catch (err) {
        console.error('RBAC validation failed', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const loadAdminData = async () => {
    try {
      // 1. Fetch Buildings
      const buildingSnap = await getDocs(collection(db, 'locations'));
      const buildingList: Building[] = [];
      const roomList: Room[] = [];

      for (const bDoc of buildingSnap.docs) {
        buildingList.push({ 
          id: bDoc.id, 
          name: bDoc.data().name,
          coordinates: bDoc.data().coordinates || "" 
        });
        
        // Fetch Rooms in Building
        const roomSnap = await getDocs(collection(db, `locations/${bDoc.id}/rooms`));
        roomSnap.forEach((rDoc) => {
          roomList.push({
            id: rDoc.id,
            name: rDoc.data().name,
            floorId: rDoc.data().floorId || 'Lantai 1',
            buildingId: bDoc.id
          });
        });
      }
      setBuildings(buildingList);
      setRooms(roomList);
      if (buildingList.length > 0) setSelectedBuildingId(buildingList[0].id);
      if (roomList.length > 0) setTargetRoomId(roomList[0].id);

      // 2. Fetch Devices
      const devicesSnap = await getDocs(collection(db, 'devices'));
      const deviceList: Device[] = [];
      devicesSnap.forEach((dDoc) => {
        const data = dDoc.data();
        deviceList.push({
          id: dDoc.id,
          name: data.name || '',
          tuyaDeviceId: data.tuyaDeviceId || dDoc.id,
          roomId: data.roomId || '',
          type: data.type || 'switch',
          gangCount: data.gangCount || 3,
          gang1Name: data.gang1Name,
          gang2Name: data.gang2Name,
          gang3Name: data.gang3Name,
          gang4Name: data.gang4Name,
          irDevices: data.irDevices || [],
          acCount: data.acCount || 1,
          tvCount: data.tvCount || 1,
          projectorCount: data.projectorCount || 1,
          isSequential: !!data.isSequential,
          sequentialDelay: data.sequentialDelay || 2,
          onOrder: data.onOrder || 'forward',
          offOrder: data.offOrder || 'forward',
        });
      });
      setDevices(deviceList);

      // 3. Fetch Users
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList: UserProfile[] = [];
      usersSnap.forEach((doc) => {
        const data = doc.data();
        usersList.push({
          uid: doc.id,
          name: data.name || '',
          email: data.email || '',
          role: data.role || 'user',
          allowedRooms: data.allowedRooms || [],
          allowedBuildings: data.allowedBuildings || []
        });
      });
      setUsers(usersList);
    } catch (err) {
      console.error('Error loading admin settings', err);
    }
  };

  // Add Building Handler
  const handleAddBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBuildingName) return;
    try {
      const code = (editingBuildingId || newBuildingName).toUpperCase();
      await setDoc(doc(db, 'locations', code), {
        name: newBuildingName.startsWith('Gedung') ? newBuildingName : `Gedung ${newBuildingName}`,
        coordinates: newBuildingCoordinates || ""
      });
      showToast(editingBuildingId ? `Gedung ${editingBuildingId} berhasil diperbarui!` : `Gedung ${newBuildingName} berhasil ditambahkan!`, 'success');
      setNewBuildingName('');
      setNewBuildingCoordinates('');
      setEditingBuildingId(null);
      await loadAdminData();
    } catch (err: any) {
      console.error(err);
      showToast(`Gagal: ${err.message}`, 'error');
    }
  };

  // Load Building to Form for Editing
  const handleEditBuilding = (b: Building) => {
    setEditingBuildingId(b.id);
    setNewBuildingName(b.name.replace('Gedung ', ''));
    setNewBuildingCoordinates(b.coordinates || '');
  };

  // Delete Building Handler
  const handleDeleteBuilding = (buildingId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Gedung Kampus',
      message: `Apakah Anda yakin ingin menghapus Gedung ${buildingId}? PENTING: Semua sub-ruangan kelas di dalamnya juga harus dihapus secara manual agar database bersih.`,
      confirmText: 'Ya, Hapus Gedung',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'locations', buildingId));
          closeConfirmModal();
          showToast('Gedung berhasil dihapus!', 'success');
          await loadAdminData();
        } catch (err: any) {
          console.error(err);
          showToast(`Gagal menghapus: ${err.message}`, 'error');
        }
      }
    });
  };

  // Add Room Handler
  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName || !selectedBuildingId) return;
    try {
      const formattedRoomName = newRoomName.toUpperCase();
      
      // If we edited and changed key parameters, delete the old document to avoid duplication
      if (editingRoomId && (editingRoomId !== formattedRoomName || editingRoomBuildingId !== selectedBuildingId)) {
        await deleteDoc(doc(db, `locations/${editingRoomBuildingId}/rooms`, editingRoomId));
      }

      await setDoc(doc(db, `locations/${selectedBuildingId}/rooms`, formattedRoomName), {
        name: formattedRoomName,
        floorId: `Lantai ${selectedFloorLevel}`,
      });
      showToast(editingRoomId ? `Ruangan ${formattedRoomName} berhasil diperbarui!` : `Ruangan ${formattedRoomName} berhasil ditambahkan!`, 'success');
      setNewRoomName('');
      setEditingRoomId(null);
      setEditingRoomBuildingId(null);
      await loadAdminData();
    } catch (err: any) {
      console.error(err);
      showToast(`Gagal: ${err.message}`, 'error');
    }
  };

  // Load Room to Form for Editing
  const handleEditRoom = (r: Room) => {
    setEditingRoomId(r.id);
    setEditingRoomBuildingId(r.buildingId);
    setNewRoomName(r.name);
    setSelectedBuildingId(r.buildingId);
    const floorLvl = parseInt(r.floorId.replace('Lantai ', '')) || 1;
    setSelectedFloorLevel(floorLvl);
  };

  // Delete Room Handler
  const handleDeleteRoom = (buildingId: string, roomId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Ruangan Kelas',
      message: `Apakah Anda yakin ingin menghapus ruang kelas ${roomId} di Gedung ${buildingId}?`,
      confirmText: 'Ya, Hapus',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, `locations/${buildingId}/rooms`, roomId));
          closeConfirmModal();
          showToast('Ruangan berhasil dihapus!', 'success');
          await loadAdminData();
        } catch (err: any) {
          console.error(err);
          showToast(`Gagal menghapus: ${err.message}`, 'error');
        }
      }
    });
  };

  // Save/Update Device Handler
  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceName || !newTuyaDeviceId || !targetRoomId) return;
    try {
      const deviceData: any = {
        name: newDeviceName,
        tuyaDeviceId: newTuyaDeviceId,
        roomId: targetRoomId,
        type: newDeviceType,
        status: newDeviceType === 'switch' 
          ? { state1: false, state2: false, state3: false, state4: false }
          : { state: false, temp: 24, volume: 50, mode: 'cooling' }
      };

      if (newDeviceType === 'switch') {
        deviceData.gangCount = newGangCount;
        deviceData.gang1Name = newGang1Name || 'Tombol 1';
        if (newGangCount >= 2) deviceData.gang2Name = newGang2Name || 'Tombol 2';
        if (newGangCount >= 3) deviceData.gang3Name = newGang3Name || 'Tombol 3';
        if (newGangCount >= 4) deviceData.gang4Name = newGang4Name || 'Tombol 4';
        
        // Save sequential options
        deviceData.isSequential = newIsSequential;
        deviceData.sequentialDelay = newSequentialDelay;
        deviceData.onOrder = newOnOrder;
        deviceData.offOrder = newOffOrder;
      } else {
        deviceData.irDevices = newIrDevices;
        if (newIrDevices.includes('ac')) deviceData.acCount = newAcCount;
        if (newIrDevices.includes('tv')) deviceData.tvCount = newTvCount;
        if (newIrDevices.includes('projector')) deviceData.projectorCount = newProjectorCount;
      }

      await setDoc(doc(db, 'devices', newTuyaDeviceId), deviceData);
      
      if (editingDeviceId && editingDeviceId !== newTuyaDeviceId) {
        await deleteDoc(doc(db, 'devices', editingDeviceId));
      }

      showToast(editingDeviceId ? 'Perangkat berhasil diperbarui!' : 'Perangkat berhasil didaftarkan!', 'success');
      
      setEditingDeviceId(null);
      setNewDeviceName('');
      setNewTuyaDeviceId('');
      setNewGangCount(3);
      setNewGang1Name('');
      setNewGang2Name('');
      setNewGang3Name('');
      setNewGang4Name('');
      setNewIrDevices([]);
      setNewAcCount(1);
      setNewTvCount(1);
      setNewIsSequential(false);
      setNewSequentialDelay(2);
      setNewOnOrder('forward');
      setNewOffOrder('forward');
      setNewProjectorCount(1);
      
      await loadAdminData();
    } catch (err: any) {
      console.error(err);
      showToast(`Gagal: ${err.message}`, 'error');
    }
  };

  // Load Device to Form for Editing
  const handleEditDevice = (device: Device) => {
    setEditingDeviceId(device.id);
    setNewDeviceName(device.name);
    setNewTuyaDeviceId(device.tuyaDeviceId);
    setNewDeviceType(device.type);
    setTargetRoomId(device.roomId);
    setNewGangCount(device.gangCount || 3);
    setNewGang1Name(device.gang1Name || '');
    setNewGang2Name(device.gang2Name || '');
    setNewGang3Name(device.gang3Name || '');
    setNewGang4Name(device.gang4Name || '');
    setNewIrDevices(device.irDevices || []);
    setNewAcCount(device.acCount || 1);
    setNewTvCount(device.tvCount || 1);
    setNewProjectorCount(device.projectorCount || 1);
    setNewIsSequential(!!device.isSequential);
    setNewSequentialDelay(device.sequentialDelay || 2);
    setNewOnOrder(device.onOrder || 'forward');
    setNewOffOrder(device.offOrder || 'forward');
  };

  // Delete Device Handler
  const handleDeleteDevice = (deviceId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Perangkat IoT',
      message: 'Apakah Anda yakin ingin menghapus perangkat ini dari database?',
      confirmText: 'Ya, Hapus Perangkat',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'devices', deviceId));
          closeConfirmModal();
          showToast('Perangkat berhasil dihapus!', 'success');
          await loadAdminData();
        } catch (err: any) {
          console.error(err);
          showToast(`Gagal menghapus: ${err.message}`, 'error');
        }
      }
    });
  };

  // Add / Edit User Handler (via Admin Backend API for Auth, client for Firestore)
  const handleAddUserPlaceholder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail) return;
    
    // Check if email already exists in local list (excluding currently edited user)
    const emailExists = users.some(u => 
      u.email.toLowerCase() === newUserEmail.toLowerCase() && u.uid !== editingUserId
    );
    
    if (emailExists) {
      showToast('Gagal: Email ini sudah terdaftar di pengguna lain.', 'error');
      return;
    }
    
    try {
      // 1. Create/Update Firebase Auth credentials via server API
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: editingUserId,
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword || undefined,
          role: newUserRole,
        })
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = {};
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const rawText = await res.text();
        console.error('Non-JSON response received:', rawText);
        showToast(`Gagal: Server Error (${res.status}) - Coba lagi beberapa saat.`, 'error');
        return;
      }

      if (res.ok && data.success && data.uid) {
        // 2. Write user profile to Firestore from client-side
        await setDoc(doc(db, 'users', data.uid), {
          name: newUserName,
          email: newUserEmail,
          role: newUserRole,
          allowedRooms: newUserRole === 'admin' ? [] : selectedAllowedRooms,
          allowedBuildings: newUserRole === 'admin' ? [] : selectedAllowedBuildings,
        }, { merge: true });

        showToast(data.message, 'success');
        
        // Reset
        setNewUserName('');
        setNewUserEmail('');
        setNewUserPassword('');
        setEditingUserId(null);
        setSelectedAllowedBuildings([]);
        setSelectedAllowedRooms([]);
        await loadAdminData();
      } else {
        showToast(`Gagal: ${data.message || 'Error server'}`, 'error');
      }
    } catch (err: any) {
      console.error(err);
      showToast(`Gagal: ${err.message}`, 'error');
    }
  };

  // Load User to Form for Editing
  const handleEditUser = (u: UserProfile) => {
    setEditingUserId(u.uid);
    setNewUserName(u.name);
    setNewUserEmail(u.email);
    setNewUserPassword(''); // leave password blank on edit unless they want to change it
    setNewUserRole(u.role as any);
    setSelectedAllowedBuildings(u.allowedBuildings || []);
    setSelectedAllowedRooms(u.allowedRooms || []);
  };

  // Delete User Handler (via Admin Backend API for Auth, client for Firestore)
  const handleDeleteUser = (userUid: string) => {
    // Prevent self-deletion
    if (userUid === user?.uid) {
      showToast('Gagal: Anda tidak diperbolehkan menghapus akun Anda sendiri yang sedang aktif!', 'error');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Hapus Akun Pengguna',
      message: 'Apakah Anda yakin ingin menghapus user ini secara permanen dari Firebase Authentication dan Firestore?',
      confirmText: 'Ya, Hapus Akun',
      isDanger: true,
      onConfirm: async () => {
        try {
          // 1. Delete user from Firebase Auth via server API
          const res = await fetch(`/api/users?uid=${userUid}`, { method: 'DELETE' });
           
           const contentType = res.headers.get('content-type') || '';
           let data: any = {};
           if (contentType.includes('application/json')) {
             data = await res.json();
           } else {
             const rawText = await res.text();
             console.error('Non-JSON response received:', rawText);
             closeConfirmModal();
             showToast(`Gagal: Server Error (${res.status}) - Coba lagi beberapa saat.`, 'error');
             return;
           }
           
           if (res.ok && data.success) {
            // 2. Delete user profile document from Firestore using client SDK
            await deleteDoc(doc(db, 'users', userUid));
            
            closeConfirmModal();
            showToast('User berhasil dihapus!', 'success');
            await loadAdminData();
          } else {
            closeConfirmModal();
            showToast(`Gagal: ${data.message}`, 'error');
          }
        } catch (err: any) {
          closeConfirmModal();
          console.error(err);
          showToast(`Gagal menghapus: ${err.message}`, 'error');
        }
      }
    });
  };

  return (
    <DashboardLayout>
      {/* Intro & Seeder */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <h2 className="text-2xl font-black uppercase text-slate-800 tracking-tight">
            Pengaturan Server IoT Kampus
          </h2>
          <p className="text-xs text-slate-450 font-semibold uppercase tracking-wider">
            {activeTab === 'lokasi' && 'Kelola tata letak gedung dan ruangan kelas'}
            {activeTab === 'perangkat' && 'Daftarkan, kustomisasi tombol, dan edit perangkat IoT'}
            {activeTab === 'users' && 'Otorisasi hak akses kontrol user terhadap ruangan (RBAC)'}
          </p>
        </div>
        
        {activeTab === 'lokasi' && (
          <button
            onClick={handleGenerateCampus}
            disabled={seeding}
            className="px-5 py-3 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100/50 text-indigo-600 text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 disabled:opacity-50 shadow-sm shadow-indigo-50"
          >
            {seeding ? 'GENERATING...' : '[ GENERATE 120 CLASSROOMS ]'}
          </button>
        )}
      </div>

      {seeding && (
        <div className="bg-indigo-50 border border-indigo-100 text-indigo-655 p-4 rounded-xl text-xs font-mono flex items-center space-x-3 mt-4">
          <span className="loading loading-spinner text-indigo-600 loading-xs"></span>
          <span>{seedProgress}</span>
        </div>
      )}

      {/* Dynamic Tab Renderer based on activeTab query param */}
      <div className="space-y-8 mt-6">
        
        {/* TAB 1: KELOLA LOKASI */}
        {activeTab === 'lokasi' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Forms Column */}
            <div className="lg:col-span-1 space-y-6">
              {/* Add / Edit Building Form */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">
                  {editingBuildingId ? `EDIT GEDUNG (${editingBuildingId})` : 'TAMBAH GEDUNG BARU'}
                </h4>
                <form onSubmit={handleAddBuilding} className="space-y-3">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">
                      {editingBuildingId ? 'Nama Baru Gedung' : 'Kode Gedung (1 Huruf)'}
                    </label>
                    <input
                      type="text"
                      placeholder={editingBuildingId ? 'Nama Gedung Baru' : 'Contoh: U, A, B, G'}
                      maxLength={editingBuildingId ? 30 : 1}
                      value={newBuildingName}
                      onChange={(e) => setNewBuildingName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-55 border border-slate-250 focus:bg-white focus:border-indigo-500 rounded-xl text-xs outline-none text-slate-800 placeholder-slate-400 transition-all font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">
                      Titik Koordinat GPS (Opsional)
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: -7.543085, 112.245082"
                      value={newBuildingCoordinates}
                      onChange={(e) => setNewBuildingCoordinates(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-55 border border-slate-250 focus:bg-white focus:border-indigo-500 rounded-xl text-xs outline-none text-slate-800 placeholder-slate-400 transition-all font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    {editingBuildingId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBuildingId(null);
                          setNewBuildingName('');
                        }}
                        className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-650 uppercase transition-all"
                      >
                        Batal
                      </button>
                    )}
                    <button 
                      type="submit" 
                      className={`py-2.5 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-all ${
                        editingBuildingId ? 'w-2/3' : 'w-full'
                      }`}
                    >
                      {editingBuildingId ? 'Simpan' : 'Tambah Gedung'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Add / Edit Room Form */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">
                  {editingRoomId ? `EDIT RUANGAN (${editingRoomId})` : 'TAMBAH RUANGAN BARU'}
                </h4>
                <form onSubmit={handleAddRoom} className="space-y-3">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">Gedung Penempatan</label>
                    <select
                      value={selectedBuildingId}
                      onChange={(e) => setSelectedBuildingId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-55 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl text-xs text-slate-700 outline-none transition-all"
                    >
                      {buildings.map(b => (
                        <option key={b.id} value={b.id}>{b.name} ({b.id})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">Lantai</label>
                      <select
                        value={selectedFloorLevel}
                        onChange={(e) => setSelectedFloorLevel(Number(e.target.value))}
                        className="w-full px-3 py-2.5 bg-slate-55 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl text-xs text-slate-700 outline-none transition-all"
                      >
                        {[1, 2, 3, 4, 5].map(lvl => (
                          <option key={lvl} value={lvl}>Lantai {lvl}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">Nama/No Kelas</label>
                      <input
                        type="text"
                        placeholder="Contoh: U101"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-55 border border-slate-250 focus:bg-white focus:border-indigo-500 rounded-xl text-xs outline-none text-slate-800 placeholder-slate-400 transition-all font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {editingRoomId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRoomId(null);
                          setEditingRoomBuildingId(null);
                          setNewRoomName('');
                        }}
                        className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-650 uppercase transition-all"
                      >
                        Batal
                      </button>
                    )}
                    <button 
                      type="submit" 
                      className={`py-2.5 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-all ${
                        editingRoomId ? 'w-2/3' : 'w-full'
                      }`}
                    >
                      {editingRoomId ? 'Simpan' : 'Tambah Ruangan'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* List Column */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">DAFTAR GEDUNG & RUANGAN KAMPUS</h4>
                
                {buildings.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 font-bold uppercase text-[10px] border border-dashed border-slate-200 rounded-xl">
                    Belum Ada Data Lokasi
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                    {buildings.map((b) => {
                      const buildingRooms = rooms.filter(r => r.buildingId === b.id);
                      return (
                        <div key={b.id} className="p-4 border border-slate-150 rounded-xl space-y-3">
                          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-slate-800 uppercase">{b.name} (Gedung {b.id})</span>
                              {b.coordinates && (
                                <span className="text-[9px] text-slate-400 font-mono tracking-wider">📍 GPS: {b.coordinates}</span>
                              )}
                            </div>
                            <div className="flex items-center space-x-1.5">
                              <button
                                onClick={() => handleEditBuilding(b)}
                                className="text-[9px] font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-650 px-2.5 py-1 rounded-lg border border-indigo-100 uppercase"
                              >
                                Ubah
                              </button>
                              <button
                                onClick={() => handleDeleteBuilding(b.id)}
                                className="text-[9px] font-bold text-rose-500 hover:text-rose-700 bg-rose-55 px-2.5 py-1 rounded-lg border border-rose-100 uppercase"
                              >
                                Hapus Gedung
                              </button>
                            </div>
                          </div>

                          {buildingRooms.length === 0 ? (
                            <div className="text-[9px] text-slate-400 italic">Belum ada ruangan terdaftar di gedung ini.</div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                              {buildingRooms.map((r) => (
                                <div key={r.id} className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-55 border border-slate-200 rounded-lg text-[10px]">
                                  <span className="font-bold text-slate-700">{r.name}</span>
                                  <span className="text-slate-400 font-mono text-[9px]">({r.floorId})</span>
                                  <button
                                    onClick={() => handleEditRoom(r)}
                                    className="text-indigo-600 hover:text-indigo-850 font-bold ml-1.5"
                                    title="Ubah Ruangan"
                                  >
                                    ✎
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRoom(b.id, r.id)}
                                    className="text-rose-500 hover:text-rose-700 font-bold ml-1 font-sans"
                                    title="Hapus Kelas"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: KELOLA PERANGKAT */}
        {activeTab === 'perangkat' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Add / Edit Device Form */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">
                  {editingDeviceId ? 'EDIT PERANGKAT IoT' : 'DAFTAR PERANGKAT BARU'}
                </h4>
                
                <form onSubmit={handleAddDevice} className="space-y-4">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">Ruangan Penempatan</label>
                    <select
                      value={targetRoomId}
                      onChange={(e) => setTargetRoomId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-55 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl text-xs text-slate-700 outline-none transition-all"
                    >
                      {rooms.length === 0 ? (
                        <option value="">(Buat ruangan terlebih dahulu)</option>
                      ) : (
                        rooms.map(r => (
                          <option key={r.id} value={r.id}>{r.name} ({r.floorId})</option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">Tipe Perangkat</label>
                      <select
                        value={newDeviceType}
                        onChange={(e) => setNewDeviceType(e.target.value as any)}
                        className="w-full px-4 py-2.5 bg-slate-55 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl text-xs text-slate-700 outline-none transition-all"
                      >
                        <option value="switch">Bardi Smart Switch (Lampu)</option>
                        <option value="ir_remote">Smart IR Remote (AC / TV)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">Nama Perangkat Kustom</label>
                      <input
                        type="text"
                        placeholder="Contoh: Saklar Kelas Depan"
                        value={newDeviceName}
                        onChange={(e) => setNewDeviceName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-55 border border-slate-250 focus:bg-white focus:border-indigo-500 rounded-xl text-xs outline-none text-slate-800 placeholder-slate-400"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block mb-1">Tuya Device ID</label>
                    <input
                      type="text"
                      placeholder="a31c32702df451a2d9lscb"
                      value={newTuyaDeviceId}
                      onChange={(e) => setNewTuyaDeviceId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-55 border border-slate-250 focus:bg-white focus:border-indigo-500 rounded-xl text-xs outline-none text-slate-800 placeholder-slate-400 font-mono"
                      required
                    />
                  </div>

                  {newDeviceType === 'switch' && (
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block mb-1">Jumlah Tombol Saklar (Gang)</label>
                        <select
                          value={newGangCount}
                          onChange={(e) => setNewGangCount(Number(e.target.value))}
                          className="w-full px-4 py-2.5 bg-slate-55 border border-slate-200 rounded-xl text-xs text-slate-800"
                        >
                          <option value={1}>1 Gang (1 Tombol)</option>
                          <option value={2}>2 Gang (2 Tombol)</option>
                          <option value={3}>3 Gang (3 Tombol)</option>
                          <option value={4}>4 Gang (4 Tombol)</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block">Nama Tombol Kustom (Opsional)</label>
                        <div className="grid grid-cols-2 gap-2.5">
                          {newGangCount >= 1 && (
                            <div>
                              <span className="text-[8px] text-slate-400 font-black block mb-0.5">TOMBOL 1</span>
                              <input
                                type="text"
                                placeholder="Lampu Tengah"
                                value={newGang1Name}
                                onChange={(e) => setNewGang1Name(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-lg text-[9px] outline-none text-slate-800"
                              />
                            </div>
                          )}
                          {newGangCount >= 2 && (
                            <div>
                              <span className="text-[8px] text-slate-400 font-black block mb-0.5">TOMBOL 2</span>
                              <input
                                type="text"
                                placeholder="Lampu Utama"
                                value={newGang2Name}
                                onChange={(e) => setNewGang2Name(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-lg text-[9px] outline-none text-slate-800"
                              />
                            </div>
                          )}
                          {newGangCount >= 3 && (
                            <div>
                              <span className="text-[8px] text-slate-400 font-black block mb-0.5">TOMBOL 3</span>
                              <input
                                type="text"
                                placeholder="Lampu Depan"
                                value={newGang3Name}
                                onChange={(e) => setNewGang3Name(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-lg text-[9px] outline-none text-slate-800"
                              />
                            </div>
                          )}
                          {newGangCount >= 4 && (
                            <div>
                              <span className="text-[8px] text-slate-400 font-black block mb-0.5">TOMBOL 4</span>
                              <input
                                type="text"
                                placeholder="Lampu Luar"
                                value={newGang4Name}
                                onChange={(e) => setNewGang4Name(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-lg text-[9px] outline-none text-slate-800"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Sequential Switch Mode Options */}
                      <div className="pt-3 border-t border-slate-100 space-y-3">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="isSequential"
                            checked={newIsSequential}
                            onChange={(e) => setNewIsSequential(e.target.checked)}
                            className="rounded text-indigo-650 focus:ring-indigo-500 border-slate-300 w-3.5 h-3.5"
                          />
                          <label htmlFor="isSequential" className="text-[10px] font-bold text-slate-600 uppercase tracking-wide cursor-pointer select-none">
                            Aktifkan Mode Sekuensial (Delay)
                          </label>
                        </div>

                        {newIsSequential && (
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                            <div>
                              <label className="text-[8px] text-slate-500 font-black uppercase tracking-wider block mb-1">Jeda Waktu Antar Saklar</label>
                              <select
                                value={newSequentialDelay}
                                onChange={(e) => setNewSequentialDelay(Number(e.target.value))}
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] text-slate-800"
                              >
                                <option value={1}>1 Detik</option>
                                <option value={2}>2 Detik</option>
                                <option value={3}>3 Detik</option>
                                <option value={5}>5 Detik</option>
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[8px] text-slate-500 font-black uppercase tracking-wider block mb-1">Arah Nyala (ON)</label>
                                <select
                                  value={newOnOrder}
                                  onChange={(e) => setNewOnOrder(e.target.value as any)}
                                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] text-slate-800 font-semibold"
                                >
                                  <option value="forward">Maju (1 ➔ 4)</option>
                                  <option value="reverse">Mundur (4 ➔ 1)</option>
                                </select>
                              </div>

                              <div>
                                <label className="text-[8px] text-slate-500 font-black uppercase tracking-wider block mb-1">Arah Mati (OFF)</label>
                                <select
                                  value={newOffOrder}
                                  onChange={(e) => setNewOffOrder(e.target.value as any)}
                                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] text-slate-800 font-semibold"
                                >
                                  <option value="forward">Maju (1 ➔ 4)</option>
                                  <option value="reverse">Mundur (4 ➔ 1)</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {newDeviceType === 'ir_remote' && (
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      <label className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block">Alat Yang Dikontrol IR Remote</label>
                      <div className="space-y-3 bg-slate-50 p-3 border border-slate-150 rounded-xl">
                        {[
                          { id: 'ac', label: 'Air Conditioner (AC)', count: newAcCount, setCount: setNewAcCount },
                          { id: 'tv', label: 'Televisi (TV)', count: newTvCount, setCount: setNewTvCount },
                          { id: 'projector', label: 'Proyektor Kelas', count: newProjectorCount, setCount: setNewProjectorCount }
                        ].map((item) => {
                          const isChecked = newIrDevices.includes(item.id);
                          return (
                            <div key={item.id} className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="flex items-center space-x-2.5 text-xs text-slate-700 cursor-pointer hover:text-slate-900 transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setNewIrDevices(prev => [...prev, item.id]);
                                      } else {
                                        setNewIrDevices(prev => prev.filter(id => id !== item.id));
                                      }
                                    }}
                                    className="w-3.5 h-3.5 accent-indigo-600 rounded focus:ring-0"
                                  />
                                  <span className="font-semibold">{item.label}</span>
                                </label>
                                {isChecked && (
                                  <div className="flex items-center space-x-1.5">
                                    <span className="text-[8px] text-slate-400 font-bold uppercase">Jumlah:</span>
                                    <select
                                      value={item.count}
                                      onChange={(e) => item.setCount(Number(e.target.value))}
                                      className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-bold text-slate-700 outline-none focus:border-indigo-500"
                                    >
                                      {[1, 2, 3, 4].map(n => (
                                        <option key={n} value={n}>{n} Unit</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {editingDeviceId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDeviceId(null);
                          setNewDeviceName('');
                          setNewTuyaDeviceId('');
                          setNewGang1Name('');
                          setNewGang2Name('');
                          setNewGang3Name('');
                        }}
                        className="w-1/3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-650 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                      >
                        Batal
                      </button>
                    )}
                    <button 
                      type="submit" 
                      className={`py-3 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all ${
                        editingDeviceId ? 'w-2/3' : 'w-full'
                      }`}
                    >
                      {editingDeviceId ? 'Simpan' : 'Daftarkan'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* List Column */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">DAFTAR PERANGKAT YANG TERDAFTAR</h4>
                
                {devices.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 font-bold uppercase text-[10px] border border-dashed border-slate-200 rounded-xl">
                    Belum Ada Perangkat Terdaftar
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse bg-white text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-bold text-[9px] uppercase border-b border-slate-200">
                          <th className="p-3.5">Nama Perangkat & Tipe</th>
                          <th className="p-3.5">Ruangan</th>
                          <th className="p-3.5">Tuya Device ID</th>
                          <th className="p-3.5">Tombol Saklar</th>
                          <th className="p-3.5 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {devices.map((device) => {
                          const room = rooms.find(r => r.id === device.roomId);
                          return (
                            <tr key={device.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="p-3.5">
                                <div className="font-bold text-slate-800">{device.name}</div>
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider mt-1 ${
                                  device.type === 'switch' ? 'bg-cyan-50 text-cyan-600' : 'bg-indigo-50 text-indigo-600'
                                }`}>
                                  {device.type === 'switch' ? `BARDI Switch (${device.gangCount || 3} Gang)` : `Smart IR Remote (${(device.irDevices || []).length} Alat)`}
                                </span>
                              </td>
                              <td className="p-3.5 font-semibold text-slate-700">
                                {room ? `${room.name} (${room.floorId})` : 'Tidak Ditemukan'}
                              </td>
                              <td className="p-3.5 font-mono text-[10px] text-slate-500">
                                {device.tuyaDeviceId}
                              </td>
                              <td className="p-3.5 text-[9px]">
                                {device.type === 'switch' ? (
                                  <div className="space-y-0.5 font-mono text-slate-500">
                                    <div>1: {device.gang1Name || 'Tombol 1'}</div>
                                    {(device.gangCount || 3) >= 2 && <div>2: {device.gang2Name || 'Tombol 2'}</div>}
                                    {(device.gangCount || 3) >= 3 && <div>3: {device.gang3Name || 'Tombol 3'}</div>}
                                    {(device.gangCount || 3) >= 4 && <div>4: {device.gang4Name || 'Tombol 4'}</div>}
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {(!device.irDevices || device.irDevices.length === 0) ? (
                                      <span className="text-slate-400 italic">Belum ada alat IR</span>
                                    ) : (
                                      device.irDevices.map(id => {
                                        const count = id === 'ac' ? (device.acCount || 1) : id === 'tv' ? (device.tvCount || 1) : (device.projectorCount || 1);
                                        const label = id === 'ac' ? 'AC' : id === 'tv' ? 'TV' : 'Proyektor';
                                        return (
                                          <span key={id} className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-[9px] uppercase font-bold text-indigo-650">
                                            {label}{count > 1 ? ` ×${count}` : ''}
                                          </span>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="p-3.5 text-center space-x-1.5 whitespace-nowrap">
                                <button
                                  onClick={() => handleEditDevice(device)}
                                  className="text-[9px] font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-650 px-2 py-1 rounded border border-indigo-100 uppercase"
                                >
                                  Ubah
                                </button>
                                <button
                                  onClick={() => handleDeleteDevice(device.id)}
                                  className="text-[9px] font-black bg-rose-50 hover:bg-rose-100 text-rose-600 px-2 py-1 rounded border border-rose-100 uppercase"
                                >
                                  Hapus
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: OTORISASI USER */}
        {activeTab === 'users' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Create / Edit User Profile & Permissions Form */}
              <div className="lg:col-span-1 space-y-4">
                <div className="text-[10px] font-black text-indigo-600 tracking-wider uppercase border-b border-slate-100 pb-2">
                  {editingUserId ? 'EDIT PROFIL & IZIN AKSES' : 'REGISTRASI PENGGUNA BARU'}
                </div>
                <form onSubmit={handleAddUserPlaceholder} className="space-y-4">
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block mb-1">Nama Lengkap</label>
                    <input
                      type="text"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 outline-none text-slate-800 placeholder-slate-400"
                      placeholder="Zainudin Arab"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block mb-1">Email Kampus</label>
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 outline-none text-slate-800 placeholder-slate-400"
                      placeholder="zainudin@unipdu.ac.id"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block mb-1">
                      Password Akun {editingUserId && '(Opsional)'}
                    </label>
                    <input
                      type="text"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 outline-none text-slate-800 placeholder-slate-400 font-mono"
                      placeholder={editingUserId ? 'Kosongkan jika tidak ingin diubah' : 'Min. 6 karakter (Default: 123456)'}
                      required={!editingUserId}
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block mb-1">Role Akun</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as any)}
                      className="w-full px-4 py-2.5 bg-slate-55 border border-slate-200 rounded-xl text-xs text-slate-800"
                    >
                      <option value="user">User (Terbatas sesuai Gedung & Kelas)</option>
                      <option value="admin">Admin (Akses Penuh Kampus)</option>
                    </select>
                  </div>

                  {/* Grouped Access Rights Selection (Only for 'user' role) */}
                  {newUserRole === 'user' && (
                    <div className="space-y-4 pt-3 border-t border-slate-100 max-h-[320px] overflow-y-auto pr-1">
                      <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase block">HAK AKSES GEDUNG & RUANGAN</span>
                      
                      {buildings.length === 0 ? (
                        <span className="text-[10px] text-slate-400 italic">Belum ada gedung terdaftar</span>
                      ) : (
                        buildings.map((b) => {
                          const buildingRooms = rooms.filter(r => r.buildingId === b.id);
                          const isBuildingChecked = selectedAllowedBuildings.includes(b.id);
                          
                          return (
                            <div key={b.id} className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-2">
                              <div className="flex justify-between items-center w-full">
                                <label className="flex items-center space-x-2 font-bold text-xs text-slate-750 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isBuildingChecked}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      if (checked) {
                                        setSelectedAllowedBuildings(prev => [...prev, b.id]);
                                      } else {
                                        setSelectedAllowedBuildings(prev => prev.filter(id => id !== b.id));
                                        const bRoomIds = buildingRooms.map(r => r.id);
                                        setSelectedAllowedRooms(prev => prev.filter(id => !bRoomIds.includes(id)));
                                      }
                                    }}
                                    className="w-3.5 h-3.5 accent-indigo-650 rounded focus:ring-0"
                                  />
                                  <span>{b.name} ({b.id})</span>
                                </label>
                                
                                {isBuildingChecked && buildingRooms.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const bRoomIds = buildingRooms.map(r => r.id);
                                      const allChecked = bRoomIds.every(id => selectedAllowedRooms.includes(id));
                                      if (allChecked) {
                                        // Uncheck all
                                        setSelectedAllowedRooms(prev => prev.filter(id => !bRoomIds.includes(id)));
                                      } else {
                                        // Check all
                                        setSelectedAllowedRooms(prev => {
                                          const union = new Set([...prev, ...bRoomIds]);
                                          return Array.from(union);
                                        });
                                      }
                                    }}
                                    className="text-[9px] font-black text-indigo-600 hover:text-indigo-850 uppercase tracking-wider bg-white border border-slate-200 hover:border-indigo-150 px-2 py-0.5 rounded-md transition-all active:scale-95"
                                  >
                                    {buildingRooms.map(r => r.id).every(id => selectedAllowedRooms.includes(id)) ? '✕ Batal Semua' : '✓ Centang Semua'}
                                  </button>
                                )}
                              </div>

                              {/* Grouped Rooms checkbox under this Building */}
                              {isBuildingChecked && (
                                <div className="pl-5 grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-1.5 border-l border-slate-200 ml-1.5 mt-2">
                                  {buildingRooms.length === 0 ? (
                                    <span className="text-[9px] text-slate-400 italic col-span-full block">Tidak ada kelas</span>
                                  ) : (
                                    buildingRooms.map((r) => {
                                      const isRoomChecked = selectedAllowedRooms.includes(r.id);
                                      return (
                                        <label key={r.id} className="flex items-center space-x-2 text-[11px] text-slate-600 hover:text-slate-800 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={isRoomChecked}
                                            onChange={(e) => {
                                              const checked = e.target.checked;
                                              if (checked) {
                                                setSelectedAllowedRooms(prev => [...prev, r.id]);
                                              } else {
                                                setSelectedAllowedRooms(prev => prev.filter(id => id !== r.id));
                                              }
                                            }}
                                            className="w-3 h-3 accent-indigo-600 rounded focus:ring-0"
                                          />
                                          <span>{r.name}</span>
                                        </label>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    {editingUserId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUserId(null);
                          setNewUserName('');
                          setNewUserEmail('');
                          setSelectedAllowedBuildings([]);
                          setSelectedAllowedRooms([]);
                        }}
                        className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-650 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                      >
                        Batal
                      </button>
                    )}
                    <button 
                      type="submit" 
                      className={`py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-650 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-indigo-100 ${
                        editingUserId ? 'w-2/3' : 'w-full'
                      }`}
                    >
                      {editingUserId ? 'Simpan' : 'Daftarkan'}
                    </button>
                  </div>
                </form>
              </div>

              {/* List Column */}
              <div className="lg:col-span-2 space-y-4">
                <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-2">PEMETAAN CHEKBOX AKSES RUANGAN</div>
                
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs shadow-xs">
                  <table className="w-full text-left border-collapse bg-white">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold text-[9px] border-b border-slate-200">
                        <th className="p-3.5">User & Email</th>
                        <th className="p-3.5">Role</th>
                        <th className="p-3.5">Hak Akses Gedung & Kelas</th>
                        <th className="p-3.5 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.uid} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="p-3.5">
                            <div className="font-bold text-slate-800">{u.name}</div>
                            <div className="text-[10px] font-mono text-slate-450">{u.email}</div>
                          </td>
                          <td className="p-3.5 uppercase">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${
                              u.role === 'admin' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="p-3.5 space-y-2">
                            {u.role === 'admin' ? (
                              <span className="text-[10px] text-slate-400 italic">Administratif Penuh (Semua Gedung & Ruang)</span>
                            ) : (
                              <div className="space-y-1.5">
                                {/* Allowed Buildings tag list */}
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-[8px] font-black text-slate-400 uppercase mr-1 flex items-center">Gedung:</span>
                                  {(!u.allowedBuildings || u.allowedBuildings.length === 0) ? (
                                    <span className="text-[9px] text-slate-400 italic">Tidak ada izin gedung</span>
                                  ) : (
                                    u.allowedBuildings.map(bId => (
                                      <span key={bId} className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-650 rounded text-[9px] font-bold">
                                        Gedung {bId}
                                      </span>
                                    ))
                                  )}
                                </div>
                                {/* Allowed Rooms tag list */}
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-[8px] font-black text-slate-400 uppercase mr-1 flex items-center">Ruangan:</span>
                                  {(!u.allowedRooms || u.allowedRooms.length === 0) ? (
                                    <span className="text-[9px] text-slate-400 italic">Tidak ada izin kelas</span>
                                  ) : (
                                    u.allowedRooms.map(rId => (
                                      <span key={rId} className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-650 rounded text-[9px] font-bold">
                                        {rId}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="p-3.5 text-center space-x-1 whitespace-nowrap">
                            <button
                              onClick={() => handleEditUser(u)}
                              className="text-[9px] font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-650 px-2 py-1 rounded border border-indigo-100 uppercase"
                            >
                              Ubah
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.uid)}
                              className="text-[9px] font-black bg-rose-50 hover:bg-rose-100 text-rose-600 px-2 py-1 rounded border border-rose-100 uppercase"
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* 4. Beautiful Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={closeConfirmModal}
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-xs transition-opacity duration-300"
          ></div>
          
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 space-y-5 relative z-10 shadow-2xl animate-in scale-in duration-200">
            <div className="flex items-center space-x-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${
                confirmModal.isDanger 
                  ? 'bg-rose-50 border border-rose-100 text-rose-600'
                  : 'bg-indigo-50 border border-indigo-100 text-indigo-600'
              }`}>
                {confirmModal.isDanger ? '⚠️' : '❓'}
              </div>
              <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">
                {confirmModal.title}
              </h3>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              {confirmModal.message}
            </p>

            <div className="flex space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={closeConfirmModal}
                className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-650 uppercase tracking-wider transition-all"
              >
                Batal
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`w-1/2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white transition-all shadow-xs ${
                  confirmModal.isDanger
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
                    : 'bg-indigo-600 hover:bg-indigo-755 shadow-indigo-100'
                }`}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Custom Toast Alert Popup Notification */}
      {toast.isOpen && (
        <div className="fixed bottom-5 right-5 z-55 max-w-sm w-full bg-white border rounded-2xl p-4 shadow-2xl flex items-center space-x-3 animate-in fade-in slide-in-from-bottom-5 duration-350 border-slate-200/90">
          <div className="text-base shrink-0">
            {toast.type === 'success' && '🟢'}
            {toast.type === 'info' && '🔵'}
            {toast.type === 'error' && '🔴'}
          </div>
          <div className="flex-grow">
            <p className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
              {toast.type === 'success' && 'SUKSES'}
              {toast.type === 'info' && 'INFORMASI'}
              {toast.type === 'error' && 'ERROR'}
            </p>
            <p className="text-xs text-slate-700 font-semibold mt-0.5">{toast.message}</p>
          </div>
          <button 
            onClick={() => setToast(prev => ({ ...prev, isOpen: false }))}
            className="text-slate-350 hover:text-slate-500 font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

    </DashboardLayout>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans text-slate-800">
        <span className="loading loading-spinner text-indigo-600"></span>
        <p className="text-slate-400 text-xs mt-2 tracking-widest uppercase font-semibold">Memuat Konsol Admin...</p>
      </div>
    }>
      <AdminPageContent />
    </Suspense>
  );
}
