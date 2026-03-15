# API and CLI Multi-Post Implementation Plan

## Overview
Update the API and CLI layers to support the multi-post bulletin board contract that has already been implemented in the contract layer.

## Contract Analysis

### Updated Contract Structure (`contract/src/bboard.compact`)
The contract now supports multiple posts through:
- `messageMap: Map<Uint<64>, Message>` - Stores multiple messages with sequential IDs
- `sequence: Counter` - Generates sequential message IDs (1, 2, 3...)
- `post(newMessage: Opaque<"string">): []` - Posts a new message, auto-increments sequence
- `takeDown(messageId: Uint<64>): Opaque<"string">` - Takes down a specific message by ID
- `State.OPEN/CLOSED` - Board state (still relevant for posting restrictions)

### Message Structure
```compact
struct Message {
  id: Uint<64>,
  content: Maybe<Opaque<"string">>,
  owner: Bytes<32>
}
```

## Required Changes

### Phase 1: API Layer Updates (`api/src/`)

#### 1.1 Update `common-types.ts`

**Current Issues:**
- `BBoardDerivedState` has a single `message: string | undefined` field
- No support for multiple messages

**Required Changes:**
```typescript
export type Message = {
  id: bigint;
  content: string | undefined;
  owner: string; // hex-encoded
};

export type BBoardDerivedState = {
  readonly state: State;
  readonly sequence: bigint;
  readonly messages: Message[]; // Changed from single message
  readonly isOwner: (messageId: bigint) => boolean; // Function to check ownership per message
};
```

**Alternative Approach (Simpler):**
Keep the derived state simpler and compute ownership in the API:
```typescript
export type BBoardDerivedState = {
  readonly state: State;
  readonly sequence: bigint;
  readonly messages: Array<{
    id: bigint;
    content: string | undefined;
    owner: string;
    isOwner: boolean; // Pre-computed for current user
  }>;
};
```

#### 1.2 Update `index.ts`

**Current Issues:**
- `DeployedBBoardAPI.post()` takes a single message
- `DeployedBBoardAPI.takeDown()` takes no parameters (assumes single message)
- State derivation logic expects single message

**Required Changes:**

1. Update `DeployedBBoardAPI` interface:
```typescript
export interface DeployedBBoardAPI {
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<BBoardDerivedState>;

  post: (message: string) => Promise<void>; // Keep same signature
  takeDown: (messageId: bigint) => Promise<void>; // Add messageId parameter
}
```

2. Update `BBoardAPI` class:

   a. Update state derivation logic (lines 78-115):
   ```typescript
   this.state$ = combineLatest(
     [
       providers.publicDataProvider.contractStateObservable(this.deployedContractAddress, { type: 'latest' }).pipe(
         map((contractState) => BBoard.ledger(contractState.data)),
         tap((ledgerState) =>
           logger?.trace({
             ledgerStateChanged: {
               ledgerState: {
                 ...ledgerState,
                 state: ledgerState.state === BBoard.State.OPEN ? 'open' : 'closed',
                 messageCount: ledgerState.messageMap.size(),
               },
             },
           }),
         ),
       ),
       from(providers.privateStateProvider.get(bboardPrivateStateKey) as Promise<BBoardPrivateState>),
     ],
     (ledgerState, privateState) => {
       const hashedSecretKey = BBoard.pureCircuits.publicKey(
         privateState.secretKey,
         convertFieldToBytes(32, ledgerState.sequence, 'api/src/index.ts'),
       );

       // Convert messageMap to array with ownership info
       const messages: Array<{
         id: bigint;
         content: string | undefined;
         owner: string;
         isOwner: boolean;
       }> = [];

       // Iterate through messageMap using Symbol.iterator
       for (const [id, message] of ledgerState.messageMap) {
         messages.push({
           id: message.id,
           content: message.content.is_some ? message.content.value : undefined,
           owner: toHex(message.owner),
           isOwner: toHex(message.owner) === toHex(hashedSecretKey),
         });
       }

       return {
         state: ledgerState.state,
         sequence: ledgerState.sequence,
         messages,
       };
     },
   );
   ```

   b. Update `takeDown()` method (lines 159-171):
   ```typescript
   async takeDown(messageId: bigint): Promise<void> {
     this.logger?.info(`takingDownMessage: ${messageId}`);

     const txData = await this.deployedContract.callTx.takeDown(messageId);

     this.logger?.trace({
       transactionAdded: {
         circuit: 'takeDown',
         txHash: txData.public.txHash,
         blockHeight: txData.public.blockHeight,
       },
     });
   }
   ```

### Phase 2: CLI Layer Updates (`bboard-cli/src/index.ts`)

#### 2.1 Update Display Functions

**Current Issues:**
- `displayLedgerState()` shows single message
- `displayDerivedState()` shows single message
- No way to list all messages

**Required Changes:**

1. Update `displayLedgerState()` (lines 119-136):
```typescript
const displayLedgerState = async (
  providers: BBoardProviders,
  deployedBBoardContract: DeployedBBoardContract,
  logger: Logger,
): Promise<void> => {
  const contractAddress = deployedBBoardContract.deployTxData.public.contractAddress;
  const ledgerState = await getBBoardLedgerState(providers, contractAddress);
  if (ledgerState === null) {
    logger.info(`There is no bulletin board contract deployed at ${contractAddress}`);
  } else {
    const boardState = ledgerState.state === State.OPEN ? 'open' : 'closed';
    logger.info(`Current state is: '${boardState}'`);
    logger.info(`Current sequence is: ${ledgerState.sequence}`);
    logger.info(`Message count: ${ledgerState.messageMap.size()}`);

    // Display all messages
    const messageCount = ledgerState.messageMap.size();
    if (messageCount > 0n) {
      logger.info('Messages:');
      for (const [id, message] of ledgerState.messageMap) {
        const content = message.content.is_some ? message.content.value : 'none';
        logger.info(`  [${message.id}] ${content} (owner: ${toHex(message.owner)})`);
      }
    } else {
      logger.info('No messages posted');
    }
  }
};
```

