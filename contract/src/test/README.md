# BBoard Test Suite

Modular test suite for the BBoard smart contract.

## Contract Features

### Private State
- **`messageOwner`** - Private ledger mapping message IDs to owner public keys (Bytes<32>), enabling ownership verification without revealing identity

### Circuit Functions
- **`post(newMessage, expiryTimestamp)`** - Posts a new message and records the owner's public key
- **`takeDown(messageId)`** - Removes a message if caller is the owner or message has expired
- **`provingOwnership(messageId)`** - Returns true if caller owns the specified message, false otherwise
- **`publicKey(sk, sequence)`** - Derives a public key from secret key and message sequence

## Test Structure

### Test Modules

#### 1. Basic Functionality Tests ([`basic.test.ts`](basic.test.ts))
Tests covering core BBoard functionality:
- Single user scenarios (5 tests):
  - Deterministic ledger state generation
  - Initial state initialization
  - Posting and taking down messages
  - Board state management (open/close)
  - Maximum message limit enforcement
- Multiple user scenarios (1 tests):
  - Non-owner user can not take down others messages (preventing unauthorized takedowns)

#### 2. Multiple Messages Tests ([`multiple-messages.test.ts`](multiple-messages.test.ts))
Tests for handling multiple messages:
- Multiple user scenarios (2 tests):
  - Different users posting multiple messages

#### 3. Expiry Timestamp Tests ([`expiry-timestamp.test.ts`](expiry-timestamp.test.ts))
Tests for expiry timestamp functionality:
- Single user scenarios (3 tests):
  - Different expiry timestamps for different messages
  - Validation of expiry timestamp limits
  - Past expiry timestamp handling
- Multiple user scenarios (2 tests):
  - Non-owner user can not take down non-expired messages
  - Any user can take down expired messages

#### 4. Ownership Verification Tests ([`ownership.test.ts`](ownership.test.ts))
Tests for message ownership verification:
- Single user scenarios (2 tests):
  - Verifying ownership of own messages
  - Failing to verify ownership of non-existent messages
- Multiple user scenarios (1 tests):
  - Users cannot prove ownership of others' messages

### Shared Utilities
- **[`test-utils.ts`](test-utils.ts)** - Common helper functions:
  - `generateValidExpiryTimestamp()` - Generates a valid expiry timestamp (within 24 hours)
  - `generateInvalidExpiryTimestamp()` - Generates an invalid expiry timestamp (beyond 24 hours)
  - `generatePastExpiryTimestamp()` - Generates a past expiry timestamp
  - `generateRandomUserKey()` - Generates a random user key

## Running Tests

```bash
# Run all tests
npm test

# Run specific test module
npm test -- basic.test.ts
npm test -- multiple-messages.test.ts
npm test -- expiry-timestamp.test.ts
npm test -- ownership.test.ts

# Run specific test by name
npm test -- -t "lets you set a message"
```
