// Copyright © Aptos Foundation
// SPDX-License-Identifier: Apache-2.0

import {
  Account,
  Aptos,
  UserTransactionResponse,
  TypeTag,
  EntryFunctionArgumentTypes,
  HexInput,
  InputGenerateTransactionData,
  SimpleEntryFunctionArgumentTypes,
  AccountAddress,
} from "@aptos-labs/ts-sdk";
import publishJson from "./move/arguments/publish.json" assert { type: "json" };
import { ObjectAddressStruct } from "src/boilerplate/types";

export async function publishPackage(
  aptos: Aptos,
  senderAccount: Account,
  metadataBytes: HexInput,
  codeBytes: Array<HexInput>,
) {
  const rawTransaction = await aptos.publishPackageTransaction({
    account: senderAccount.accountAddress.toString(),
    metadataBytes,
    moduleBytecode: codeBytes,
  });
  const signedTxn = await aptos.signTransaction({
    signer: senderAccount,
    transaction: rawTransaction,
  });
  const txnHash = await aptos.submitTransaction({
    transaction: rawTransaction,
    senderAuthenticator: signedTxn,
  });
  return (await aptos.waitForTransaction({
    transactionHash: txnHash.hash,
  })) as UserTransactionResponse;
}

// Transaction builder helpers
// single signer
export async function rawTransactionHelper(
  aptos: Aptos,
  senderAccount: Account,
  functionName: string,
  typeArgs: TypeTag[],
  args: Array<EntryFunctionArgumentTypes | SimpleEntryFunctionArgumentTypes>,
): Promise<UserTransactionResponse> {
  const rawTransaction = await aptos.generateTransaction({
    sender: senderAccount.accountAddress.toString(),
    data: {
      function: `${senderAccount.accountAddress.toString()}::tx_args_module::${functionName}`,
      typeArguments: typeArgs,
      functionArguments: args,
    },
  });
  const senderAuthenticator = await aptos.signTransaction({
    signer: senderAccount,
    transaction: rawTransaction,
  });
  const transactionResponse = await aptos.submitTransaction({
    transaction: rawTransaction,
    senderAuthenticator,
  });
  const response = await aptos.waitForTransaction({
    transactionHash: transactionResponse.hash,
  });
  return response as UserTransactionResponse;
}

// multi agent/fee payer
export const rawTransactionMultiAgentHelper = async (
  aptos: Aptos,
  senderAccount: Account,
  functionName: string,
  typeArgs: Array<TypeTag>,
  args: Array<EntryFunctionArgumentTypes | SimpleEntryFunctionArgumentTypes>,
  secondarySignerAccounts: Array<Account>,
  feePayerAccount?: Account,
): Promise<UserTransactionResponse> => {
  let transactionData: InputGenerateTransactionData;
  // Fee payer
  if (feePayerAccount) {
    transactionData = {
      sender: senderAccount.accountAddress.toString(),
      data: {
        function: `${senderAccount.accountAddress.toString()}::tx_args_module::${functionName}`,
        typeArguments: typeArgs,
        functionArguments: args,
      },
      secondarySignerAddresses: secondarySignerAccounts?.map((account) => account.accountAddress.data),
      hasFeePayer: true,
    };
  } else if (secondarySignerAccounts) {
    transactionData = {
      sender: senderAccount.accountAddress.toString(),
      data: {
        function: `${senderAccount.accountAddress.toString()}::tx_args_module::${functionName}`,
        typeArguments: typeArgs,
        functionArguments: args,
      },
      secondarySignerAddresses: secondarySignerAccounts?.map((account) => account.accountAddress.data),
    };
  } else {
    transactionData = {
      sender: senderAccount.accountAddress.toString(),
      data: {
        function: `${senderAccount.accountAddress.toString()}::tx_args_module::${functionName}`,
        typeArguments: typeArgs,
        functionArguments: args,
      },
    };
  }

  const generatedTransaction = await aptos.generateTransaction(transactionData);

  const senderAuthenticator = aptos.signTransaction({
    signer: senderAccount,
    transaction: generatedTransaction,
  });

  const secondaryAuthenticators = secondarySignerAccounts.map((account) =>
    aptos.signTransaction({
      signer: account,
      transaction: generatedTransaction,
    }),
  );

  let feePayerAuthenticator;
  if (feePayerAccount !== undefined) {
    feePayerAuthenticator = aptos.signTransaction({
      signer: feePayerAccount,
      transaction: generatedTransaction,
      asFeePayer: true,
    });
  }

  const transactionResponse = await aptos.submitTransaction({
    transaction: generatedTransaction,
    senderAuthenticator,
    additionalSignersAuthenticators: secondaryAuthenticators,
    feePayerAuthenticator,
  });

  const response = await aptos.waitForTransaction({
    transactionHash: transactionResponse.hash,
  });
  return response as UserTransactionResponse;
};

export const PUBLISHER_ACCOUNT_PK = "0xc694948143dea59c195a4918d7fe06c2329624318a073b95f6078ce54940dae9";
export const PUBLISHER_ACCOUNT_ADDRESS = "2cca48b8b0d7f77ef28bfd608883c599680c5b8db8192c5e3baaae1aee45114c";

// hard-coded bytecode for the contract, so we don't have to recompile it every time in ci
export const ARGUMENT_TESTS_CONTRACT_METADATA = publishJson.args[0].value as string;

// interpolate a named address into the contract bytecode
export async function getModuleBytecodeStrings() {
  const modules = Array.isArray(publishJson.args[1].value) ? publishJson.args[1].value : [publishJson.args[1].value];
  const modulesWithCorrectAddress = modules.map(
    (module) =>
      (module = String(module).replaceAll(
        "0a56e8b03118e51cf88140e5e18d1f764e0a1048c23e7c56bd01bd5b76993451",
        PUBLISHER_ACCOUNT_ADDRESS,
      )),
  );
  return modulesWithCorrectAddress;
}

export async function publishArgumentTestModule(
  aptos: Aptos,
  senderAccount: Account,
): Promise<UserTransactionResponse> {
  const moduleBytecodeStrings = await getModuleBytecodeStrings();
  const response = await publishPackage(aptos, senderAccount, ARGUMENT_TESTS_CONTRACT_METADATA, moduleBytecodeStrings);
  return response;
}

export const normalizeObjectAddress = (obj: ObjectAddressStruct) => {
  return { inner: AccountAddress.fromRelaxed(obj.inner).toString() };
};

// To normalize the addresses, since the first Object address starts with a 0, the JSON response doesn't include it
// but ours does.
export const normalizeObjectAddresses = (vectorOfObjects: Array<ObjectAddressStruct>) => {
  return vectorOfObjects.map((obj: ObjectAddressStruct) => normalizeObjectAddress(obj));
};
