import type { Response } from 'express';

type Client = { userId: string; res: Response };

const clients = new Set<Client>();

function formatEvent(event: string, data: unknown): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}

export function addRealtimeClient(userId: string, res: Response): () => void {
  const client: Client = { userId, res };
  clients.add(client);

  // Initial hello + keep-alive
  res.write(formatEvent('hello', { userId, at: new Date().toISOString() }));
  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      // ignore broken pipes — the close handler will clean up
    }
  }, 25_000);

  const cleanup = () => {
    clearInterval(keepAlive);
    clients.delete(client);
    try {
      res.end();
    } catch {
      // ignore
    }
  };

  return cleanup;
}

export function broadcastToUser(userId: string, event: string, data: unknown): void {
  const payload = formatEvent(event, data);
  for (const c of clients) {
    if (c.userId !== userId) continue;
    try {
      c.res.write(payload);
    } catch {
      // drop dead clients on the next tick
      clients.delete(c);
    }
  }
}

export function connectedClientCount(): number {
  return clients.size;
}

export function listConnectedUsers(): string[] {
  return Array.from(new Set(Array.from(clients).map((c) => c.userId)));
}
