// Copyright © Aptos Foundation
// SPDX-License-Identifier: Apache-2.0

import {
  AccountAddress,
  Hex,
  TypeTag,
  MoveModule,
  MoveModuleBytecode,
  Aptos,
  Account,
  MoveVector,
  UserTransactionResponse,
} from "@aptos-labs/ts-sdk";
import pako from "pako";
import { toClassString, toTypeTagEnum } from "./code-gen/index.js";
import fs from "fs";

export const FUND_AMOUNT = 100_000_000;

export function toPascalCase(input: string): string {
  return input
    .split("_")
    .map((s) => s[0].toUpperCase() + s.slice(1).toLowerCase())
    .join("");
}

export function toCamelCase(input: string): string {
  const pascalCase = toPascalCase(input);
  return pascalCase[0].toLowerCase() + pascalCase.slice(1);
}

/**
 * Convert a module source code in gzipped hex string to plain text
 * @param source module source code in gzipped hex string
 * @returns original source code in plain text
 */
export function transformCode(source: string): string {
  return pako.ungzip(Hex.fromHexInput(source).toUint8Array(), { to: "string" });
}

export async function fetchModuleABIs(aptos: Aptos, accountAddress: AccountAddress) {
  const moduleABIs = await aptos.getAccountModules({
    accountAddress: accountAddress.toString(),
  });
  return moduleABIs;
}

export function isAbiDefined(obj: MoveModuleBytecode): obj is { bytecode: string; abi: MoveModule } {
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

export function numberToLetter(num: number): string {
  // Check if the number corresponds to the letters in the English alphabet
  if (num < 1 || num > 26) {
    throw new Error("Number out of range. Please provide a number between 1 and 26.");
  }

  // 64 is the ASCII code right before 'A'; therefore, adding the number gives the corresponding letter
  return String.fromCharCode(64 + num);
}

export function copyCode(readPath: string, writePath: string, sdkPath = "@aptos-labs/ts-sdk") {
  if (fs.existsSync(readPath)) {
    const contents = fs.readFileSync(readPath, "utf8");
    // TODO: uhh fix this later, replacing both ../ and .. versions of the import
    const newContents = contents
      .replace(`from "../..";`, `from "${sdkPath}";`)
      .replace(`from "../../";`, `from "${sdkPath}";`);

    if (fs.existsSync(writePath)) {
      fs.rmSync(writePath);
    }
    fs.writeFileSync(writePath, newContents, "utf8");
  }
}

// Instead of funding each account individually, we fund one twice, then send coins from it to the rest
// This results in 2 fund requests and 1 transaction instead of N fund requests. For running tests,
// this saves 10-15 seconds each run.
export async function fundAccounts(aptos: Aptos, accounts: Array<Account>) {
  // Fund first account
  const firstAccount = accounts[0];
  // Fund the first account twice to make sure it has enough coins to send to the rest
  const resp1 = await aptos.fundAccount({
    accountAddress: firstAccount.accountAddress.toString(),
    amount: FUND_AMOUNT,
  });
  const resp2 = await aptos.fundAccount({
    accountAddress: firstAccount.accountAddress.toString(),
    amount: FUND_AMOUNT,
  });
  // Get the addresses for `accounts[1..n]`
  const addressesRemaining = accounts.slice(1).map((account) => account.accountAddress);
  const amountToSend = Math.floor((FUND_AMOUNT * 2) / accounts.length);
  // Send coins from `account[0]` to `account[1..n]`
  const transaction = await aptos.generateTransaction({
    sender: firstAccount.accountAddress.toString(),
    data: {
      function: "0x1::aptos_account::batch_transfer",
      functionArguments: [
        new MoveVector(addressesRemaining),
        MoveVector.U64(addressesRemaining.map(() => amountToSend)),
      ],
    },
  });
  const signedTxn = await aptos.signTransaction({
    signer: firstAccount,
    transaction,
  });
  const transactionResponse = await aptos.submitTransaction({
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
