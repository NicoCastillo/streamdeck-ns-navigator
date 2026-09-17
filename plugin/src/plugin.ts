import streamDeck from "@elgato/streamdeck";
import { NsJump } from "./actions/ns-jump";
import { BridgeServer } from "./bridge";

const bridge = new BridgeServer(9999);
streamDeck.actions.registerAction(new NsJump(bridge));
streamDeck.connect();
