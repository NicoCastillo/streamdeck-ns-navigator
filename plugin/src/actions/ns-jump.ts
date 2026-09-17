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
  const keys = sortedKeys();
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const link = links[i] ?? null;
    slots.set(key.id, link);
    await key.setTitle("");
    await key.setImage(link?.image ?? undefined);
  }
}

@action({ UUID: "com.nico.netsuite.navigator.nsjump" })
export class NsJump extends SingletonAction {
  constructor(private bridge: BridgeServer) {
    super();
    bridge.on("message", (msg) => {
      if (msg.type === "links") distributeLinks(msg.links);
    });
  }

  async onWillAppear(ev: WillAppearEvent) {
    if (!isKeyAction(ev.action)) return;
    keyRefs.set(ev.action.id, ev.action);
    slots.set(ev.action.id, null);
    await ev.action.setTitle("");
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
