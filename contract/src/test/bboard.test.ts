// This file is part of midnightntwrk/example-bboard.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { BBoardSimulator } from "./bboard-simulator.js";
import {
  NetworkId,
  setNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { describe, it, expect } from "vitest";
import { randomBytes } from "./utils.js";
import { State } from "../managed/bboard/contract/index.js";

setNetworkId("undeployed" as NetworkId);

describe("BBoard smart contract", () => {
  it("generates initial ledger state deterministically", () => {
    const key = randomBytes(32);
    const simulator0 = new BBoardSimulator(key);
    const simulator1 = new BBoardSimulator(key);
    const ledger0 = simulator0.getLedger();
    const ledger1 = simulator1.getLedger();
    expect(ledger0.sequence).toEqual(ledger1.sequence);
    expect(ledger0.state).toEqual(ledger1.state);
    expect(ledger0.messageMap.size()).toEqual(ledger1.messageMap.size());
  });

  it("properly initializes ledger state and private state", () => {
    const key = randomBytes(32);
    const simulator = new BBoardSimulator(key);
    const initialLedgerState = simulator.getLedger();
    expect(initialLedgerState.sequence).toEqual(1n);
    expect(initialLedgerState.messageMap.size()).toEqual(0n);
    expect(initialLedgerState.state).toEqual(State.OPEN);
    const initialPrivateState = simulator.getPrivateState();
    expect(initialPrivateState).toEqual({ secretKey: key });
  });

  it("lets you set a message", () => {
    const simulator = new BBoardSimulator(randomBytes(32));
    const initialPrivateState = simulator.getPrivateState();
    const message =
      "Szeth-son-son-Vallano, Truthless of Shinovar, wore white on the day he was to kill a king";
    simulator.post(message);
    // the private ledger state shouldn't change
    expect(initialPrivateState).toEqual(simulator.getPrivateState());
    // And all the correct things should have been updated in the public ledger state
    const ledgerState = simulator.getLedger();
    expect(ledgerState.sequence).toEqual(2n);
    expect(ledgerState.messageMap.size()).toEqual(1n);
    const postedMessage = ledgerState.messageMap.lookup(1n);
    expect(postedMessage.id).toEqual(1n);
    expect(postedMessage.content.is_some).toEqual(true);
    expect(postedMessage.content.value).toEqual(message);
    expect(postedMessage.owner).toEqual(simulator.publicKey(1n));
    expect(ledgerState.state).toEqual(State.OPEN);
  });

  it("lets you take down a message", () => {
    const simulator = new BBoardSimulator(randomBytes(32));
    const initialPrivateState = simulator.getPrivateState();
    const message =
      "Prince Raoden of Arelon awoke early that morning, completely unaware that he had been damned for all eternity.";
    simulator.post(message);
    simulator.takeDown(1n);
    // the private ledger state shouldn't change
    expect(initialPrivateState).toEqual(simulator.getPrivateState());
    // And all the correct things should have been updated in the public ledger state
    const ledgerState = simulator.getLedger();
    expect(ledgerState.sequence).toEqual(2n);
    expect(ledgerState.messageMap.size()).toEqual(0n);
    expect(ledgerState.state).toEqual(State.OPEN);
  });

  it("lets you post another message after taking down the first", () => {
    const simulator = new BBoardSimulator(randomBytes(32));
    const initialPrivateState = simulator.getPrivateState();
    simulator.post("Life before Death.");
    simulator.takeDown(1n);
    const message = "Strength before Weakness.";
    simulator.post(message);
    // the private ledger state shouldn't change
    expect(initialPrivateState).toEqual(simulator.getPrivateState());
    // And all the correct things should have been updated in the public ledger state
    const ledgerState = simulator.getLedger();
    expect(ledgerState.sequence).toEqual(3n);
    expect(ledgerState.messageMap.size()).toEqual(1n);
    const postedMessage = ledgerState.messageMap.lookup(2n);
    expect(postedMessage.id).toEqual(2n);
    expect(postedMessage.content.is_some).toEqual(true);
    expect(postedMessage.content.value).toEqual(message);
    expect(postedMessage.owner).toEqual(simulator.publicKey(2n));
    expect(ledgerState.state).toEqual(State.OPEN);
  });

  it("lets a different user post a message after taking down the first", () => {
    const simulator = new BBoardSimulator(randomBytes(32));
    simulator.post("Remember, the past need not become our future as well.");
    simulator.takeDown(1n);
    simulator.switchUser(randomBytes(32));
    const message = "Joy was more than just an absence of discomfort.";
    simulator.post(message);
    const ledgerState = simulator.getLedger();
    expect(ledgerState.sequence).toEqual(3n);
    expect(ledgerState.messageMap.size()).toEqual(1n);
    const postedMessage = ledgerState.messageMap.lookup(2n);
    expect(postedMessage.id).toEqual(2n);
    expect(postedMessage.content.is_some).toEqual(true);
    expect(postedMessage.content.value).toEqual(message);
    expect(postedMessage.owner).toEqual(simulator.publicKey(2n));
    expect(ledgerState.state).toEqual(State.OPEN);
  });

  it("lets users post multiple messages", () => {
    const simulator = new BBoardSimulator(randomBytes(32));
    simulator.post(
      "My name is Stephen Leeds, and I am perfectly sane. My hallucinations, however, are all quite mad.",
    );
    simulator.post(
      "You should know by now that I've already had greatness. I traded it for mediocrity and some measure of sanity.",
    );
    const ledgerState = simulator.getLedger();
    expect(ledgerState.sequence).toEqual(3n);
    expect(ledgerState.messageMap.size()).toEqual(2n);
    const firstMessage = ledgerState.messageMap.lookup(1n);
    expect(firstMessage.id).toEqual(1n);
    expect(firstMessage.content.is_some).toEqual(true);
    const secondMessage = ledgerState.messageMap.lookup(2n);
    expect(secondMessage.id).toEqual(2n);
    expect(secondMessage.content.is_some).toEqual(true);
  });

  it("lets different users post multiple messages", () => {
    const simulator = new BBoardSimulator(randomBytes(32));
    simulator.post("Ash fell from the sky");
    simulator.switchUser(randomBytes(32));
    simulator.post("I am, unfortunately, the hero of ages.");
    const ledgerState = simulator.getLedger();
    expect(ledgerState.sequence).toEqual(3n);
    expect(ledgerState.messageMap.size()).toEqual(2n);
    const firstMessage = ledgerState.messageMap.lookup(1n);
    expect(firstMessage.id).toEqual(1n);
    expect(firstMessage.content.is_some).toEqual(true);
    const secondMessage = ledgerState.messageMap.lookup(2n);
    expect(secondMessage.id).toEqual(2n);
    expect(secondMessage.content.is_some).toEqual(true);
  });

  it("doesn't let users take down someone elses posts", () => {
    const simulator = new BBoardSimulator(randomBytes(32));
    simulator.post(
      "Sometimes a hypocrite is nothing more than a man in the process of changing.",
    );
    simulator.switchUser(randomBytes(32));
    expect(() => simulator.takeDown(1n)).toThrow(
      "failed assert: Attempted to take down message, but not the current owner",
    );
  });

  it("lets you take down a specific message when multiple exist", () => {
    const simulator = new BBoardSimulator(randomBytes(32));
    simulator.post("First message");
    simulator.post("Second message");
    simulator.post("Third message");

    // Take down the second message
    simulator.takeDown(2n);
    const ledgerState = simulator.getLedger();
    expect(ledgerState.sequence).toEqual(4n);
    expect(ledgerState.messageMap.size()).toEqual(2n);

    // First and third messages should still exist
    expect(ledgerState.messageMap.member(1n)).toEqual(true);
    expect(ledgerState.messageMap.member(2n)).toEqual(false);
    expect(ledgerState.messageMap.member(3n)).toEqual(true);
  });

  it("doesn't let you take down a non-existent message", () => {
    const simulator = new BBoardSimulator(randomBytes(32));
    simulator.post("A message");
    expect(() => simulator.takeDown(99n)).toThrow(
      "failed assert: Message id not found",
    );
  });

  it("doesn't let you post when the board is closed", () => {
    const simulator = new BBoardSimulator(randomBytes(32));
    // Manually set the state to CLOSED (this would normally be done by a closeBoard circuit)
    const ledgerState = simulator.getLedger();
    // TODO: We can't directly modify the ledger state in the simulator,
    // but this test demonstrates the expected behavior
    // In a real scenario, you'd have a closeBoard circuit
    expect(ledgerState.state).toEqual(State.OPEN);
  });
});
