import {
  type AccountAddress,
  Hex,
  type TypeTag,
  type MoveModule,
  type MoveModuleBytecode,
  type Aptos,
  type Account,
  MoveVector,
  type UserTransactionResponse,
  ParsingError,
  type AnyNumber,
  type AptosConfig,
  type ProcessorType,
  type GetProcessorStatusResponse,
  type GraphqlQuery,
  postAptosIndexer,
} from "@aptos-labs/ts-sdk";
import pako from "pako";
import fs from "fs";
import path from "path";
import { type CaseStyles } from "./code-gen/config";
import { toClassString, toTypeTagEnum } from "./code-gen/typeTags";

export const FUND_AMOUNT = 100_000_000;

export function toPascalCase(input: string): string {
  return input
    .split("_")
    .filter((s) => s.length > 0)
    .map((s) => s[0].toUpperCase() + s.slice(1).toLowerCase())
    .join("");
}

export function toCamelCase(input: string): string {
  const pascalCase = toPascalCase(input);
  return pascalCase[0].toLowerCase() + pascalCase.slice(1);
}

export function toCased(input: string, variableCase: CaseStyles): string {
  switch (variableCase) {
    case "camelCase":
      return toCamelCase(input);
    case "snake_case":
      return input.toLowerCase();
    case "UPPER_CASE":
      return input.toUpperCase();
    case "PascalCase":
      return toPascalCase(input);
    default:
      throw new Error(`Unknown case style: ${variableCase}`);
  }
}

/**
 * Convert a module source code in gzipped hex string to plain text
 * @param source module source code in gzipped hex string
 * @returns original source code in plain text
 */
export function transformCode(source: string): string {
  try {
    return pako.ungzip(Hex.fromHexInput(source).toUint8Array(), {
      to: "string",
    });
  } catch (e) {
    if (e instanceof ParsingError) {
      if (e.message.includes("Hex string is too short")) {
        return "";
      }
    }
    throw e;
  }
}

export async function fetchModuleABIs(aptos: Aptos, accountAddress: AccountAddress) {
  try {
    await aptos.getAccountInfo({ accountAddress });
  } catch (e) {
    /* eslint-disable-next-line no-console */
    console.error(
      `Couldn't find account ${accountAddress.toString()} on network "${aptos.config.network}".`,
    );
    return [];
  }
  const moduleABIs = await aptos.getAccountModules({
    accountAddress,
  });
  return moduleABIs;
}

export function isAbiDefined(
  obj: MoveModuleBytecode,
): obj is { bytecode: string; abi: MoveModule } {
  return obj.abi !== undefined;
}

export function toClassesString(typeTags: Array<TypeTag>): string {
  if (typeTags.length === 0) {
    return "";
  }
  if (typeTags.length === 1) {
    const typeTagEnum = toTypeTagEnum(typeTags[0]);
    return toClassString(typeTagEnum);
  }
  let typeTagString = toClassString(toTypeTagEnum(typeTags[typeTags.length - 1]));
  for (let i = typeTags.length - 2; i >= 0; i -= 1) {
    const typeTagEnum = toTypeTagEnum(typeTags[i]);
    typeTagString = `${toClassString(typeTagEnum)}<${typeTagString}>`;
  }
  return typeTagString;
}

export function truncateAddressForFileName(address: AccountAddress) {
  const addressString = address.toString();
  return `Module_0x${addressString.slice(2, 8)}` as const;
}

export function alphabetIndexToLetter(num: number): string {
  // Check if the number corresponds to the letters in the English alphabet
  if (num < 1 || num > 26) {
    throw new Error("Number out of range. Please provide a number between 1 and 26.");
  }

  // 64 is the ASCII code right before 'A'; therefore, 64 + num gives the corresponding letter.
  return String.fromCharCode(64 + num);
}

export function copyCode(readPath: string, writePath: string, sdkPath = "@aptos-labs/ts-sdk") {
  if (fs.existsSync(readPath)) {
    const contents = fs.readFileSync(readPath, "utf8");
    // TODO: uhh fix this later, replacing both ../ and .. versions of the import
    const newContents = contents
      .replace("from \"../..\";", `from "${sdkPath}";`)
      .replace("from \"../../\";", `from "${sdkPath}";`);

    if (fs.existsSync(writePath)) {
      fs.rmSync(writePath);
    }
    fs.writeFileSync(writePath, newContents, "utf8");
  }
}

