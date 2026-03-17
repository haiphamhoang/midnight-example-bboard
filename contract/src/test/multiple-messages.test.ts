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
import {
  generateValidExpiryTimestamp,
  generateRandomUserKey,
} from "./test-utils.js";

setNetworkId("undeployed" as NetworkId);

describe("BBoard - Multiple Messages", () => {
  describe("Single User Scenarios", () => {
    it("lets users post multiple messages", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      simulator.post(
        "My name is Stephen Leeds, and I am perfectly sane. My hallucinations, however, are all quite mad.",
        generateValidExpiryTimestamp(),
      );
      simulator.post(
        "You should know by now that I've already had greatness. I traded it for mediocrity and some measure of sanity.",
        generateValidExpiryTimestamp(),
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

      // owner hash should be different for the two messages since they were posted in different transactions
      expect(firstMessage.owner).not.toEqual(secondMessage.owner);
    });

    it("lets you take down a specific message when multiple exist", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      simulator.post("First message", generateValidExpiryTimestamp());
      simulator.post("Second message", generateValidExpiryTimestamp());
      simulator.post("Third message", generateValidExpiryTimestamp());

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

    it("lets you post multiple messages up to MAX_TOTAL_MESSAGES limit", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      // Post 10 messages (MAX_TOTAL_MESSAGES is 10)
      for (let i = 0; i < 10; i++) {
        simulator.post(`Message ${i + 1}`, generateValidExpiryTimestamp());
      }
      const ledgerState = simulator.getLedger();
      expect(ledgerState.messageMap.size()).toEqual(10n);
      expect(ledgerState.sequence).toEqual(11n);
    });
  });

  describe("Multiple User Scenarios", () => {
    it("lets different users post multiple messages", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      simulator.post("Ash fell from the sky", generateValidExpiryTimestamp());
      simulator.switchUser(generateRandomUserKey());
      simulator.post(
        "I am, unfortunately, the hero of ages.",
        generateValidExpiryTimestamp(),
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

    it("lets multiple users post messages in sequence", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());

      // User 1 posts 3 messages
      simulator.post("User 1 - Message 1", generateValidExpiryTimestamp());
      simulator.post("User 1 - Message 2", generateValidExpiryTimestamp());
      simulator.post("User 1 - Message 3", generateValidExpiryTimestamp());

      // User 2 posts 2 messages
      simulator.switchUser(generateRandomUserKey());
      simulator.post("User 2 - Message 1", generateValidExpiryTimestamp());
      simulator.post("User 2 - Message 2", generateValidExpiryTimestamp());

      // User 3 posts 1 message
      simulator.switchUser(generateRandomUserKey());
      simulator.post("User 3 - Message 1", generateValidExpiryTimestamp());

      const ledgerState = simulator.getLedger();
      expect(ledgerState.messageMap.size()).toEqual(6n);
      expect(ledgerState.sequence).toEqual(7n);

      // Verify all messages exist
      expect(ledgerState.messageMap.member(1n)).toEqual(true);
      expect(ledgerState.messageMap.member(2n)).toEqual(true);
      expect(ledgerState.messageMap.member(3n)).toEqual(true);
      expect(ledgerState.messageMap.member(4n)).toEqual(true);
      expect(ledgerState.messageMap.member(5n)).toEqual(true);
      expect(ledgerState.messageMap.member(6n)).toEqual(true);
    });

    it("lets users take down their own messages when multiple exist", () => {
      const user1Key = generateRandomUserKey();
      const user2Key = generateRandomUserKey();
      const simulator = new BBoardSimulator(user1Key);

      // User 1 posts 2 messages
      simulator.post("User 1 - Message 1", generateValidExpiryTimestamp());
      simulator.post("User 1 - Message 2", generateValidExpiryTimestamp());

      // User 2 posts 2 messages
      simulator.switchUser(user2Key);
      simulator.post("User 2 - Message 1", generateValidExpiryTimestamp());
      simulator.post("User 2 - Message 2", generateValidExpiryTimestamp());

      // User 1 takes down their first message
      simulator.switchUser(user1Key);
      simulator.takeDown(1n);

      const ledgerState = simulator.getLedger();
      expect(ledgerState.messageMap.size()).toEqual(3n);
      expect(ledgerState.messageMap.member(1n)).toEqual(false);
      expect(ledgerState.messageMap.member(2n)).toEqual(true);
      expect(ledgerState.messageMap.member(3n)).toEqual(true);
      expect(ledgerState.messageMap.member(4n)).toEqual(true);
    });
  });
});
