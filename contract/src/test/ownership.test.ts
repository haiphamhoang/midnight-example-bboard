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

describe("BBoard - Ownership Verification", () => {
  describe("Single User Scenarios", () => {
    it("lets users verify ownership of their own messages", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      const message = "This is my message";
      const expiryTimestamp = generateValidExpiryTimestamp();
      simulator.post(message, expiryTimestamp);

      // User should be able to prove ownership of their own message
      const ownsMessage = simulator.provingOwnership(1n);
      expect(ownsMessage).toEqual(true);
    });

    it("fails to verify ownership of non-existent messages", () => {
      const simulator = new BBoardSimulator(generateRandomUserKey());
      simulator.post("A message", generateValidExpiryTimestamp());

      // Attempting to prove ownership of a non-existent message should throw an error
      expect(() => simulator.provingOwnership(99n)).toThrowError(
        "failed assert: Message does not exist",
      );
    });
  });

  describe("Multiple User Scenarios", () => {
    it("doesn't let users prove ownership of others' messages", () => {
      const user1Key = generateRandomUserKey();
      const user2Key = generateRandomUserKey();
      const simulator = new BBoardSimulator(user1Key);

      // User 1 posts a message
      simulator.post("User 1's message", generateValidExpiryTimestamp());

      // User 1 can prove ownership of their own message
      const user1OwnsMessage = simulator.provingOwnership(1n);
      expect(user1OwnsMessage).toEqual(true);

      // Switch to User 2
      simulator.switchUser(user2Key);

      // User 2 should NOT be able to prove ownership of User 1's message
      const user2OwnsMessage = simulator.provingOwnership(1n);
      expect(user2OwnsMessage).toEqual(false);
    });
  });
});