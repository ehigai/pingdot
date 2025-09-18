import { Socket as IOSocket } from 'socket.io';

declare module 'socket.io' {
  interface Socket {
    user?: {
      sub: string;
      email: string;
    };
  }
}
