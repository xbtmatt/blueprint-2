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
} from "@aptos-labs/ts-sdk";
import publishJson from "./move/arguments/publish.json";

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

// script function byte code from `arguments/sources/script.move` for the transaction_arguments.test.ts script function tests
export const MULTI_SIGNER_SCRIPT_ARGUMENT_TEST =
  // eslint-disable-next-line max-len
  `a11ceb0b060000000601000802080e03160a05203907596408bd0140000000010002010302040700000507010001030608000107020300030804010015060c060c060c060c060c050505050501020d0e03040f0508000b010108020a020001060c01050b01020d0e03040f0508000b010108020a02066f626a656374067369676e657206737472696e670e74785f617267735f6d6f64756c6506537472696e67064f626a6563740d456d7074795265736f757263650a616464726573735f6f66186173736572745f76616c7565735f666f725f7363726970740000000000000000000000000000000000000000000000000000000000000001${PUBLISHER_ACCOUNT_ADDRESS}000001490b0011000b0521040605100b04010b03010b02010b0101066400000000000000270b0111000b06210416051e0b04010b03010b0201066500000000000000270b0211000b07210424052a0b04010b0301066600000000000000270b0311000b0821043005340b0401066700000000000000270b0411000b0921043a053c066800000000000000270b0a0b0b0b0c0b0d0b0e0b0f0b100b110b120b130b14110102${PUBLISHER_ACCOUNT_ADDRESS}000001490b0011000b0521040605100b04010b03010b02010b0101066400000000000000270b0111000b06210416051e0b04010b03010b0201066500000000000000270b0211000b07210424052a0b04010b0301066600000000000000270b0311000b0821043005340b0401066700000000000000270b0411000b0921043a053c066800000000000000270b0a0b0b0b0c0b0d0b0e0b0f0b100b110b120b130b14110102${PUBLISHER_ACCOUNT_ADDRESS}000001150b0011000b012104060508066400000000000000270b020b030b040b050b060b070b080b090b0a0b0b0b0c110102`;

// hard-coded bytecode for the contract, so we don't have to recompile it every time in ci
export const ARGUMENT_TESTS_CONTRACT_METADATA = publishJson.args[0].value as string;

// interpolate a named address into the contract bytecode
export async function getContractBytecode() {
  return String(publishJson.args[1].value as string).replaceAll(
    "0a56e8b03118e51cf88140e5e18d1f764e0a1048c23e7c56bd01bd5b76993451",
    PUBLISHER_ACCOUNT_ADDRESS,
  );
}

export async function publishArgumentTestModule(
  aptos: Aptos,
  senderAccount: Account,
): Promise<UserTransactionResponse> {
  const contractBytecode = await getContractBytecode();
  const response = await publishPackage(aptos, senderAccount, ARGUMENT_TESTS_CONTRACT_METADATA, [contractBytecode]);
  return response;
}
