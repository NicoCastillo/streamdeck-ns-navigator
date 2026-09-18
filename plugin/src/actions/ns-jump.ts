import {
  action,
  KeyAction,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { BridgeLink, BridgeServer } from "../bridge";

const slots = new Map<string, BridgeLink | null>();
const keyRefs = new Map<string, KeyAction>();
let lastLinks: BridgeLink[] = [];

function isKeyAction(action: unknown): action is KeyAction {
  return typeof action === "object" && action !== null && "coordinates" in action;
}

function sortedKeys(): KeyAction[] {
  return [...keyRefs.values()].sort((a, b) => {
    const ac = a.coordinates ?? { row: 0, column: 0 };
    const bc = b.coordinates ?? { row: 0, column: 0 };
    return ac.row !== bc.row ? ac.row - bc.row : ac.column - bc.column;
  });
}

async function distributeLinks(links: BridgeLink[]) {
  lastLinks = links;
  const keys = sortedKeys();
  console.log(`[NsJump] distributeLinks: ${links.length} links, ${keys.length} keys`);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const link = links[i] ?? null;
    slots.set(key.id, link);
    try {
      if (link) {
        await key.setTitle("");
        if (link.image) await key.setImage(link.image);
      } else {
        await key.setTitle("");
        await key.setImage(undefined);
      }
    } catch (e) {
      console.error(`[NsJump] failed to update key ${i}:`, e);
    }
  }
}

@action({ UUID: "com.nico.netsuite.navigator.nsjump" })
export class NsJump extends SingletonAction {
  constructor(private bridge: BridgeServer) {
    super();
    bridge.on("message", (msg) => {
      if (msg.type === "links") {
        distributeLinks(msg.links).catch((e) =>
          console.error("[NsJump] distributeLinks error:", e)
        );
      }
    });
  }

  async onWillAppear(ev: WillAppearEvent) {
    if (!isKeyAction(ev.action)) return;
    keyRefs.set(ev.action.id, ev.action);
    slots.set(ev.action.id, null);
    console.log(`[NsJump] onWillAppear: ${ev.action.id} (total keys: ${keyRefs.size})`);
    await ev.action.setTitle("");
    if (lastLinks.length > 0) {
      distributeLinks(lastLinks).catch((e) =>
        console.error("[NsJump] re-distribute error:", e)
      );
    }
  }

  onWillDisappear(ev: WillDisappearEvent) {
    keyRefs.delete(ev.action.id);
    slots.delete(ev.action.id);
  }

  onKeyDown(ev: KeyDownEvent) {
    const link = slots.get(ev.action.id);
    if (link) this.bridge.send({ type: "navigate", url: link.url });
  }
}
