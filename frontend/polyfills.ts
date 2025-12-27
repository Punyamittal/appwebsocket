/**
 * Polyfills for Expo Web
 * 
 * Socket.IO client requires Node.js APIs (Buffer, process) that aren't
 * available in the browser. This file provides polyfills for web platform.
 */

// Only apply polyfills on web platform
if (typeof window !== 'undefined') {
  // Buffer polyfill - buffer package is already installed
  if (typeof global !== 'undefined' && typeof global.Buffer === 'undefined') {
    try {
      // @ts-ignore - buffer package is installed
      const { Buffer } = require('buffer');
      global.Buffer = Buffer;
      console.log('[Polyfill] ✅ Buffer polyfill loaded');
    } catch (e) {
      console.warn('[Polyfill] Buffer package not found, using fallback:', e);
      // Fallback: minimal Buffer implementation
      // @ts-ignore
      global.Buffer = class Buffer {
        static from(data: any) {
          if (typeof data === 'string') {
            return new Uint8Array(data.split('').map((c: string) => c.charCodeAt(0)));
          }
          return new Uint8Array(data);
        }
        static isBuffer(obj: any) {
          return obj instanceof Uint8Array;
        }
      };
    }
  }

  // Process polyfill - minimal implementation
  if (typeof global !== 'undefined' && typeof global.process === 'undefined') {
    try {
      // @ts-ignore - try to use process package if available
      const process = require('process');
      global.process = process;
      console.log('[Polyfill] ✅ Process polyfill loaded');
    } catch (e) {
      // Fallback: minimal process object
      // @ts-ignore
      global.process = {
        env: {},
        version: '',
        versions: {},
        platform: 'browser',
        nextTick: (fn: Function) => setTimeout(fn, 0),
      };
      console.log('[Polyfill] ✅ Process fallback loaded');
    }
  }
}