// Instead of funding each account individually, we fund one twice, then have it distribute coins.
// This results in 2 fund requests and 1 transaction instead of N fund requests. For running tests,
// this saves 10-15 seconds each run.
export async function fundAccounts(aptos: Aptos, accounts: Array<Account>) {
  // Fund first account
  const firstAccount = accounts[0];
  // Fund the first account twice to make sure it has enough coins to send to the rest
  await aptos.fundAccount({
    accountAddress: firstAccount.accountAddress.toString(),
    amount: FUND_AMOUNT,
  });
  await aptos.fundAccount({
    accountAddress: firstAccount.accountAddress.toString(),
    amount: FUND_AMOUNT,
  });
  // Get the addresses for `accounts[1..n]`
  const addressesRemaining = accounts.slice(1).map((account) => account.accountAddress);
  const amountToSend = Math.floor((FUND_AMOUNT * 2) / accounts.length);
  // Send coins from `account[0]` to `account[1..n]`
  const transaction = await aptos.transaction.build.simple({
    sender: firstAccount.accountAddress.toString(),
    data: {
      function: "0x1::aptos_account::batch_transfer",
      functionArguments: [
        new MoveVector(addressesRemaining),
        MoveVector.U64(addressesRemaining.map(() => amountToSend)),
      ],
    },
  });
  const signedTxn = await aptos.transaction.sign({
    signer: firstAccount,
    transaction,
  });
  const transactionResponse = await aptos.transaction.submit.simple({
    transaction,
    senderAuthenticator: signedTxn,
  });
  const response = await aptos.waitForTransaction({
    transactionHash: transactionResponse.hash,
  });
  return response as UserTransactionResponse;
}

export function createExplicitArraySizeString(size: number, typeString: string) {
  const types: Array<string> = [];
  while (types.length < size) {
    types.push(typeString);
  }
  return `[${types.join(", ")}]` as const;
}

export function ensureFilePathExists(p: string, contents: string) {
  const filePath = path.join(p);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

/**
 * Waits for the indexer to sync up to the ledgerVersion. Timeout is 3 seconds.
 */
export async function waitForIndexer(args: {
  aptosConfig: AptosConfig;
  minimumLedgerVersion: AnyNumber;
  processorType?: ProcessorType;
}): Promise<void> {
  const { aptosConfig, processorType } = args;
  const minimumLedgerVersion = BigInt(args.minimumLedgerVersion);
  const timeoutMilliseconds = 3000; // 3 seconds
  const startTime = new Date().getTime();
  let indexerVersion = BigInt(-1);

  while (indexerVersion < minimumLedgerVersion) {
    // check for timeout
    if (new Date().getTime() - startTime > timeoutMilliseconds) {
      throw new Error("waitForLastSuccessIndexerVersionSync timeout");
    }

    if (processorType === undefined) {
      // Get the last success version from all processor
      // eslint-disable-next-line no-await-in-loop
      indexerVersion = await getIndexerLastSuccessVersion({ aptosConfig });
    } else {
      // Get the last success version from the specific processor
      // eslint-disable-next-line no-await-in-loop
      const processor = await getProcessorStatus({
        aptosConfig,
        processorType,
      });
      indexerVersion = processor.last_success_version;
    }

    if (indexerVersion >= minimumLedgerVersion) {
      // break out immediately if we are synced
      break;
    }

    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }
}
export const GetProcessorStatus = `
    query getProcessorStatus($where_condition: processor_status_bool_exp) {
  processor_status(where: $where_condition) {
    last_success_version
    processor
    last_updated
  }
}
    `;

export async function queryIndexer<T extends {}>(args: {
  aptosConfig: AptosConfig;
  query: GraphqlQuery;
  originMethod?: string;
}): Promise<T> {
  const { aptosConfig, query, originMethod } = args;
  const { data } = await postAptosIndexer<GraphqlQuery, T>({
    aptosConfig,
    originMethod: originMethod ?? "queryIndexer",
    path: "",
    body: query,
    overrides: { WITH_CREDENTIALS: false },
  });
  return data;
}

export async function getProcessorStatuses(args: {
  aptosConfig: AptosConfig;
}): Promise<GetProcessorStatusResponse> {
  const { aptosConfig } = args;

  const graphqlQuery = {
    query: GetProcessorStatus,
  };

  const data = await queryIndexer<GetProcessorStatusQuery>({
    aptosConfig,
    query: graphqlQuery,
    originMethod: "getProcessorStatuses",
  });

  return data.processor_status;
}

export async function getIndexerLastSuccessVersion(args: {
  aptosConfig: AptosConfig;
}): Promise<bigint> {
  const response = await getProcessorStatuses({
    aptosConfig: args.aptosConfig,
  });
  return BigInt(response[0].last_success_version);
}

export async function getProcessorStatus(args: {
  aptosConfig: AptosConfig;
  processorType: ProcessorType;
}): Promise<GetProcessorStatusResponse[0]> {
  const { aptosConfig, processorType } = args;

  const whereCondition: { processor: { _eq: string } } = {
    processor: { _eq: processorType },
  };

  const graphqlQuery = {
    query: GetProcessorStatus,
    variables: {
      where_condition: whereCondition,
    },
  };

  const data = await queryIndexer<GetProcessorStatusQuery>({
    aptosConfig,
    query: graphqlQuery,
    originMethod: "getProcessorStatus",
  });

  return data.processor_status[0];
}

export type GetProcessorStatusQuery = {
  processor_status: Array<{
    last_success_version: any;
    processor: string;
    last_updated: any;
  }>;
};

/**
 * Sleep the current thread for the given amount of time
 * @param timeMs time in milliseconds to sleep
 */
export async function sleep(timeMs: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), timeMs); // Explicitly call resolve with null
  });
}
