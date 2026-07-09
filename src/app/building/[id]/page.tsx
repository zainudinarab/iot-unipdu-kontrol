'use client';

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import DashboardLayout from '@/components/DashboardLayout';

interface Room {
  id: string;
  name: string;
  floorId: string;
  buildingId: string;
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
  // State for switches
  state1?: boolean;
  state2?: boolean;
  state3?: boolean;
  state4?: boolean;
  // IR sub-device counts
  acCount?: number;
  tvCount?: number;
  projectorCount?: number;
  // State for IR remotes (backward compat single AC)
  state?: boolean;
  temp?: number;
  volume?: number;
  mode?: string;
  tvState?: boolean;
  tvVolume?: number;
  projectorState?: boolean;
  isMock: boolean;
  online: boolean;
  irDevices?: string[];
  // Dynamic indexed states (ac2State, ac2Temp, etc.)
  [key: string]: any;
}

export default function BuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: buildingId } = React.use(params);

  const [buildingName, setBuildingName] = useState('');
  const [buildingCoordinates, setBuildingCoordinates] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [availableFloors, setAvailableFloors] = useState<string[]>([]);
  const [activeFloorId, setActiveFloorId] = useState<string>('Lantai 1');
  
  const [loading, setLoading] = useState(true);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [activeSeqIndex, setActiveSeqIndex] = useState<Record<string, number | null>>({});
  const [seqStatusMsg, setSeqStatusMsg] = useState<Record<string, string>>({});

  // 1. Fetch building details & rooms
  const loadBuildingData = async () => {
    setLoading(true);
    try {
      const bDoc = await getDoc(doc(db, 'locations', buildingId));
      if (bDoc.exists()) {
        setBuildingName(bDoc.data().name);
        setBuildingCoordinates(bDoc.data().coordinates || '');
      } else {
        setBuildingName(`Gedung ${buildingId}`);
        setBuildingCoordinates('');
      }

      const user = auth.currentUser;
      if (!user) return;
      
      const userProfileDoc = await getDoc(doc(db, 'users', user.uid));
      const profile = userProfileDoc.exists() ? userProfileDoc.data() : { role: 'user', allowedRooms: [] };

      // Fetch all rooms in building
      const roomsSnap = await getDocs(collection(db, `locations/${buildingId}/rooms`));
      const roomList: Room[] = [];

      roomsSnap.forEach((rDoc) => {
        const roomId = rDoc.id;
        const isAllowed = profile.role === 'admin' || (profile.allowedRooms && profile.allowedRooms.includes(roomId));
        
        if (isAllowed) {
          roomList.push({
            id: roomId,
            name: rDoc.data().name,
            floorId: rDoc.data().floorId || 'Lantai 1',
            buildingId: buildingId
          });
        }
      });

      // Find unique floors and sort them
      const uniqueFloors = Array.from(new Set(roomList.map(r => r.floorId))).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });

      setRooms(roomList);
      setAvailableFloors(uniqueFloors);

      // Default active floor to the first available one, or Lantai 1 if it exists
      if (uniqueFloors.length > 0) {
        if (uniqueFloors.includes('Lantai 1')) {
          setActiveFloorId('Lantai 1');
        } else {
          setActiveFloorId(uniqueFloors[0]);
        }
      }
    } catch (err) {
      console.error('Error loading building details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBuildingData();
  }, [buildingId]);

  // 2. Fetch building devices status
  const fetchDevices = async (silent = false) => {
    if (rooms.length === 0) return;
    if (!silent) setDevicesLoading(true);

    try {
      const roomIds = rooms.map(r => r.id);
      const q = query(collection(db, 'devices'), where('roomId', 'in', roomIds));
      const snap = await getDocs(q);
      const deviceList: Device[] = [];

      for (const dDoc of snap.docs) {
        const dData = dDoc.data();
        
        const res = await fetch(`/api/tuya?deviceId=${dData.tuyaDeviceId}`);
        let liveStatus = { state1: false, state2: false, state3: false, state4: false, state: false, temp: 24, volume: 50, mode: 'cooling', online: false, isMock: true };
        
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            liveStatus = data.result;
          }
        }

        deviceList.push({
          id: dDoc.id,
          name: dData.name,
          tuyaDeviceId: dData.tuyaDeviceId,
          roomId: dData.roomId,
          type: dData.type || 'switch',
          gangCount: dData.gangCount || 3,
          gang1Name: dData.gang1Name || 'Tombol 1',
          gang2Name: dData.gang2Name || 'Tombol 2',
          gang3Name: dData.gang3Name || 'Tombol 3',
          gang4Name: dData.gang4Name || 'Tombol 4',
          state1: liveStatus.state1,
          state2: liveStatus.state2,
          state3: liveStatus.state3,
          state4: liveStatus.state4 || false,
          state: liveStatus.state,
          temp: liveStatus.temp,
          volume: liveStatus.volume,
          mode: liveStatus.mode,
          tvState: false,
          tvVolume: 15,
          projectorState: false,
          online: liveStatus.online,
          isMock: liveStatus.isMock,
          irDevices: dData.irDevices || ['ac'],
          acCount: dData.acCount || 1,
          tvCount: dData.tvCount || 1,
          projectorCount: dData.projectorCount || 1,
          isSequential: !!dData.isSequential,
          sequentialDelay: dData.sequentialDelay || 2,
          onOrder: dData.onOrder || 'forward',
          offOrder: dData.offOrder || 'forward',
        });
      }
      setDevices(deviceList);
    } catch (err) {
      console.error('Error fetching devices:', err);
    } finally {
      if (!silent) setDevicesLoading(false);
    }
  };

  // Fetch devices when rooms are loaded
  useEffect(() => {
    if (rooms.length > 0) {
      fetchDevices(false);
    }
  }, [rooms]);

  // Polling devices status every 8 seconds
  useEffect(() => {
    if (rooms.length === 0) return;
    const interval = setInterval(() => {
      fetchDevices(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [rooms]);

  const addAuditLog = async (action: string) => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const userProfileDoc = await getDoc(doc(db, 'users', user.uid));
      const userName = userProfileDoc.exists() ? userProfileDoc.data().name : user.email;
      
      await addDoc(collection(db, 'logs'), {
        userId: user.uid,
        userName: userName || 'System',
        action,
        timestamp: new Date()
      });
    } catch (err) {
      console.error('Audit log failed:', err);
    }
  };

  // Control Switch
  const handleToggleSwitch = async (deviceItem: Device, switchIndex: number, targetState: boolean) => {
    const actionKey = `${deviceItem.id}-${switchIndex}`;
    if (actionLoading[actionKey]) return;

    setActionLoading(prev => ({ ...prev, [actionKey]: true }));
    try {
      const res = await fetch('/api/tuya', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          deviceId: deviceItem.tuyaDeviceId, 
          switchIndex, 
          state: targetState 
        }),
      });

      if (!res.ok) throw new Error('Control failed');
      const data = await res.json();
      
      if (data.success) {
        setDevices(prev => prev.map(d => {
          if (d.id === deviceItem.id) {
            const key = `state${switchIndex}` as keyof Device;
            return { ...d, [key]: targetState };
          }
          return d;
        }));

        const activeRoom = rooms.find(r => r.id === deviceItem.roomId);
        await addAuditLog(`MENGUBAH ${deviceItem.name} (TOMBOL ${switchIndex}) -> ${targetState ? 'ON' : 'OFF'} di ${activeRoom?.name || 'Ruangan'}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  // Helper Delay
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Sequential Switch ON/OFF Toggle
  const handleSequentialToggle = async (deviceItem: Device, targetState: boolean) => {
    const gangCount = deviceItem.gangCount || 3;
    const seqDelay = (deviceItem.sequentialDelay || 2) * 1000;
    const order = targetState 
      ? (deviceItem.onOrder || 'forward') 
      : (deviceItem.offOrder || 'forward');

    // Create array of switch indexes [1..gangCount]
    let switchIndexes = Array.from({ length: gangCount }, (_, i) => i + 1);
    if (order === 'reverse') {
      switchIndexes.reverse();
    }

    const actionKey = `${deviceItem.id}-seq`;
    if (actionLoading[actionKey]) return;
    setActionLoading(prev => ({ ...prev, [actionKey]: true }));

    try {
      const activeRoom = rooms.find(r => r.id === deviceItem.roomId);
      await addAuditLog(`MEMULAI AKSI SEKUENSIAL ${targetState ? 'ON' : 'OFF'} UNTUK ${deviceItem.name} di ${activeRoom?.name || 'Ruangan'}`);

      let commandsExecuted = 0;

      for (let i = 0; i < switchIndexes.length; i++) {
        const switchIdx = switchIndexes[i];
        
        // Skip instantly if already in the target state
        const currentState = !!deviceItem[`state${switchIdx}`];
        if (currentState === targetState) {
          continue;
        }

        // Apply delay BEFORE executing if we have already run at least one command
        if (commandsExecuted > 0) {
          setSeqStatusMsg(prev => ({ 
            ...prev, 
            [deviceItem.id]: `Jeda... Menunggu ${deviceItem.sequentialDelay} detik...` 
          }));
          await delay(seqDelay);
        }

        // 1. Set Active Visual Index and Status Message
        setActiveSeqIndex(prev => ({ ...prev, [deviceItem.id]: switchIdx }));
        
        let switchName = `Tombol ${switchIdx}`;
        if (switchIdx === 1) switchName = deviceItem.gang1Name || 'Tombol 1';
        else if (switchIdx === 2) switchName = deviceItem.gang2Name || 'Tombol 2';
        else if (switchIdx === 3) switchName = deviceItem.gang3Name || 'Tombol 3';
        else if (switchIdx === 4) switchName = deviceItem.gang4Name || 'Tombol 4';
        
        setSeqStatusMsg(prev => ({ 
          ...prev, 
          [deviceItem.id]: `Menghubungkan ${switchName} -> ${targetState ? 'ON' : 'OFF'}...` 
        }));

        // Perform control request
        const res = await fetch('/api/tuya', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            deviceId: deviceItem.tuyaDeviceId, 
            switchIndex: switchIdx, 
            state: targetState 
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setDevices(prev => prev.map(d => {
              if (d.id === deviceItem.id) {
                return { ...d, [`state${switchIdx}`]: targetState };
              }
              return d;
            }));
            await addAuditLog(`[SEKUENSIAL] ${deviceItem.name} (${switchName}) -> ${targetState ? 'ON' : 'OFF'}`);
            commandsExecuted++;
          }
        }
      }
      
      setSeqStatusMsg(prev => ({ ...prev, [deviceItem.id]: '✅ Berurutan Selesai!' }));
      setTimeout(() => {
        setSeqStatusMsg(prev => {
          const next = { ...prev };
          delete next[deviceItem.id];
          return next;
        });
      }, 2500);

    } catch (err) {
      console.error('Sequential execution failed', err);
      setSeqStatusMsg(prev => ({ ...prev, [deviceItem.id]: '❌ Gagal mengeksekusi!' }));
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
      setActiveSeqIndex(prev => ({ ...prev, [deviceItem.id]: null }));
    }
  };

  // Control IR Remote
  const handleIRRemoteCommand = async (deviceItem: Device, command: string) => {
    const actionKey = `${deviceItem.id}-${command}`;
    if (actionLoading[actionKey]) return;

    setActionLoading(prev => ({ ...prev, [actionKey]: true }));
    try {
      const activeRoom = rooms.find(r => r.id === deviceItem.roomId);
      await addAuditLog(`MENGIRIM PERINTAH IR REMOTE (${command}) ke ${deviceItem.name} di ${activeRoom?.name || 'Ruangan'}`);
      
      setDevices(prev => prev.map(d => {
        if (d.id === deviceItem.id) {
          if (command === 'POWER') return { ...d, state: !d.state };
          if (command === 'TEMP_UP') return { ...d, temp: Math.min((d.temp || 24) + 1, 30) };
          if (command === 'TEMP_DOWN') return { ...d, temp: Math.max((d.temp || 24) - 1, 16) };
        }
        return d;
      }));
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  const getRoomActiveStatus = (roomId: string): boolean => {
    const roomDevices = devices.filter(d => d.roomId === roomId);
    if (roomDevices.length === 0) return false;

    return roomDevices.some(d => {
      if (d.type === 'switch') {
        const count = d.gangCount || 3;
        return (
          (count >= 1 && !!d.state1) ||
          (count >= 2 && !!d.state2) ||
          (count >= 3 && !!d.state3) ||
          (count >= 4 && !!d.state4)
        );
      } else if (d.type === 'ir_remote') {
        const acC = d.acCount || 1;
        const tvC = d.tvCount || 1;
        const projC = d.projectorCount || 1;
        for (let i = 1; i <= acC; i++) { if (i === 1 ? !!d.state : !!d[`ac${i}State`]) return true; }
        for (let i = 1; i <= tvC; i++) { if (i === 1 ? !!d.tvState : !!d[`tv${i}State`]) return true; }
        for (let i = 1; i <= projC; i++) { if (i === 1 ? !!d.projectorState : !!d[`proj${i}State`]) return true; }
        return false;
      }
      return false;
    });
  };

  // Filter rooms for only the active floor tab
  const activeFloorRooms = rooms.filter(room => room.floorId === activeFloorId);

  return (
    <DashboardLayout>
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center space-y-3 shadow-xs">
          <span className="loading loading-spinner text-teal-600 loading-md"></span>
          <p className="text-slate-450 text-[10px] uppercase font-bold tracking-widest text-center">Menghubungkan Perangkat...</p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Header Row */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-slate-200 gap-4">
            <div className="space-y-1">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                {buildingName}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-semibold uppercase tracking-wider">
                <span>Status sensor ruangan dan kendali switch terintegrasi</span>
                {buildingCoordinates && (
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(buildingCoordinates)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-600 hover:underline flex items-center space-x-1 border-l border-slate-200 pl-3 lowercase text-[11px]"
                  >
                    <span>📍 GPS: {buildingCoordinates}</span>
                  </a>
                )}
              </div>
            </div>
            
            <button
              onClick={() => fetchDevices(false)}
              className="px-4 py-2 bg-white border border-slate-200 hover:border-slate-350 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:text-slate-800 active:scale-95 flex items-center space-x-2 shadow-xs"
            >
              <span>Sync Status</span>
            </button>
          </div>

          {rooms.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 font-bold uppercase tracking-wider">
              Anda tidak memiliki izin akses ruangan di gedung ini
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Floor Selection Tabs */}
              {availableFloors.length > 1 && (
                <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100/80 rounded-xl w-fit border border-slate-200">
                  {availableFloors.map((floorId) => {
                    const isActive = activeFloorId === floorId;
                    const floorRooms = rooms.filter(r => r.floorId === floorId);
                    const activeRoomsCount = floorRooms.filter(r => getRoomActiveStatus(r.id)).length;

                    return (
                      <button
                        key={floorId}
                        onClick={() => setActiveFloorId(floorId)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all select-none ${
                          isActive
                            ? 'bg-white text-teal-700 shadow-sm border border-slate-200'
                            : 'text-slate-450 hover:text-slate-700'
                        }`}
                      >
                        <span>{floorId}</span>
                        {activeRoomsCount > 0 && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        )}
                        <span className="text-[9px] font-mono text-slate-400">({floorRooms.length})</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {devicesLoading && devices.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center space-y-3 shadow-xs">
                  <span className="loading loading-spinner text-teal-600 loading-md"></span>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Memuat daftar perangkat...</p>
                </div>
              ) : (
                /* Rooms Grid for Active Floor only */
                <div className="space-y-4">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                    DAFTAR RUANGAN DI {activeFloorId.toUpperCase()} ({activeFloorRooms.length} kelas)
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {activeFloorRooms.map((room) => {
                      const isRoomActive = getRoomActiveStatus(room.id);
                      const roomDevices = devices.filter(d => d.roomId === room.id);

                      return (
                        <div 
                          key={room.id}
                          className={`rounded-2xl border p-6 transition-all duration-300 ${
                            isRoomActive
                              ? 'bg-white border-emerald-500 shadow-md shadow-emerald-500/5'
                              : 'bg-white border-slate-200/80 shadow-xs'
                          } flex flex-col md:flex-row justify-between gap-6`}
                        >
                          
                          {/* Info Column */}
                          <div className="flex flex-col justify-between space-y-4 md:w-1/3">
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${isRoomActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                                <span className={`text-[10px] font-black uppercase tracking-wider ${isRoomActive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {isRoomActive ? 'AKTIF (ON)' : 'MATI (OFF)'}
                                </span>
                              </div>
                              <h3 className="text-xl font-black text-slate-800 uppercase mt-2">{room.name}</h3>
                              <span className="text-[9px] font-mono text-slate-450 uppercase tracking-widest">{activeFloorId}</span>
                            </div>

                            <div className="text-[10px] text-slate-400 font-bold uppercase">
                              {roomDevices.length} Perangkat Terdaftar
                            </div>
                          </div>

                          {/* Control Column */}
                          <div className="flex-grow space-y-4">
                            {roomDevices.length === 0 ? (
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider py-8 text-center border border-dashed border-slate-200 rounded-xl">
                                Belum ada perangkat
                              </div>
                            ) : (
                              roomDevices.map((deviceItem) => {
                                if (deviceItem.type === 'switch') {
                                  const count = deviceItem.gangCount || 3;
                                  const gangsArray = Array.from({ length: count }, (_, i) => i + 1);

                                  return (
                                    <div key={deviceItem.id} className="p-4 bg-slate-55 border border-slate-100 rounded-xl space-y-3">
                                      <div className="flex justify-between text-[9px] text-slate-455 font-black uppercase tracking-wider">
                                        <span>{deviceItem.name}</span>
                                        <span className="text-emerald-600 font-bold">
                                          {deviceItem.isSequential ? 'Sequential Switch' : `${count}-Gang Switch`}
                                        </span>
                                      </div>

                                      {/* Sequential Actions Panel */}
                                      {deviceItem.isSequential && (
                                        <div className="p-2.5 bg-white border border-slate-200/80 rounded-lg space-y-2">
                                          <div className="flex justify-between items-center text-[8px] text-slate-400 font-black uppercase tracking-wider">
                                            <span>Urutan: {deviceItem.onOrder === 'forward' ? '1➔4' : '4➔1'}</span>
                                            <span>Jeda: {deviceItem.sequentialDelay} Detik</span>
                                          </div>
                                          
                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => handleSequentialToggle(deviceItem, true)}
                                              disabled={!!actionLoading[`${deviceItem.id}-seq`]}
                                              className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-md text-[8px] font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                                            >
                                              {actionLoading[`${deviceItem.id}-seq`] ? (
                                                <span className="loading loading-spinner w-2.5 h-2.5"></span>
                                              ) : '🟢 Nyala Berurutan'}
                                            </button>

                                            <button
                                              onClick={() => handleSequentialToggle(deviceItem, false)}
                                              disabled={!!actionLoading[`${deviceItem.id}-seq`]}
                                              className="flex-1 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-md text-[8px] font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                                            >
                                              {actionLoading[`${deviceItem.id}-seq`] ? (
                                                <span className="loading loading-spinner w-2.5 h-2.5"></span>
                                              ) : '🔴 Mati Berurutan'}
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* Sequential Live Status Ticker */}
                                      {seqStatusMsg[deviceItem.id] && (
                                        <div className="bg-teal-50/60 border border-teal-100/50 rounded-lg p-2 text-center animate-pulse">
                                          <span className="text-[8px] font-black uppercase tracking-wider text-teal-700 block">
                                            {seqStatusMsg[deviceItem.id]}
                                          </span>
                                        </div>
                                      )}

                                      <div className={`grid gap-2 ${
                                        count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : count === 3 ? 'grid-cols-3' : 'grid-cols-4'
                                      }`}>
                                        {gangsArray.map((num) => {
                                          const stateKey = `state${num}` as keyof Device;
                                          const isStateOn = !!deviceItem[stateKey];
                                          const actionKey = `${deviceItem.id}-${num}`;
                                          const isActivelySeqProcessed = activeSeqIndex[deviceItem.id] === num;
                                          
                                          let btnName = 'Tombol';
                                          if (num === 1) btnName = deviceItem.gang1Name || 'Tombol 1';
                                          else if (num === 2) btnName = deviceItem.gang2Name || 'Tombol 2';
                                          else if (num === 3) btnName = deviceItem.gang3Name || 'Tombol 3';
                                          else if (num === 4) btnName = deviceItem.gang4Name || 'Tombol 4';

                                          return (
                                            <button
                                              key={num}
                                              onClick={() => handleToggleSwitch(deviceItem, num, !isStateOn)}
                                              disabled={actionLoading[actionKey] || !!actionLoading[`${deviceItem.id}-seq`]}
                                              className={`py-2.5 px-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 flex flex-col items-center gap-1 border ${
                                                isActivelySeqProcessed
                                                  ? 'bg-teal-50 border-teal-400 ring-2 ring-teal-400/40 animate-pulse scale-[1.03] text-teal-700'
                                                  : isStateOn
                                                    ? 'bg-amber-50 text-amber-600 border-amber-200 shadow-sm'
                                                    : 'bg-white hover:bg-slate-50 text-slate-400 border-slate-200'
                                              }`}
                                            >
                                              <span className={`text-base transition-all duration-300 ${
                                                isActivelySeqProcessed
                                                  ? 'animate-bounce text-teal-600'
                                                  : isStateOn
                                                    ? 'text-amber-500 drop-shadow-[0_2px_8px_rgba(245,158,11,0.4)] scale-110'
                                                    : 'text-slate-300 grayscale opacity-60'
                                              }`}>
                                                💡
                                              </span>
                                              
                                              <span className="truncate w-full text-center">
                                                {btnName}
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                } else if (deviceItem.type === 'ir_remote') {
                                  const subList = deviceItem.irDevices || ['ac'];
                                  const acCount = deviceItem.acCount || 1;
                                  const tvCount = deviceItem.tvCount || 1;
                                  const projCount = deviceItem.projectorCount || 1;

                                  return (
                                    <div key={deviceItem.id} className="p-4 bg-slate-55 border border-slate-100 rounded-xl space-y-3">
                                      <div className="flex justify-between text-[9px] text-slate-455 font-black uppercase tracking-wider">
                                        <span>{deviceItem.name}</span>
                                        <span className="text-emerald-600 font-bold">Universal IR Remote</span>
                                      </div>
                                      
                                      <div className="space-y-2">
                                        {/* AC Units */}
                                        {subList.includes('ac') && Array.from({ length: acCount }, (_, idx) => {
                                          const unitNum = idx + 1;
                                          const stateKey = unitNum === 1 ? 'state' : `ac${unitNum}State`;
                                          const tempKey = unitNum === 1 ? 'temp' : `ac${unitNum}Temp`;
                                          const isActive = !!deviceItem[stateKey];
                                          const currentTemp = deviceItem[tempKey] || 24;
                                          const label = acCount > 1 ? `AC ${unitNum}` : 'AC / Pendingin';

                                          return (
                                            <div key={`ac-${unitNum}`} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                                              <div className="space-y-0.5">
                                                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{label}</div>
                                                <div className="text-[10px] font-mono font-bold text-teal-650">
                                                  {isActive ? `SUHU: ${currentTemp}°C` : 'MATI (STANDBY)'}
                                                </div>
                                              </div>
                                              <div className="flex items-center space-x-1.5">
                                                <button
                                                  onClick={() => {
                                                    setDevices(prev => prev.map(d => d.id === deviceItem.id ? { ...d, [tempKey]: Math.max((d[tempKey] || 24) - 1, 16) } : d));
                                                    handleIRRemoteCommand(deviceItem, `AC${unitNum}_TEMP_DOWN`);
                                                  }}
                                                  disabled={!isActive}
                                                  className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 disabled:opacity-35 flex items-center justify-center font-bold text-xs active:scale-95"
                                                >-</button>
                                                <button
                                                  onClick={() => {
                                                    setDevices(prev => prev.map(d => d.id === deviceItem.id ? { ...d, [tempKey]: Math.min((d[tempKey] || 24) + 1, 30) } : d));
                                                    handleIRRemoteCommand(deviceItem, `AC${unitNum}_TEMP_UP`);
                                                  }}
                                                  disabled={!isActive}
                                                  className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 disabled:opacity-35 flex items-center justify-center font-bold text-xs active:scale-95"
                                                >+</button>
                                                <button
                                                  onClick={() => {
                                                    setDevices(prev => prev.map(d => d.id === deviceItem.id ? { ...d, [stateKey]: !d[stateKey] } : d));
                                                    handleIRRemoteCommand(deviceItem, `AC${unitNum}_POWER`);
                                                  }}
                                                  className={`h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all active:scale-95 ${
                                                    isActive ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                                  }`}
                                                >{acCount > 1 ? `AC ${unitNum}` : 'AC'}</button>
                                              </div>
                                            </div>
                                          );
                                        })}

                                        {/* TV Units */}
                                        {subList.includes('tv') && Array.from({ length: tvCount }, (_, idx) => {
                                          const unitNum = idx + 1;
                                          const stateKey = unitNum === 1 ? 'tvState' : `tv${unitNum}State`;
                                          const volKey = unitNum === 1 ? 'tvVolume' : `tv${unitNum}Volume`;
                                          const isActive = !!deviceItem[stateKey];
                                          const currentVol = deviceItem[volKey] || 15;
                                          const label = tvCount > 1 ? `TV ${unitNum}` : 'TV / Televisi';

                                          return (
                                            <div key={`tv-${unitNum}`} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                                              <div className="space-y-0.5">
                                                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{label}</div>
                                                <div className="text-[10px] font-mono font-bold text-indigo-600">
                                                  {isActive ? `VOL: ${currentVol}` : 'MATI (STANDBY)'}
                                                </div>
                                              </div>
                                              <div className="flex items-center space-x-1.5">
                                                <button
                                                  onClick={() => {
                                                    setDevices(prev => prev.map(d => d.id === deviceItem.id ? { ...d, [volKey]: Math.max((d[volKey] || 15) - 2, 0) } : d));
                                                    handleIRRemoteCommand(deviceItem, `TV${unitNum}_VOL_DOWN`);
                                                  }}
                                                  disabled={!isActive}
                                                  className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 disabled:opacity-35 flex items-center justify-center font-bold text-xs active:scale-95"
                                                >-</button>
                                                <button
                                                  onClick={() => {
                                                    setDevices(prev => prev.map(d => d.id === deviceItem.id ? { ...d, [volKey]: Math.min((d[volKey] || 15) + 2, 100) } : d));
                                                    handleIRRemoteCommand(deviceItem, `TV${unitNum}_VOL_UP`);
                                                  }}
                                                  disabled={!isActive}
                                                  className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 disabled:opacity-35 flex items-center justify-center font-bold text-xs active:scale-95"
                                                >+</button>
                                                <button
                                                  onClick={() => {
                                                    setDevices(prev => prev.map(d => d.id === deviceItem.id ? { ...d, [stateKey]: !d[stateKey] } : d));
                                                    handleIRRemoteCommand(deviceItem, `TV${unitNum}_POWER`);
                                                  }}
                                                  className={`h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all active:scale-95 ${
                                                    isActive ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                                  }`}
                                                >{tvCount > 1 ? `TV ${unitNum}` : 'TV'}</button>
                                              </div>
                                            </div>
                                          );
                                        })}

                                        {/* Projector Units */}
                                        {subList.includes('projector') && Array.from({ length: projCount }, (_, idx) => {
                                          const unitNum = idx + 1;
                                          const stateKey = unitNum === 1 ? 'projectorState' : `proj${unitNum}State`;
                                          const isActive = !!deviceItem[stateKey];
                                          const label = projCount > 1 ? `Proyektor ${unitNum}` : 'Proyektor Kelas';

                                          return (
                                            <div key={`proj-${unitNum}`} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                                              <div className="space-y-0.5">
                                                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{label}</div>
                                                <div className="text-[10px] font-mono font-bold text-indigo-600">
                                                  {isActive ? 'POWER: ON (HDMI 1)' : 'MATI (STANDBY)'}
                                                </div>
                                              </div>
                                              <div className="flex items-center">
                                                <button
                                                  onClick={() => {
                                                    setDevices(prev => prev.map(d => d.id === deviceItem.id ? { ...d, [stateKey]: !d[stateKey] } : d));
                                                    handleIRRemoteCommand(deviceItem, `PROJ${unitNum}_POWER`);
                                                  }}
                                                  className={`h-7 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all active:scale-95 ${
                                                    isActive ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                                  }`}
                                                >{projCount > 1 ? `PROY ${unitNum}` : 'PROYEKTOR'}</button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </DashboardLayout>
  );
}
