import { EventEmitter } from "node:events";
import { WebSocketServer, WebSocket } from "ws";

export type BridgeLink = {
  label: string;
  url: string;
  image?: string;
};

export type BridgeMessage =
  | { type: "links"; recordType: string; recordId: string; links: BridgeLink[] }
  | { type: "navigate"; url: string };

export class BridgeServer extends EventEmitter {
  private wss: WebSocketServer;
  private client: WebSocket | null = null;

  constructor(port: number) {
    super();
    this.wss = new WebSocketServer({ port, host: "127.0.0.1" });
    this.wss.on("connection", (ws) => {
      this.client = ws;
      ws.on("message", (raw) => {
        try {
          this.emit("message", JSON.parse(raw.toString()) as BridgeMessage);
        } catch {}
      });
      ws.on("close", () => {
        if (this.client === ws) this.client = null;
      });
    });
    this.wss.on("listening", () =>
      console.log(`[Bridge] listening on ws://127.0.0.1:${port}`)
    );
  }

  send(data: BridgeMessage) {
    if (this.client?.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(data));
    }
  }
}
