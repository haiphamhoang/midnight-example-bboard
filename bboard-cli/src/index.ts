// This file is part of midnightntwrk/example-counter.
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

/*`
 * This file is the main driver for the Midnight bulletin board example.
 * The entry point is the run function, at the end of the file.
 * We expect the startup files (testnet-remote.ts, standalone.ts, etc.) to
 * call run with some specific configuration that sets the network addresses
 * of the servers this file relies on.
 */

import { createInterface, type Interface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import {
  BBoardAPI,
  type BBoardDerivedState,
  bboardPrivateStateKey,
  type BBoardProviders,
  type DeployedBBoardContract,
  type PrivateStateId,
} from '../../api/src/index';
import { type WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { ledger, type Ledger, State } from '../../contract/src/managed/bboard/contract/index.js';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { type Logger } from 'pino';
import { type Config, StandaloneConfig } from './config.js';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { assertIsContractAddress, toHex } from '@midnight-ntwrk/midnight-js-utils';
import { TestEnvironment } from '@midnight-ntwrk/testkit-js';
import { MidnightWalletProvider } from './midnight-wallet-provider';
import { randomBytes } from '../../api/src/utils';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v7';
import { syncWallet, waitForUnshieldedFunds } from './wallet-utils';
import { generateDust } from './generate-dust';
import { BBoardPrivateState } from '@midnight-ntwrk/bboard-contract';

// @ts-expect-error: It's needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

/* **********************************************************************
 * Helper functions for Unix timestamp handling
 */

/**
 * Converts a human-readable duration string to seconds.
 * Supports formats like: "1h", "24h", "1d", "7d", "1w", "30m", etc.
 * @param durationStr The duration string (e.g., "24h", "1d", "30m")
 * @returns The duration in seconds
 */
const parseDurationToSeconds = (durationStr: string): number => {
  const trimmed = durationStr.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)\s*([smhdw])$/);

  if (!match) {
    throw new Error(`Invalid duration format: ${durationStr}. Use format like "24h", "1d", "30m", etc.`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1, // seconds
    m: 60, // minutes
    h: 3600, // hours
    d: 86400, // days
    w: 604800, // weeks
  };

  return value * multipliers[unit];
};

/**
 * Calculates a Unix timestamp for a future time based on a duration string.
 * @param durationStr The duration string (e.g., "24h", "1d", "30m")
 * @returns The Unix timestamp (seconds since epoch) for the expiry time
 */
const calculateExpiryTimestamp = (durationStr: string): bigint => {
  const seconds = parseDurationToSeconds(durationStr);
  const now = Math.floor(Date.now() / 1000);
  return BigInt(now + seconds);
};

/**
 * Formats a Unix timestamp to a human-readable date string.
 * @param timestamp The Unix timestamp in seconds
 * @returns A formatted date string (e.g., "2025-03-16 15:30:00 UTC")
 */
const formatTimestamp = (timestamp: bigint): string => {
  const date = new Date(Number(timestamp) * 1000);
  return date.toUTCString();
};

/**
 * Formats a Unix timestamp to show relative time from now.
 * @param timestamp The Unix timestamp in seconds
 * @returns A string showing relative time (e.g., "in 2 hours", "5 minutes ago")
 */
const formatRelativeTime = (timestamp: bigint): string => {
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(timestamp) - now;
  const absDiff = Math.abs(diff);

  const intervals = [
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
    { label: 'second', seconds: 1 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(absDiff / interval.seconds);
    if (count >= 1) {
      const plural = count > 1 ? 's' : '';
      if (diff > 0) {
        return `in ${count} ${interval.label}${plural}`;
      } else {
        return `${count} ${interval.label}${plural} ago`;
      }
    }
  }

  return 'now';
};

/* **********************************************************************
 * getBBoardLedgerState: a helper that queries the current state of
 * the data on the ledger, for a specific bulletin board contract.
 * Note that the Ledger type returned here is not some generic,
 * abstract ledger object, but specifically the type generated by
 * the Compact compiler to correspond to the ledger declaration
 * in the bulletin board contract.
 */

export const getBBoardLedgerState = async (
  providers: BBoardProviders,
  contractAddress: ContractAddress,
): Promise<Ledger | null> => {
  assertIsContractAddress(contractAddress);
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  return contractState != null ? ledger(contractState.data) : null;
};
// providers.publicDataProvider
//   .queryContractState(contractAddress)
//   .then((contractState) => (contractState != null ? ledger(contractState.data) : null));

/* **********************************************************************
 * deployOrJoin: returns a contract, by prompting the user about
 * whether to deploy a new one or join an existing one and then
 * calling the appropriate helper.
 */

const DEPLOY_OR_JOIN_QUESTION = `
You can do one of the following:
  1. Deploy a new bulletin board contract
  2. Join an existing bulletin board contract
  3. Exit
Which would you like to do? `;

const deployOrJoin = async (providers: BBoardProviders, rli: Interface, logger: Logger): Promise<BBoardAPI | null> => {
  let api: BBoardAPI | null = null;

  while (true) {
    const choice = await rli.question(DEPLOY_OR_JOIN_QUESTION);
    switch (choice) {
      case '1':
        api = await BBoardAPI.deploy(providers, logger);
        logger.info(`Deployed contract at address: ${api.deployedContractAddress}`);
        return api;
      case '2':
        api = await BBoardAPI.join(providers, await rli.question('What is the contract address (in hex)? '), logger);
        logger.info(`Joined contract at address: ${api.deployedContractAddress}`);
        return api;
      case '3':
        logger.info('Exiting...');
        return null;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

/* **********************************************************************
 * displayLedgerState: shows the values of each of the fields declared
 * by the contract to be in the ledger state of the bulletin board.
 */

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
    logger.info(`Max messages: ${ledgerState.MAX_TOTAL_MESSAGES}`);
    logger.info(`Max expiration seconds: ${ledgerState.MAX_EXPIRATION_SECONDS}`);
    logger.info(`Message count: ${ledgerState.messageMap.size()}`);

    // Display all messages
    if (ledgerState.messageMap.size() === 0n) {
      logger.info(`No messages posted yet`);
    } else {
      logger.info(`Messages:`);
      for (const [, message] of ledgerState.messageMap) {
        const content = message.content.is_some ? message.content.value : 'none';
        const expiryDate = formatTimestamp(message.expiryTimestamp);
        const relativeTime = formatRelativeTime(message.expiryTimestamp);
        logger.info(
          `  [${message.id}] ${content} (expires: ${expiryDate} (${relativeTime}), owner: ${toHex(message.owner)})`,
        );
      }
    }
  }
};

/* **********************************************************************
 * displayPrivateState: shows the hex-formatted value of the secret key.
 */

const displayPrivateState = async (providers: BBoardProviders, logger: Logger): Promise<void> => {
  const privateState = await providers.privateStateProvider.get(bboardPrivateStateKey);
  if (privateState === null) {
    logger.info(`There is no existing bulletin board private state`);
  } else {
    logger.info(`Current secret key is: ${toHex(privateState.secretKey)}`);
  }
};

/* **********************************************************************
 * displayDerivedState: shows the values of derived state which is made
 * by combining the ledger state with private state. In this example, the
 * derived state compares the owner's key with the private secret key to
 * determine if the current user is the owner of each message.
 */

const displayDerivedState = (ledgerState: BBoardDerivedState | undefined, logger: Logger) => {
  if (ledgerState === undefined) {
    logger.info(`No bulletin board state currently available`);
  } else {
    const boardState = ledgerState.state === State.OPEN ? 'open' : 'closed';
    logger.info(`Current state is: '${boardState}'`);
    logger.info(`Current sequence is: ${ledgerState.sequence}`);
    logger.info(`Remaining message capacity: ${ledgerState.maxMessages - BigInt(ledgerState.messages.length)}`);
    logger.info(`Max expiration seconds: ${ledgerState.maxExpirationSeconds}`);

    // Display all messages with ownership info
    if (ledgerState.messages.length === 0) {
      logger.info(`No messages posted yet`);
    } else {
      logger.info(`Messages:`);
      for (const msg of ledgerState.messages) {
        const content = msg.content ?? 'none';
        const owner = msg.isOwner ? 'you' : 'not you';
        const expiryDate = formatTimestamp(msg.expiryTimestamp);
        const relativeTime = formatRelativeTime(msg.expiryTimestamp);
        logger.info(`  [${msg.id}] ${content} (expires: ${expiryDate} (${relativeTime}), owner: ${owner})`);
      }
    }
  }
};

/* **********************************************************************
 * mainLoop: the main interactive menu of the bulletin board CLI.
 * Before starting the loop, the user is prompted to deploy a new
 * contract or join an existing one.
 */

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

const mainLoop = async (providers: BBoardProviders, rli: Interface, logger: Logger): Promise<void> => {
  const bboardApi = await deployOrJoin(providers, rli, logger);
  if (bboardApi === null) {
    return;
  }
  let currentState: BBoardDerivedState | undefined;
  const stateObserver = {
    next: (state: BBoardDerivedState) => (currentState = state),
  };
  const subscription = bboardApi.state$.subscribe(stateObserver);
  try {
    while (true) {
      const choice = await rli.question(MAIN_LOOP_QUESTION);
      switch (choice) {
        case '1': {
          const message = await rli.question(`What message do you want to post? `);
          const durationStr = await rli.question(`How long should the message be visible? (e.g., "24h", "1d", "30m") `);
          try {
            const expiryTimestamp = calculateExpiryTimestamp(durationStr);
            logger.info(
              `Message will expire at: ${formatTimestamp(expiryTimestamp)} (${formatRelativeTime(expiryTimestamp)})`,
            );
            await bboardApi.post(message, expiryTimestamp);
          } catch (error) {
            logger.error(`Invalid duration format: ${error instanceof Error ? error.message : String(error)}`);
          }
          break;
        }
        case '2': {
          // Show user's messages and ask which to take down
          const userMessages = currentState?.messages.filter((m) => m.isOwner) ?? [];
          if (userMessages.length === 0) {
            logger.info('You have no messages to take down');
          } else {
            logger.info('Your messages:');
            for (const msg of userMessages) {
              const content = msg.content ?? 'none';
              const expiryDate = formatTimestamp(msg.expiryTimestamp);
              const relativeTime = formatRelativeTime(msg.expiryTimestamp);
              logger.info(`  [${msg.id}] ${content} (expires: ${expiryDate} (${relativeTime}))`);
            }
            const messageIdStr = await rli.question(`Which message ID do you want to take down? `);
            const messageId = BigInt(messageIdStr);
            await bboardApi.takeDown(messageId);
          }
          break;
        }
        case '3': {
          // List all messages
          if (currentState === undefined) {
            logger.info('No bulletin board state currently available');
          } else if (currentState.messages.length === 0) {
            logger.info('No messages posted yet');
          } else {
            logger.info('All messages:');
            for (const msg of currentState.messages) {
              const content = msg.content ?? 'none';
              const owner = msg.isOwner ? 'you' : 'not you';
              const expiryDate = formatTimestamp(msg.expiryTimestamp);
              const relativeTime = formatRelativeTime(msg.expiryTimestamp);
              logger.info(`  [${msg.id}] ${content} (expires: ${expiryDate} (${relativeTime}), owner: ${owner})`);
            }
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
    }
  } finally {
    // While we allow errors to bubble up to the 'run' function, we will always need to dispose of the state
    // subscription when we exit.
    subscription.unsubscribe();
  }
};

/* ***********************************************************************
 * This seed gives access to tokens minted in the genesis block of a local development node - only
 * used in standalone networks to build a wallet with initial funds.
 */
const GENESIS_MINT_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

/* **********************************************************************
 * buildWallet: unless running in a standalone (offline) mode,
 * prompt the user to tell us whether to create a new wallet
 * or recreate one from a prior seed.
 */

const WALLET_LOOP_QUESTION = `
You can do one of the following:
  1. Build a fresh wallet
  2. Build wallet from a seed
  3. Build wallet from wallet.txt file
  4. Exit
Which would you like to do? `;

const buildWallet = async (config: Config, rli: Interface, logger: Logger): Promise<string | undefined> => {
  if (config instanceof StandaloneConfig) {
    return GENESIS_MINT_WALLET_SEED;
  }
  while (true) {
    const choice = await rli.question(WALLET_LOOP_QUESTION);
    switch (choice) {
      case '1':
        return toHex(randomBytes(32));
      case '2':
        return await rli.question('Enter your wallet seed: ');
      case '3': {
        const walletFile = 'wallet.txt';
        const walletData = await readFile(walletFile, 'utf8');
        return walletData;
      }
      case '4':
        logger.info('Exiting...');
        return undefined;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

/* **********************************************************************
 * run: the main entry point that starts the whole bulletin board CLI.
 *
 * If called with a Docker environment argument, the application
 * will wait for Docker to be ready before doing anything else.
 */

export const run = async (config: Config, testEnv: TestEnvironment, logger: Logger): Promise<void> => {
  const rli = createInterface({ input, output, terminal: true });
  const providersToBeStopped: MidnightWalletProvider[] = [];
  try {
    const envConfiguration = await testEnv.start();
    logger.info(`Environment started with configuration: ${JSON.stringify(envConfiguration)}`);
    const seed = await buildWallet(config, rli, logger);
    if (seed === undefined) {
      return;
    }
    const walletProvider = await MidnightWalletProvider.build(logger, envConfiguration, seed);
    providersToBeStopped.push(walletProvider);
    const walletFacade: WalletFacade = walletProvider.wallet;

    await walletProvider.start();

    const unshieldedState = await waitForUnshieldedFunds(
      logger,
      walletFacade,
      envConfiguration,
      unshieldedToken(),
      config.requestFaucetTokens,
    );
    const nightBalance = unshieldedState.balances[unshieldedToken().raw];
    if (nightBalance === undefined) {
      logger.info('No funds received, exiting...');
      return;
    }
    logger.info(`Your NIGHT wallet balance is: ${nightBalance}`);

    if (config.generateDust) {
      const dustGeneration = await generateDust(logger, seed, unshieldedState, walletFacade);
      if (dustGeneration) {
        logger.info(`Submitted dust generation registration transaction: ${dustGeneration}`);
        await syncWallet(logger, walletFacade);
      }
    }

    const zkConfigProvider = new NodeZkConfigProvider<'post' | 'takeDown'>(config.zkConfigPath);
    const providers: BBoardProviders = {
      privateStateProvider: levelPrivateStateProvider<PrivateStateId, BBoardPrivateState>({
        privateStateStoreName: config.privateStateStoreName,
        signingKeyStoreName: `${config.privateStateStoreName}-signing-keys`,
        privateStoragePasswordProvider: () => {
          return 'key-just-for-testing-here!';
        },
      }),
      publicDataProvider: indexerPublicDataProvider(envConfiguration.indexer, envConfiguration.indexerWS),
      zkConfigProvider: zkConfigProvider,
      proofProvider: httpClientProofProvider(envConfiguration.proofServer, zkConfigProvider),
      walletProvider: walletProvider,
      midnightProvider: walletProvider,
    };
    await mainLoop(providers, rli, logger);
  } catch (e) {
    logError(logger, e);
    logger.info('Exiting...');
  } finally {
    try {
      rli.close();
      rli.removeAllListeners();
    } catch (e) {
      logError(logger, e);
    } finally {
      try {
        for (const wallet of providersToBeStopped) {
          logger.info('Stopping wallet...');
          await wallet.stop();
        }
        if (testEnv) {
          logger.info('Stopping test environment...');
          await testEnv.shutdown();
        }
      } catch (e) {
        logError(logger, e);
      }
    }
  }
};

function logError(logger: Logger, e: unknown) {
  if (e instanceof Error) {
    logger.error(`Found error '${e.message}'`);
    logger.debug(`${e.stack}`);
  } else {
    logger.error(`Found error (unknown type)`);
  }
}
