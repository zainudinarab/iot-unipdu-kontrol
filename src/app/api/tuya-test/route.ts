import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET() {
  const clientId = (process.env.TUYA_CLIENT_ID || '').trim();
  const clientSecret = (process.env.TUYA_CLIENT_SECRET || '').trim();
  const endpoint = (process.env.TUYA_ENDPOINT || 'https://openapi-sg.iotbing.com').trim();

  const vercelTime = Date.now();
  let tuyaTime = 0;
  let timeFetchError = '';

  let tuyaTimeRawResponse = '';
  let tuyaTimeStatusCode = 0;

  try {
    const timeRes = await fetch(`${endpoint}/v1.0/time`, { cache: 'no-store' });
    tuyaTimeStatusCode = timeRes.status;
    tuyaTimeRawResponse = await timeRes.text();
    
    if (timeRes.ok) {
      try {
        const data = JSON.parse(tuyaTimeRawResponse);
        if (data.success) {
          tuyaTime = data.result;
        }
      } catch (parseErr: any) {
        timeFetchError = 'JSON parse error: ' + parseErr.message;
      }
    }
  } catch (e: any) {
    timeFetchError = e.message;
  }

  const timeDiff = tuyaTime ? Math.abs(vercelTime - tuyaTime) : 'N/A';

  // Test token request with Vercel Time
  let vercelTimeTokenResult = null;
  try {
    const timestamp = vercelTime.toString();
    const path = '/v1.0/token?grant_type=1';
    
    // Hash sign
    const contentSha = crypto.createHash('sha256').update('', 'utf8').digest('hex');
    const signString = `GET\n${contentSha}\n\n${path}`;
    const stringToSign = `${clientId}${timestamp}${signString}`;
    const signature = crypto.createHmac('sha256', clientSecret).update(stringToSign, 'utf8').digest('hex').toUpperCase();

    const res = await fetch(`${endpoint}${path}`, {
      method: 'GET',
      headers: {
        'client_id': clientId,
        'sign': signature,
        't': timestamp,
        'sign_method': 'HMAC-SHA256',
      },
      cache: 'no-store'
    });
    vercelTimeTokenResult = await res.json();
  } catch (e: any) {
    vercelTimeTokenResult = { error: e.message };
  }

  // Test token request with Tuya Time
  let tuyaTimeTokenResult = null;
  if (tuyaTime) {
    try {
      const timestamp = tuyaTime.toString();
      const path = '/v1.0/token?grant_type=1';
      
      const contentSha = crypto.createHash('sha256').update('', 'utf8').digest('hex');
      const signString = `GET\n${contentSha}\n\n${path}`;
      const stringToSign = `${clientId}${timestamp}${signString}`;
      const signature = crypto.createHmac('sha256', clientSecret).update(stringToSign, 'utf8').digest('hex').toUpperCase();

      const res = await fetch(`${endpoint}${path}`, {
        method: 'GET',
        headers: {
          'client_id': clientId,
          'sign': signature,
          't': timestamp,
          'sign_method': 'HMAC-SHA256',
        },
        cache: 'no-store'
      });
      tuyaTimeTokenResult = await res.json();
    } catch (e: any) {
      tuyaTimeTokenResult = { error: e.message };
    }
  }

  return NextResponse.json({
    diagnostics: {
      vercelServerTime: vercelTime,
      tuyaServerTime: tuyaTime,
      diffMilliseconds: timeDiff,
      tuyaTimeStatusCode,
      tuyaTimeRawResponse,
      timeFetchError,
      hasTuyaKeys: {
        clientId: !!clientId,
        clientSecret: !!clientSecret,
        endpoint: endpoint
      }
    },
    testResults: {
      usingVercelTime: vercelTimeTokenResult,
      usingTuyaTime: tuyaTimeTokenResult
    }
  });
}
