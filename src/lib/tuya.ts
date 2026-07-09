import crypto from 'crypto';

export interface TuyaDeviceStatus {
  id: string;
  name: string;
  online: boolean;
  state1: boolean; // switch_1
  state2: boolean; // switch_2
  state3: boolean; // switch_3
  isMock: boolean;
}

export class TuyaClient {
  private clientId: string;
  private clientSecret: string;
  private endpoint: string;
  private deviceId: string;

  constructor() {
    this.clientId = process.env.TUYA_CLIENT_ID || '';
    this.clientSecret = process.env.TUYA_CLIENT_SECRET || '';
    this.endpoint = process.env.TUYA_ENDPOINT || 'https://openapi-sg.iotbing.com';
    this.deviceId = process.env.TUYA_DEVICE_ID || '';
  }

  private encryptHMAC(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex').toUpperCase();
  }

  private sha256(data: string): string {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  // Calculate signature according to Tuya Cloud API requirements
  private getSignature(
    method: string,
    path: string,
    accessToken: string,
    timestamp: string,
    bodyStr: string = ''
  ): string {
    const contentSha = this.sha256(bodyStr);
    const headers = ''; // No custom signed headers
    const signUrl = path;
    const signString = `${method}\n${contentSha}\n${headers}\n${signUrl}`;
    const stringToSign = `${this.clientId}${accessToken}${timestamp}${signString}`;
    return this.encryptHMAC(stringToSign, this.clientSecret);
  }

  // Fetch official server time from Tuya to prevent sign invalid due to server drift
  async getTuyaTime(): Promise<string> {
    try {
      const res = await fetch(`${this.endpoint}/v1.0/time`, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.result) {
          return data.result.toString();
        }
      }
    } catch (err) {
      console.warn('Failed to fetch Tuya server time, falling back to local time:', err);
    }
    return Date.now().toString();
  }

  // Fetch access token from Tuya
  async getAccessToken(): Promise<string> {
    const timestamp = await this.getTuyaTime();
    const path = '/v1.0/token?grant_type=1';
    const signature = this.getSignature('GET', path, '', timestamp);

    const res = await fetch(`${this.endpoint}${path}`, {
      method: 'GET',
      headers: {
        'client_id': this.clientId,
        'sign': signature,
        't': timestamp,
        'sign_method': 'HMAC-SHA256',
      },
    });

    if (!res.ok) {
      throw new Error(`Token fetch failed: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(`Tuya Token Error: ${data.msg}`);
    }

    return data.result.access_token;
  }

  // Fetch BARDI Smart Switch device details and switch statuses
  async getDeviceStatus(targetDeviceId?: string): Promise<TuyaDeviceStatus> {
    const activeDeviceId = targetDeviceId || this.deviceId;
    
    if (!activeDeviceId || activeDeviceId.startsWith('simulation')) {
      // Return simulation state if no device configured
      return {
        id: activeDeviceId || 'simulation-device',
        name: 'BARDI Smart Wall Switch (Simulated)',
        online: true,
        state1: false,
        state2: false,
        state3: false,
        isMock: true,
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      const timestamp = await this.getTuyaTime();
      const path = `/v1.0/devices/${activeDeviceId}`;
      const signature = this.getSignature('GET', path, accessToken, timestamp);

      const res = await fetch(`${this.endpoint}${path}`, {
        method: 'GET',
        headers: {
          'client_id': this.clientId,
          'access_token': accessToken,
          'sign': signature,
          't': timestamp,
          'sign_method': 'HMAC-SHA256',
        },
      });

      if (!res.ok) {
        throw new Error(`Device fetch failed: ${res.statusText}`);
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(`Tuya Device Error: ${data.msg}`);
      }

      // Check status of 'switch_1', 'switch_2', 'switch_3' data points
      const statusList = data.result.status || [];
      const s1 = statusList.find((item: any) => item.code === 'switch_1');
      const s2 = statusList.find((item: any) => item.code === 'switch_2');
      const s3 = statusList.find((item: any) => item.code === 'switch_3');

      return {
        id: activeDeviceId,
        name: data.result.name || 'BARDI Smart Wall Switch 3-Gang',
        online: !!data.result.online,
        state1: s1 ? !!s1.value : false,
        state2: s2 ? !!s2.value : false,
        state3: s3 ? !!s3.value : false,
        isMock: false,
      };
    } catch (error) {
      console.warn('Tuya connection failed, falling back to simulated status:', error);
      return {
        id: activeDeviceId || 'offline-device',
        name: 'BARDI Smart Wall Switch (Fallback)',
        online: false,
        state1: false,
        state2: false,
        state3: false,
        isMock: true,
      };
    }
  }

  // Send control command to toggle a specific switch gang (1, 2, or 3)
  async controlDevice(targetDeviceId: string, switchIndex: number, state: boolean): Promise<boolean> {
    const activeDeviceId = targetDeviceId || this.deviceId;
    
    if (!activeDeviceId || activeDeviceId.startsWith('simulation')) {
      return true; // Simulate successful control
    }

    try {
      const accessToken = await this.getAccessToken();
      const timestamp = await this.getTuyaTime();
      const path = `/v1.0/devices/${activeDeviceId}/commands`;
      
      const body = {
        commands: [
          {
            code: `switch_${switchIndex}`,
            value: state,
          },
        ],
      };
      const bodyStr = JSON.stringify(body);
      const signature = this.getSignature('POST', path, accessToken, timestamp, bodyStr);

      const res = await fetch(`${this.endpoint}${path}`, {
        method: 'POST',
        headers: {
          'client_id': this.clientId,
          'access_token': accessToken,
          'sign': signature,
          't': timestamp,
          'sign_method': 'HMAC-SHA256',
          'Content-Type': 'application/json',
        },
        body: bodyStr,
      });

      if (!res.ok) {
        throw new Error(`Control failed: ${res.statusText}`);
      }

      const data = await res.json();
      return !!data.success;
    } catch (error) {
      console.error('Tuya command execution error:', error);
      return false;
    }
  }
}
