// Copyright © Aptos Foundation
// SPDX-License-Identifier: Apache-2.0

import {
  Aptos,
  Account,
  AccountAddress,
  EntryFunction,
  EntryFunctionArgumentTypes,
  Identifier,
  ModuleId,
  MultiSig,
  MultisigTransactionPayload,
  TransactionPayloadEntryFunction,
  TransactionPayloadMultisig,
  TypeTag,
  buildTransaction,
  LedgerVersion,
  MoveValue,
  UserTransactionResponse,
  InputViewRequestData,
  WaitForTransactionOptions,
  Serializable,
  Serializer,
  EntryFunctionPayloadResponse,
  AnyRawTransaction,
  AccountAuthenticator,
  InputGenerateTransactionOptions,
} from "@aptos-labs/ts-sdk";
import { WalletSignTransactionFunction } from "src/types";

// Only used in tests right now, since it's cumbersome to check static methods on different class instances with an interface.
export interface TransactionBuilder {
  builder: (...args: any[]) => Promise<EntryFunctionTransactionBuilder>;
  submit: (...args: any[]) => Promise<UserTransactionResponse>;
  builderWithFeePayer: (...args: any[]) => Promise<EntryFunctionTransactionBuilder>;
  submitWithFeePayer: (...args: any[]) => Promise<UserTransactionResponse>;
}

export class EntryFunctionTransactionBuilder {
  // TODO: Expand these fields instead of using the `payloadBuilder` field?
  public readonly payloadBuilder: EntryFunctionPayloadBuilder;
  public readonly aptos: Aptos;
  public readonly rawTransactionInput: AnyRawTransaction;

  constructor(payloadBuilder: EntryFunctionPayloadBuilder, aptos: Aptos, rawTransactionInput: AnyRawTransaction) {
    this.payloadBuilder = payloadBuilder;
    this.aptos = aptos;
    this.rawTransactionInput = rawTransactionInput;
  }

  /**
   *
   * @param signer either a local Account or a callback function that returns an AccountAuthenticator
   * @param asFeePayer whether or not the signer is the fee payer
   * @returns a Promise<AccountAuthenticator>
   */
  async sign(signer: Account | WalletSignTransactionFunction, asFeePayer?: boolean): Promise<AccountAuthenticator> {
    if (signer instanceof Account) {
      const accountAuthenticator = this.aptos.signTransaction({
        signer,
        transaction: this.rawTransactionInput,
        asFeePayer,
      });
      return Promise.resolve(accountAuthenticator);
    }
    return signer(this.rawTransactionInput, asFeePayer);
  }

  // To be used by a static `submit` where the user enters named signer arguments
  async submit(args: {
    primarySigner: Account | WalletSignTransactionFunction | AccountAuthenticator;
    secondarySigners?: Array<Account | WalletSignTransactionFunction | AccountAuthenticator>;
    feePayer?: Account | WalletSignTransactionFunction | AccountAuthenticator;
    options?: WaitForTransactionOptions;
  }): Promise<UserTransactionResponse> {
    const { primarySigner, secondarySigners, feePayer, options } = args;
    let primarySenderAuthenticator: AccountAuthenticator;
    let secondarySendersAuthenticators: Array<AccountAuthenticator> | undefined;
    let feePayerAuthenticator: AccountAuthenticator | undefined;
    if (primarySigner instanceof AccountAuthenticator) {
      primarySenderAuthenticator = primarySigner;
    } else {
      primarySenderAuthenticator = await this.sign(primarySigner);
    }
    if (secondarySigners) {
      secondarySendersAuthenticators = new Array<AccountAuthenticator>();
      for (const signer of secondarySigners) {
        if (signer instanceof AccountAuthenticator) {
          secondarySendersAuthenticators.push(signer);
        } else {
          secondarySendersAuthenticators.push(await this.sign(signer));
        }
      }
      secondarySendersAuthenticators = await Promise.all(
        secondarySigners.map(async (signer) => {
          if (signer instanceof AccountAuthenticator) {
            return signer;
          }
          return await this.sign(signer);
        }),
      );
    }
    if (feePayer) {
      if (feePayer instanceof AccountAuthenticator) {
        feePayerAuthenticator = feePayer;
      } else {
        feePayerAuthenticator = await this.sign(feePayer, true);
      }
    }

    const pendingTransaction = await this.aptos.submitTransaction({
      transaction: this.rawTransactionInput,
      senderAuthenticator: primarySenderAuthenticator,
      feePayerAuthenticator,
      additionalSignersAuthenticators: secondarySendersAuthenticators,
    });

    const userTransactionResponse = await this.aptos.waitForTransaction({
      transactionHash: pendingTransaction.hash,
      options,
    });

    return userTransactionResponse as UserTransactionResponse;
  }

