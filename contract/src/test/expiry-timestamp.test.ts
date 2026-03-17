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
  generateInvalidExpiryTimestamp,
  generatePastExpiryTimestamp,
  generateRandomUserKey,
} from "./test-utils.js";

setNetworkId("undeployed" as NetworkId);

describe("BBoard - Expiry Timestamp Functionality", () => {
  describe("Single User Scenarios", () => {
    it("stores different expiry timestamps for different messages", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      const expiry1 = generateValidExpiryTimestamp();
      const expiry2 = generateValidExpiryTimestamp() + 3600n; // 1 hour later

      simulator.post("First message", expiry1);
      simulator.post("Second message", expiry2);

      const ledgerState = simulator.getLedger();
      const message1 = ledgerState.messageMap.lookup(1n);
      const message2 = ledgerState.messageMap.lookup(2n);

      expect(message1.expiryTimestamp).toEqual(expiry1);
      expect(message2.expiryTimestamp).toEqual(expiry2);
    });

    it("doesn't let you post with expiry timestamp too far in the future", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      const invalidExpiry = generateInvalidExpiryTimestamp();

      expect(() => simulator.post("This should fail", invalidExpiry)).toThrow(
        "failed assert: Expiry Timestamp must be within 24 hours from current block time",
      );
    });

    it("lets you post with expiry timestamp in the past", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      const pastExpiry = generatePastExpiryTimestamp();
      const message = "This should succeed";
      // Posting with past expiry should succeed (no assert for past expiry, only future)
      simulator.post(message, pastExpiry);
      const ledgerState = simulator.getLedger();
      const postedMessage = ledgerState.messageMap.lookup(1n);
      expect(postedMessage.content.value).toEqual(message);
      expect(postedMessage.expiryTimestamp).toEqual(pastExpiry);
    });
  });

  describe("Multiple User Scenarios", () => {
    it("doesn't let non-owner take down non-expired messages", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      const message = "This message is not expired";
      const validExpiryTimestamp = generateValidExpiryTimestamp();
      simulator.post(message, validExpiryTimestamp);

      // Switch to a different user
      simulator.switchUser(generateRandomUserKey());

      // Different user should NOT be able to take down the non-expired message
      expect(() => simulator.takeDown(1n)).toThrow(
        "failed assert: Attempted to take down message, but not the current owner or message has not expired",
      );
    });

    it("lets any user remove expired messages", () => {
      const user1Key = generateRandomUserKey();
      const user2Key = generateRandomUserKey();
      const simulator = new BBoardSimulator(user1Key);

      // User 1 posts a message with past expiry (already expired)
      const pastExpiry = generatePastExpiryTimestamp();
      simulator.post("Expired message from user 1", pastExpiry);
      simulator.post(
        "Valid message from user 1",
        generateValidExpiryTimestamp(),
      );

      // User 2 (not the owner) should be able to take down the expired message
      simulator.switchUser(user2Key);
      simulator.takeDown(1n);

      const ledgerState = simulator.getLedger();
      expect(ledgerState.messageMap.size()).toEqual(1n);
      expect(ledgerState.messageMap.member(1n)).toEqual(false);
      expect(ledgerState.messageMap.member(2n)).toEqual(true);
    });
  });
});
