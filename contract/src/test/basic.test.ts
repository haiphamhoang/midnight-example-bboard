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
import { generateValidExpiryTimestamp, generateRandomUserKey } from "./test-utils.js";
import { State } from "../managed/bboard/contract/index.js";

setNetworkId("undeployed" as NetworkId);

describe("BBoard - Basic Functionality", () => {
  describe("Single User Scenarios", () => {
    it("generates initial ledger state deterministically", () => {
      const key = generateRandomUserKey();
      const simulator0 = new BBoardSimulator(key);
      const simulator1 = new BBoardSimulator(key);
      const ledger0 = simulator0.getLedger();
      const ledger1 = simulator1.getLedger();
      expect(ledger0.sequence).toEqual(ledger1.sequence);
      expect(ledger0.state).toEqual(ledger1.state);
      expect(ledger0.messageMap.size()).toEqual(ledger1.messageMap.size());
    });

    it("properly initializes ledger state and private state", () => {
      const key = generateRandomUserKey();
      const simulator = new BBoardSimulator(key);
      const initialLedgerState = simulator.getLedger();
      expect(initialLedgerState.sequence).toEqual(1n);
      expect(initialLedgerState.messageMap.size()).toEqual(0n);
      expect(initialLedgerState.state).toEqual(State.OPEN);
      expect(initialLedgerState.MAX_TOTAL_MESSAGES).toEqual(10n);
      expect(initialLedgerState.MAX_EXPIRATION_SECONDS).toEqual(86400n);
      const initialPrivateState = simulator.getPrivateState();
      expect(initialPrivateState).toEqual({ secretKey: key });
    });

    it("lets you set a message", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      const initialPrivateState = simulator.getPrivateState();
      const message =
        "Szeth-son-son-Vallano, Truthless of Shinovar, wore white on the day he was to kill a king";
      const expiryTimestamp = generateValidExpiryTimestamp();
      simulator.post(message, expiryTimestamp);
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
      expect(postedMessage.expiryTimestamp).toEqual(expiryTimestamp);
      expect(postedMessage.owner).toEqual(simulator.publicKey(1n));
      expect(ledgerState.state).toEqual(State.OPEN);
    });

    it("lets you take down a message", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      const initialPrivateState = simulator.getPrivateState();
      const message =
        "Prince Raoden of Arelon awoke early that morning, completely unaware that he had been damned for all eternity.";
      simulator.post(message, generateValidExpiryTimestamp());
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
      const simulator = new BBoardSimulator(generateRandomUserKey());
      const initialPrivateState = simulator.getPrivateState();
      simulator.post("Life before Death.", generateValidExpiryTimestamp());
      simulator.takeDown(1n);
      const message = "Strength before Weakness.";
      const expiryTimestamp = generateValidExpiryTimestamp();
      simulator.post(message, expiryTimestamp);
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
      expect(postedMessage.expiryTimestamp).toEqual(expiryTimestamp);
      expect(postedMessage.owner).toEqual(simulator.publicKey(2n));
      expect(ledgerState.state).toEqual(State.OPEN);
    });

    it("doesn't let you take down a non-existent message", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      simulator.post("A message", generateValidExpiryTimestamp());
      expect(() => simulator.takeDown(99n)).toThrow(
        "failed assert: Message id not found",
      );
    });

    it("closes the board when MAX_TOTAL_MESSAGES is reached", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      // MAX_TOTAL_MESSAGES is 10, so post 10 messages to close the board
      for (let i = 0; i < 10; i++) {
        simulator.post(`Message ${i + 1}`, generateValidExpiryTimestamp());
      }
      const ledgerState = simulator.getLedger();
      expect(ledgerState.messageMap.size()).toEqual(10n);
      expect(ledgerState.state).toEqual(State.CLOSED);
    });

    it("reopens the board when messages are taken down below MAX_TOTAL_MESSAGES", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      // Post 10 messages to close the board
      for (let i = 0; i < 10; i++) {
        simulator.post(`Message ${i + 1}`, generateValidExpiryTimestamp());
      }
      expect(simulator.getLedger().state).toEqual(State.CLOSED);

      // Take down one message to reopen the board
      simulator.takeDown(1n);
      const ledgerState = simulator.getLedger();
      expect(ledgerState.messageMap.size()).toEqual(9n);
      expect(ledgerState.state).toEqual(State.OPEN);
    });

    it("doesn't let you post when the board is closed", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      // Post 10 messages to close the board (MAX_TOTAL_MESSAGES is 10)
      for (let i = 0; i < 10; i++) {
        simulator.post(`Message ${i + 1}`, generateValidExpiryTimestamp());
      }
      expect(simulator.getLedger().state).toEqual(State.CLOSED);

      // Attempting to post when closed should fail
      expect(() =>
        simulator.post("This should fail", generateValidExpiryTimestamp()),
      ).toThrow("failed assert: Attempted to post message, but board is closed");
    });

    it("allows posting again after board reopens", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      // Post 10 messages to close the board (MAX_TOTAL_MESSAGES is 10)
      for (let i = 0; i < 10; i++) {
        simulator.post(`Message ${i + 1}`, generateValidExpiryTimestamp());
      }
      expect(simulator.getLedger().state).toEqual(State.CLOSED);

      // Take down two messages to reopen
      simulator.takeDown(1n);
      simulator.takeDown(2n);
      expect(simulator.getLedger().state).toEqual(State.OPEN);

      // Should be able to post again
      simulator.post("Posted after reopening", generateValidExpiryTimestamp());
      const ledgerState = simulator.getLedger();
      expect(ledgerState.messageMap.size()).toEqual(9n);
      expect(ledgerState.state).toEqual(State.OPEN);
    });
  });

  describe("Multiple User Scenarios", () => {
    it("lets a different user post a message after taking down the first", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      simulator.post(
        "Remember, the past need not become our future as well.",
        generateValidExpiryTimestamp(),
      );
      simulator.takeDown(1n);
      simulator.switchUser(generateRandomUserKey());
      const message = "Joy was more than just an absence of discomfort.";
      const expiryTimestamp = generateValidExpiryTimestamp();
      simulator.post(message, expiryTimestamp);
      const ledgerState = simulator.getLedger();
      expect(ledgerState.sequence).toEqual(3n);
      expect(ledgerState.messageMap.size()).toEqual(1n);
      const postedMessage = ledgerState.messageMap.lookup(2n);
      expect(postedMessage.id).toEqual(2n);
      expect(postedMessage.content.is_some).toEqual(true);
      expect(postedMessage.content.value).toEqual(message);
      expect(postedMessage.expiryTimestamp).toEqual(expiryTimestamp);
      expect(postedMessage.owner).toEqual(simulator.publicKey(2n));
      expect(ledgerState.state).toEqual(State.OPEN);
    });

    it("doesn't let users take down someone elses posts", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      simulator.post(
        "Sometimes a hypocrite is nothing more than a man in the process of changing.",
        generateValidExpiryTimestamp(),
      );
      simulator.switchUser(generateRandomUserKey());
      expect(() => simulator.takeDown(1n)).toThrow(
        "failed assert: Attempted to take down message, but not the current owner or message has not expired",
      );
    });
  });
});