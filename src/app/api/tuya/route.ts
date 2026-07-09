import { NextResponse } from 'next/server';
import { TuyaClient } from '@/lib/tuya';

const tuya = new TuyaClient();

// In-memory simulated state database mapped by deviceId
// Format: { [deviceId]: { state1: boolean, state2: boolean, state3: boolean } }
const mockDevicesState: Record<string, { state1: boolean; state2: boolean; state3: boolean }> = {};

function getOrCreateMockState(deviceId: string) {
  if (!mockDevicesState[deviceId]) {
    mockDevicesState[deviceId] = { state1: false, state2: false, state3: false };
  }
  return mockDevicesState[deviceId];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId') || '';

    const status = await tuya.getDeviceStatus(deviceId);
    
    // Merge with in-memory simulation states if the target device runs in mock/fallback
    if (status.isMock) {
      const mockState = getOrCreateMockState(status.id);
      status.state1 = mockState.state1;
      status.state2 = mockState.state2;
      status.state3 = mockState.state3;
    }
    
    return NextResponse.json({ success: true, result: status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal membaca status perangkat' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { deviceId, switchIndex, state } = await request.json();
    
    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: 'Parameter deviceId wajib disertakan' },
        { status: 400 }
      );
    }

    if (typeof switchIndex !== 'number' || switchIndex < 1 || switchIndex > 3) {
      return NextResponse.json(
        { success: false, error: 'Parameter switchIndex wajib berupa angka 1, 2, atau 3' },
        { status: 400 }
      );
    }
    
    if (typeof state !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Parameter state wajib berupa boolean' },
        { status: 400 }
      );
    }

    const success = await tuya.controlDevice(deviceId, switchIndex, state);
    if (success) {
      // Sync simulated states
      const mockState = getOrCreateMockState(deviceId);
      if (switchIndex === 1) mockState.state1 = state;
      if (switchIndex === 2) mockState.state2 = state;
      if (switchIndex === 3) mockState.state3 = state;

      const status = await tuya.getDeviceStatus(deviceId);
      if (status.isMock) {
        status.state1 = mockState.state1;
        status.state2 = mockState.state2;
        status.state3 = mockState.state3;
      }
      return NextResponse.json({ success: true, result: status });
    }

    return NextResponse.json(
      { success: false, error: 'Gagal mengirim perintah kontrol ke perangkat Tuya' },
      { status: 500 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Terjadi kesalahan sistem' },
      { status: 500 }
    );
  }
}
