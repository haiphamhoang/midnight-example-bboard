# BBoard Test Suite

Modular test suite for the BBoard smart contract.

## Test Structure

### Test Modules

#### 1. Basic Functionality Tests ([`basic.test.ts`](basic.test.ts))
Tests covering core BBoard functionality:
- Single user scenarios (10 tests):
  - Deterministic ledger state generation
  - Initial state initialization
  - Posting and taking down messages
  - Board state management (open/close)
  - Maximum message limit enforcement
- Multiple user scenarios (2 tests):
  - Different users posting after message removal
  - Access control (preventing unauthorized takedowns)

#### 2. Multiple Messages Tests ([`multiple-messages.test.ts`](multiple-messages.test.ts))
Tests for handling multiple messages:
- Single user scenarios (3 tests):
  - Posting multiple messages
  - Taking down specific messages
  - Posting up to MAX_TOTAL_MESSAGES limit
- Multiple user scenarios (3 tests):
  - Different users posting multiple messages
  - Sequential posting by multiple users
  - Users taking down their own messages

#### 3. Expiry Timestamp Tests ([`expiry-timestamp.test.ts`](expiry-timestamp.test.ts))
Tests for expiry timestamp functionality:
- Single user scenarios (6 tests):
  - Storing expiry timestamps
  - Owner takedown regardless of expiry
  - Different expiry timestamps for different messages
  - Validation of expiry timestamp limits
  - Past expiry timestamp handling
- Multiple user scenarios (4 tests):
  - Non-owner access control
  - Different users with different expiry timestamps
  - Each user taking down their own messages
  - Multiple messages with varying expiry timestamps

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

# Run specific test by name
npm test -- -t "lets you set a message"
```

## Summary

- **Total Tests**: 28
- **Test Runner**: Vitest
- All tests are independent and can be run separately