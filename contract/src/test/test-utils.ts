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

import { randomBytes } from "./utils.js";

/**
 * Helper function to generate a valid expiry timestamp (within 24 hours in the future)
 */
export const generateValidExpiryTimestamp = (): bigint => {
  // Current timestamp in seconds + 12 hours (well within 24 hours limit)
  const now = Math.floor(Date.now() / 1000);
  return BigInt(now + 43200);
};

/**
 * Helper function to generate an invalid expiry timestamp (more than 24 hours in the future)
 */
export const generateInvalidExpiryTimestamp = (): bigint => {
  const now = Math.floor(Date.now() / 1000);
  // 24h + 1h + 1h = 26h in the future
  return BigInt(now + 86400 + 3600 + 3600);
};

/**
 * Helper function to generate a past expiry timestamp
 */
export const generatePastExpiryTimestamp = (): bigint => {
  const now = Math.floor(Date.now() / 1000);
  // 1 hour in the past
  return BigInt(now - 3600);
};

/**
 * Helper function to generate a random user key
 */
export const generateRandomUserKey = () => randomBytes(32);