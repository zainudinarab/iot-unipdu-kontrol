import { NextResponse } from 'next/server';
import { TuyaClient } from '@/lib/tuya';
import fs from 'fs';
import path from 'path';

const tuya = new TuyaClient();
const STATE_FILE = path.join(process.cwd(), 'device-states.json');

// Read states from local JSON file
function readStates(): Record<string, any> {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to read device-states.json:', err);
  }
  return {};
}

// Write/Merge state to local JSON file
function writeState(deviceId: string, data: Record<string, any>) {
  try {
    const states = readStates();
    states[deviceId] = { ...(states[deviceId] || {}), ...data };
    fs.writeFileSync(STATE_FILE, JSON.stringify(states, null, 2), 'utf8');
    console.log(`[STATE_CACHE] Saved state for ${deviceId}:`, data);
  } catch (err) {
    console.error('Failed to write device-states.json:', err);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId') || '';

    const status = await tuya.getDeviceStatus(deviceId);
    
    // Merge with persisted device states (e.g. for IR devices or simulation)
    const states = readStates();
    const savedState = states[deviceId];
    if (savedState) {
      Object.assign(status, savedState);
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
    const body = await request.json();
    const { deviceId, switchIndex, state, commands } = body;
    
    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: 'Parameter deviceId wajib disertakan' },
        { status: 400 }
      );
    }

    // Check if general commands list is provided (e.g. for IR remote controls)
    if (Array.isArray(commands)) {
      const success = await tuya.sendGeneralCommand(deviceId, commands);
      if (success) {
        const updateData: any = {};
        for (const cmd of commands) {
          if (cmd.code === 'PowerOn') {
            updateData.state = true;
          } else if (cmd.code === 'PowerOff') {
            updateData.state = false;
          } else if (cmd.code === 'T') {
            updateData.temp = cmd.value;
          } else if (cmd.code === 'switch') {
            updateData.tvState = cmd.value;
          } else if (cmd.code === 'M') {
            const modeMap: Record<number, string> = {
              0: 'cold',
              1: 'heat',
              2: 'auto',
              3: 'auto',
              4: 'wind_dry'
            };
            updateData.mode = modeMap[Number(cmd.value)] || 'cold';
          } else if (cmd.code === 'F') {
            const fanMap: Record<number, string> = {
              0: 'auto',
              1: 'low',
              2: 'mid',
              3: 'high'
            };
            updateData.fan = fanMap[Number(cmd.value)] || 'auto';
          }
        }

        if (Object.keys(updateData).length > 0) {
          writeState(deviceId, updateData);
        }

        const status = await tuya.getDeviceStatus(deviceId);
        const states = readStates();
        if (states[deviceId]) {
          Object.assign(status, states[deviceId]);
        }
        return NextResponse.json({ success: true, result: status });
      }
      return NextResponse.json(
        { success: false, error: 'Gagal mengirim perintah kontrol umum ke perangkat Tuya' },
        { status: 500 }
      );
    }

    // Legacy switchIndex / state handling (BARDI switches)
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
      const key = `state${switchIndex}`;
      writeState(deviceId, { [key]: state });

      const status = await tuya.getDeviceStatus(deviceId);
      const states = readStates();
      if (states[deviceId]) {
        Object.assign(status, states[deviceId]);
      }
      return NextResponse.json({ success: true, result: status });
    }

    return NextResponse.json(
      { success: false, error: 'Gagal mengirim perintah kontrol ke perangkat Tuya' },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('[API ERROR]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Terjadi kesalahan sistem' },
      { status: 500 }
    );
  }
}



