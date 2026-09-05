import net from 'node:net';

import { logger } from '../logger.js';

/**
 * ClamAV INSTREAM client.
 *
 * Protocol: send "zINSTREAM\0", then a sequence of <4-byte big-endian length>
 * + chunk frames, then a zero-length frame. clamd replies with either
 * "stream: OK" or "stream: <signature> FOUND".
 *
 * Any transport failure resolves to INFECTED: an unreachable scanner must block
 * the upload, never wave it through.
 */
const CHUNK_SIZE = 64 * 1024;

export function createClamavScanner({ host, port, timeoutMs = 15_000 }) {
  return {
    name: 'clamav',

    scan(buffer) {
      return new Promise((resolve) => {
        const socket = net.createConnection({ host, port });
        let reply = '';
        let settled = false;

        const finish = (result) => {
          if (settled) return;
          settled = true;
          socket.destroy();
          resolve(result);
        };

        socket.setTimeout(timeoutMs, () => {
          logger.error({ host, port }, 'clamav scan timed out');
          finish({ status: 'INFECTED', signature: 'scanner-timeout' });
        });

        socket.on('error', (error) => {
          logger.error({ host, port, err: { message: error.message } }, 'clamav connection failed');
          finish({ status: 'INFECTED', signature: 'scanner-unavailable' });
        });

        socket.on('data', (chunk) => {
          reply += chunk.toString('utf8');
        });

        socket.on('end', () => {
          const text = reply.trim();
          if (text.endsWith('OK')) return finish({ status: 'CLEAN' });
          const match = text.match(/stream:\s+(.+)\s+FOUND/);
          return finish({ status: 'INFECTED', signature: match ? match[1] : 'unknown' });
        });

        socket.on('connect', () => {
          socket.write('zINSTREAM\0');
          for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
            const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
            const header = Buffer.alloc(4);
            header.writeUInt32BE(chunk.length, 0);
            socket.write(header);
            socket.write(chunk);
          }
          socket.write(Buffer.from([0, 0, 0, 0]));
        });
      });
    },
  };
}
