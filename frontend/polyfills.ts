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

  // Suppress FontFaceObserver timeout errors
  // These errors are non-critical - fonts will still work, detection just fails
  const originalErrorHandler = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    // Suppress FontFaceObserver timeout errors
    const messageStr = String(message || '');
    const errorMessage = error?.message || '';
    
    if (
      messageStr.includes('timeout exceeded') || 
      messageStr.includes('FontFaceObserver') ||
      errorMessage.includes('timeout exceeded') ||
      errorMessage.includes('FontFaceObserver')
    ) {
      console.warn('[Polyfill] Suppressed FontFaceObserver timeout (non-critical)');
      return true; // Suppress the error
    }
    
    // Call original error handler for other errors
    if (originalErrorHandler) {
      return originalErrorHandler.call(this, message, source, lineno, colno, error);
    }
    return false;
  };

  // Also handle unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason;
    const errorMessage = 
      (reason && typeof reason === 'object' && reason.message) ||
      (typeof reason === 'string' ? reason : '');
    
    if (
      errorMessage &&
      (errorMessage.includes('timeout exceeded') || 
       errorMessage.includes('FontFaceObserver'))
    ) {
      console.warn('[Polyfill] Suppressed FontFaceObserver promise rejection (non-critical)');
      event.preventDefault(); // Suppress the error
    }
  });

  // Patch setTimeout to catch errors from FontFaceObserver callbacks
  const originalSetTimeout = window.setTimeout;
  window.setTimeout = function(callback: Function, delay?: number, ...args: any[]) {
    return originalSetTimeout.call(
      this,
      function() {
        try {
          callback.apply(this, args);
        } catch (error: any) {
          const errorMessage = error?.message || String(error || '');
          if (
            errorMessage.includes('timeout exceeded') ||
            errorMessage.includes('FontFaceObserver')
          ) {
            console.warn('[Polyfill] Suppressed FontFaceObserver timeout in setTimeout (non-critical)');
            return; // Suppress the error
          }
          throw error; // Re-throw other errors
        }
      },
      delay,
      ...args
    );
  };
}