2. Update `displayDerivedState()` (lines 158-169):
```typescript
const displayDerivedState = (ledgerState: BBoardDerivedState | undefined, logger: Logger) => {
  if (ledgerState === undefined) {
    logger.info(`No bulletin board state currently available`);
  } else {
    const boardState = ledgerState.state === State.OPEN ? 'open' : 'closed';
    logger.info(`Current state is: '${boardState}'`);
    logger.info(`Current sequence is: ${ledgerState.sequence}`);
    logger.info(`Message count: ${ledgerState.messages.length}`);

    if (ledgerState.messages.length > 0) {
      logger.info('Messages:');
      for (const message of ledgerState.messages) {
        const owner = message.isOwner ? 'you' : 'not you';
        const content = message.content ?? 'none';
        logger.info(`  [${message.id}] ${content} (owner: ${owner})`);
      }
    } else {
      logger.info('No messages posted');
    }
  }
};
```

#### 2.2 Update Main Loop

**Current Issues:**
- Menu option 1 posts a single message
- Menu option 2 takes down without specifying which message
- No way to view all messages

**Required Changes:**

1. Update `MAIN_LOOP_QUESTION` (lines 177-185):
```typescript
const MAIN_LOOP_QUESTION = `
You can do one of the following:
  1. Post a message
  2. Take down your message
  3. List all messages
  4. Display the current ledger state (known by everyone)
  5. Display the current private state (known only to this DApp instance)
  6. Display the current derived state (known only to this DApp instance)
  7. Exit
Which would you like to do? `;
```

2. Update `mainLoop()` switch statement (lines 199-224):
```typescript
switch (choice) {
  case '1': {
    const message = await rli.question(`What message do you want to post? `);
    await bboardApi.post(message);
    break;
  }
  case '2': {
    // Show user's messages and ask which to take down
    const userMessages = currentState?.messages.filter(m => m.isOwner) ?? [];
    if (userMessages.length === 0) {
      logger.info('You have no messages to take down');
    } else {
      logger.info('Your messages:');
      for (const msg of userMessages) {
        const content = msg.content ?? 'none';
        logger.info(`  [${msg.id}] ${content}`);
      }
      const messageIdStr = await rli.question(`Which message ID do you want to take down? `);
      const messageId = BigInt(messageIdStr);
      await bboardApi.takeDown(messageId);
    }
    break;
  }
  case '3': {
    // List all messages
    if (currentState && currentState.messages.length > 0) {
      logger.info('All messages:');
      for (const msg of currentState.messages) {
        const owner = msg.isOwner ? 'you' : 'not you';
        const content = msg.content ?? 'none';
        logger.info(`  [${msg.id}] ${content} (owner: ${owner})`);
      }
    } else {
      logger.info('No messages posted');
    }
    break;
  }
  case '4':
    await displayLedgerState(providers, bboardApi.deployedContract, logger);
    break;
  case '5':
    await displayPrivateState(providers, logger);
    break;
  case '6':
    displayDerivedState(currentState, logger);
    break;
  case '7':
    logger.info('Exiting...');
    return;
  default:
    logger.error(`Invalid choice: ${choice}`);
}
```

## Implementation Order

1. **API Layer First** (Foundation)
   - Update `common-types.ts` with new types
   - Update `BBoardAPI` state derivation logic
   - Update `takeDown()` method signature
   - Test API changes

2. **CLI Layer Second** (User Interface)
   - Update display functions
   - Update main loop menu
   - Add message listing functionality
   - Update take-down flow to select specific message
   - Test CLI changes

## Testing Strategy

### API Tests
- Verify state observable emits correct message array
- Verify ownership calculation is correct
- Verify `takeDown(messageId)` works with specific IDs

### CLI Tests
- Test posting multiple messages
- Test listing all messages
- Test taking down specific messages
- Test taking down only own messages
- Test display functions show all messages

## Potential Issues and Solutions

### Issue 1: Map Iteration ✅ RESOLVED
**Problem:** Need to determine how to iterate through the Compact-generated Map.

**Solution:** The generated Map API supports iteration via `[Symbol.iterator]()`. We can use `for (const [id, message] of ledgerState.messageMap)` to iterate through all entries.

### Issue 2: Message Gaps ✅ NOT AN ISSUE
**Problem:** If messages are taken down, there may be gaps in the sequence (e.g., messages 1, 3, 5 exist).

**Solution:** Not an issue. The Map iterator only returns existing entries, so we don't need to worry about gaps. We simply iterate through whatever messages exist.

### Issue 3: Backward Compatibility
**Problem:** Old contracts won't work with new API.

**Solution:** This is a breaking change. Users will need to deploy new contracts. Document this clearly.

## Success Criteria

- [ ] API can post multiple messages
- [ ] API can take down specific messages by ID
- [ ] API state observable returns array of messages with ownership info
- [ ] CLI can post multiple messages
- [ ] CLI can list all messages
- [ ] CLI can take down specific messages by ID
- [ ] CLI display functions show all messages
- [ ] All existing tests pass
- [ ] New tests added for multi-post functionality