  /**
   * Helper function to print out relevant transaction info with an easy way to filter out fields
   * @param response The transaction response for a user submitted transaction
   * @param optionsArray An array of keys to print out from the transaction response
   * @returns the transaction info as an object
   */
  responseInfo(response: UserTransactionResponse, optionsArray?: Array<keyof UserTransactionResponse>) {
    const payload = response.payload as EntryFunctionPayloadResponse;

    const keysToPrint: Record<string, any> = {};
    for (const key in optionsArray) {
      keysToPrint[key] = response[key as keyof typeof response];
    }

    return {
      function: payload.function,
      arguments: payload.arguments,
      type_arguments: payload.type_arguments,
      hash: response.hash,
      version: response.version,
      sender: response.sender,
      success: response.success,
      ...keysToPrint,
    };
  }
}

export abstract class EntryFunctionPayloadBuilder extends Serializable {
  public abstract readonly moduleAddress: AccountAddress;
  public abstract readonly moduleName: string;
  public abstract readonly functionName: string;
  public abstract readonly args: any;
  public abstract readonly typeTags: Array<TypeTag>;
  public abstract readonly primarySender: AccountAddress;
  public abstract readonly secondarySenders?: Array<AccountAddress>;
  public abstract readonly feePayer?: AccountAddress;

  createPayload(multisigAddress?: AccountAddress): TransactionPayloadEntryFunction | TransactionPayloadMultisig {
    const entryFunction = new EntryFunction(
      new ModuleId(this.moduleAddress, new Identifier(this.moduleName)),
      new Identifier(this.functionName),
      this.typeTags,
      this.argsToArray(),
    );
    const entryFunctionPayload = new TransactionPayloadEntryFunction(entryFunction);
    if (multisigAddress) {
      const multisigPayload = new MultisigTransactionPayload(entryFunction);
      return new TransactionPayloadMultisig(new MultiSig(multisigAddress, multisigPayload));
    }
    return entryFunctionPayload;
  }

  argsToArray(): Array<EntryFunctionArgumentTypes> {
    return Object.keys(this.args).map((field) => this.args[field as keyof typeof this.args]);
  }

  // TODO: Finish later.
  //  the undefined/optional inputs for buildTransaction have changed so we can't do it as easily as before
  // protected async toTransactionBuilder(args: {
  //   aptosConfig: AptosConfig,
  //   primarySender: AccountAddress,
  //   secondarySenders?: Array<AccountAddress>,
  //   args: any,
  //   feePayer?: AccountAddress,
  //   typeTags?: Array<TypeTag>,
  //   options?: InputGenerateTransactionOptions,
  // }): EntryFunctionTransactionBuilder {
  //   const { aptosConfig, primarySender, secondarySenders, args, feePayer, typeTags, options } = args;
  //   const aptos = new Aptos(aptosConfig);
  //   const rawTransactionInput = await buildTransaction({
  //     payload: this.createPayload(),
  //     sender: primarySender,
  //     secondarySignerAddresses: secondarySenders ?? [],
  //     feePayerAddress: feePayer ?? undefined,
  //     args,
  //     typeTags,
  //     options,
  //   });
  //   return new EntryFunctionTransactionBuilder(this, aptos, rawTransactionInput);
  // }

  serialize(serializer: Serializer): void {
    this.createPayload().serialize(serializer);
  }
}

// TODO: Allow for users to store/serialize arguments as BCS classes or JSON/simple entry function argument types
export abstract class ViewFunctionPayloadBuilder<T extends Array<MoveValue>> {
  public abstract readonly moduleAddress: AccountAddress;
  public abstract readonly moduleName: string;
  public abstract readonly functionName: string;
  public abstract readonly args: any;
  public abstract readonly typeTags: Array<TypeTag>;

  toPayload(): InputViewRequestData {
    return {
      function: `${this.moduleAddress.toString()}::${this.moduleName}::${this.functionName}`,
      typeArguments: this.typeTags.map((type) => type.toString() as `0x${string}::${string}::${string}`),
      functionArguments: this.argsToArray(),
    };
  }

  async submit(args: { aptos: Aptos; options?: LedgerVersion }): Promise<T> {
    const { aptos, options } = args;
    const viewRequest = await aptos.view<T>({
      payload: this.toPayload(),
      options,
    });
    return viewRequest;
  }

  argsToArray(): Array<MoveValue> {
    return Object.keys(this.args).map((field) => this.args[field as keyof typeof this.args]);
  }
}
