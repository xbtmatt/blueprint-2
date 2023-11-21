// Copyright © Aptos Foundation
// SPDX-License-Identifier: Apache-2.0

import {
  Account,
  AptosConfig,
  Network,
  Aptos,
  AccountAddress,
  Bool,
  U128,
  U16,
  U256,
  U32,
  U64,
  U8,
  TransactionFeePayerSignature,
  TransactionMultiAgentSignature,
  EntryFunctionArgumentTypes,
  SimpleEntryFunctionArgumentTypes,
  Ed25519PrivateKey,
  UserTransactionResponse,
  parseTypeTag,
  Hex,
  MoveValue,
  FixedBytes,
  MoveOption,
  MoveString,
  MoveVector,
  Uint8,
  Uint16,
  Uint32,
  Uint64,
  Uint128,
  Uint256,
  TypeTag,
  TransactionEd25519Signature,
} from "@aptos-labs/ts-sdk";
import {
  rawTransactionHelper,
  rawTransactionMultiAgentHelper,
  publishArgumentTestModule,
  PUBLISHER_ACCOUNT_PK,
  PUBLISHER_ACCOUNT_ADDRESS,
  normalizeObjectAddresses,
  normalizeObjectAddress,
} from "./helper";
import { InputTypes, TransactionBuilder, fundAccounts } from "../src";
import { TxArgsModule } from "../generated/args_test_suite";
import { gray, lightBlue, lightGreen, lightMagenta } from "kolorist";
import { ObjectAddressStruct } from "src/boilerplate/types";

// Upper bound values for uint8, uint16, uint64 and uint128
export const MAX_U8_NUMBER: Uint8 = 2 ** 8 - 1;
export const MAX_U16_NUMBER: Uint16 = 2 ** 16 - 1;
export const MAX_U32_NUMBER: Uint32 = 2 ** 32 - 1;
export const MAX_U64_BIG_INT: Uint64 = BigInt(2) ** BigInt(64) - BigInt(1);
export const MAX_U128_BIG_INT: Uint128 = BigInt(2) ** BigInt(128) - BigInt(1);
export const MAX_U256_BIG_INT: Uint256 = BigInt(2) ** BigInt(256) - BigInt(1);

jest.setTimeout(20000);

// This test uses lots of helper functions, explained here:
//  the `transactionArguments` array contains every possible argument type
//  the `rawTransactionHelper` and `rawTransactionMultiAgentHelper` functions are helpers to generate the transactions,
//    respectively for single signer transactions and for (multi signer & fee payer) transactions
// In any transaction with a `&signer` the move function asserts that the first argument is the senderAccount's address:
// `sender_address: address` or all of the `&signer` addresses: `signer_addresses: vector<address>`

describe("various transaction arguments", () => {
  const config = new AptosConfig({ network: Network.LOCAL });
  const aptos = new Aptos(config);
  const senderAccount = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(PUBLISHER_ACCOUNT_PK),
    legacy: false,
  });
  const secondarySignerAccounts = [Account.generate(), Account.generate(), Account.generate(), Account.generate()];
  const feePayerAccount = Account.generate();
  const moduleObjects: Array<AccountAddress> = [];
  let transactionArguments: Array<EntryFunctionArgumentTypes>;
  let simpleTransactionArguments: Array<InputTypes>;
  let mixedTransactionArguments: Array<EntryFunctionArgumentTypes | SimpleEntryFunctionArgumentTypes>;
  const EXPECTED_VECTOR_U8 = new Uint8Array([0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER]);
  const EXPECTED_VECTOR_STRING = ["expected_string", "abc", "def", "123", "456", "789"];

  beforeAll(async () => {
    await fundAccounts(aptos, [senderAccount, ...secondarySignerAccounts, feePayerAccount]);
    await publishArgumentTestModule(aptos, senderAccount);

    // when deploying, `init_module` creates 3 objects and stores them into the `SetupData` resource
    // within that resource is 3 fields: `empty_object_1`, `empty_object_2`, `empty_object_3`
    // we need to extract those objects and use them as arguments for the entry functions
    type SetupData = {
      empty_object_1: { inner: string };
      empty_object_2: { inner: string };
      empty_object_3: { inner: string };
    };

    const setupData = await aptos.getAccountResource<SetupData>({
      accountAddress: senderAccount.accountAddress.toString(),
      resourceType: `${senderAccount.accountAddress.toString()}::tx_args_module::SetupData`,
    });

    moduleObjects.push(AccountAddress.fromStringRelaxed(setupData.empty_object_1.inner));
    moduleObjects.push(AccountAddress.fromStringRelaxed(setupData.empty_object_2.inner));
    moduleObjects.push(AccountAddress.fromStringRelaxed(setupData.empty_object_3.inner));

    transactionArguments = [
      new Bool(true),
      new U8(1),
      new U16(2),
      new U32(3),
      new U64(4),
      new U128(5),
      new U256(6),
      senderAccount.accountAddress,
      new MoveString("expected_string"),
      moduleObjects[0],
      new MoveVector([]),
      MoveVector.Bool([true, false, true]),
      MoveVector.U8(EXPECTED_VECTOR_U8),
      MoveVector.U16([0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER]),
      MoveVector.U32([0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER]),
      MoveVector.U64([0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT]),
      MoveVector.U128([0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT]),
      MoveVector.U256([0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT]),
      new MoveVector([
        AccountAddress.fromStringRelaxed("0x0"),
        AccountAddress.fromStringRelaxed("0xabc"),
        AccountAddress.fromStringRelaxed("0xdef"),
        AccountAddress.fromStringRelaxed("0x123"),
        AccountAddress.fromStringRelaxed("0x456"),
        AccountAddress.fromStringRelaxed("0x789"),
      ]),
      MoveVector.MoveString(EXPECTED_VECTOR_STRING),
      new MoveVector(moduleObjects),
      new MoveOption(),
      new MoveOption(new Bool(true)),
      new MoveOption(new U8(1)),
      new MoveOption(new U16(2)),
      new MoveOption(new U32(3)),
      new MoveOption(new U64(4)),
      new MoveOption(new U128(5)),
      new MoveOption(new U256(6)),
      new MoveOption(senderAccount.accountAddress),
      new MoveOption(new MoveString("expected_string")),
      new MoveOption(moduleObjects[0]),
    ];

    simpleTransactionArguments = [
      true,
      1,
      2,
      3,
      4,
      5,
      6,
      senderAccount.accountAddress.toString(),
      "expected_string",
      moduleObjects[0].toString(),
      new Uint8Array([]),
      [true, false, true],
      [0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER],
      [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
      [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
      [0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT.toString(10)],
      [0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT.toString(10)],
      [0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT.toString(10)],
      ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
      ["expected_string", "abc", "def", "123", "456", "789"],
      moduleObjects.map((obj) => obj.toString()),
      new Uint8Array([]),
      [true],
      [1],
      [2],
      [3],
      [4],
      [5],
      [6],
      [senderAccount.accountAddress.toString()],
      ["expected_string"],
      [moduleObjects[0].toString()],
    ];

    // Mixes different types of number arguments, and parsed an unparsed arguments
    mixedTransactionArguments = [
      true,
      1,
      2,
      3,
      4n,
      BigInt(5),
      "6",
      senderAccount.accountAddress,
      "expected_string",
      moduleObjects[0],
      [],
      [true, false, true],
      [0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER],
      [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
      [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
      [0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT.toString(10)],
      [0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT.toString(10)],
      [0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT.toString(10)],
      ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
      ["expected_string", "abc", "def", "123", "456", "789"],
      moduleObjects.map((obj) => obj.toString()),
      null,
      new MoveOption(new Bool(true)),
      1,
      2,
      3,
      4,
      5,
      6,
      senderAccount.accountAddress.toString(),
      "expected_string",
      moduleObjects[0].toString(),
    ];

    return true;
  });

  const typeTags = [
    "bool",
    "u8",
    "u16",
    "u32",
    "u64",
    "u128",
    "u256",
    "address",
    "0x1::string::String",
    `0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>`,
    "vector<bool>",
    "vector<u8>",
    "vector<u16>",
    "vector<u32>",
    "vector<u64>",
    "vector<u128>",
    "vector<u256>",
    "vector<address>",
    "vector<0x1::string::String>",
    `vector<0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>>`,
    "0x1::option::Option<bool>",
    "0x1::option::Option<u8>",
    "0x1::option::Option<u16>",
    "0x1::option::Option<u32>",
    "0x1::option::Option<u64>",
    "0x1::option::Option<u128>",
    "0x1::option::Option<u256>",
    "0x1::option::Option<address>",
    "0x1::option::Option<0x1::string::String>",
    `0x1::option::Option<0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>>`,
    `vector<vector<0x1::option::Option<vector<0x1::option::Option<0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>>>>>>`,
  ].map((s) => parseTypeTag(s));

  describe("all builder paths", () => {
    it("tests type_tags, a function with 31 complex type tags", async () => {
      await testAllBuilderPaths({
        aptos,
        senderAccount,
        cls: TxArgsModule.TypeTags,
        typeArgs: typeTags,
        functionArguments: [],
        secondarySignerAccounts: [],
        feePayer: feePayerAccount,
      });
    });
    it("tests public_arguments, a function with all argument types except `&signer`", async () => {
      await testAllBuilderPaths({
        aptos,
        senderAccount,
        cls: TxArgsModule.PublicArguments,
        typeArgs: [],
        functionArguments: simpleTransactionArguments,
        secondarySignerAccounts: [],
        feePayer: feePayerAccount,
      });
    });
    it("tests private_arguments, a function with all argument types except `&signer`", async () => {
      await testAllBuilderPaths({
        aptos,
        senderAccount,
        cls: TxArgsModule.PrivateArguments,
        typeArgs: [],
        functionArguments: simpleTransactionArguments,
        secondarySignerAccounts: [],
        feePayer: feePayerAccount,
      });
    });
    it("tests public_arguments_multiple_signers, a multi-agent function with all argument types except `&signer`", async () => {
      await testAllBuilderPaths({
        aptos,
        senderAccount,
        cls: TxArgsModule.PublicArgumentsMultipleSigners,
        typeArgs: [],
        functionArguments: [
          [senderAccount.accountAddress, ...secondarySignerAccounts.map((s) => s.accountAddress)],
          ...simpleTransactionArguments,
        ],
        secondarySignerAccounts,
        feePayer: feePayerAccount,
      });
    });
    it("tests private_arguments_multiple_signers, a multi-agent function with all argument types except `&signer`", async () => {
      await testAllBuilderPaths({
        aptos,
        senderAccount,
        cls: TxArgsModule.PrivateArgumentsMultipleSigners,
        typeArgs: [],
        functionArguments: [
          [senderAccount.accountAddress, ...secondarySignerAccounts.map((s) => s.accountAddress)],
          ...simpleTransactionArguments,
        ],
        secondarySignerAccounts,
        feePayer: feePayerAccount,
      });
    });
    it("tests complex_arguments, a function with complex, nested argument types", async () => {
      const optionArray = [EXPECTED_VECTOR_STRING];
      const deeplyNested3 = [optionArray, optionArray, optionArray];
      const deeplyNested4 = [deeplyNested3, deeplyNested3, deeplyNested3];
      const args = [
        [EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8],
        [EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING],
        deeplyNested3,
        deeplyNested4,
      ];
      await testAllBuilderPaths({
        aptos,
        senderAccount,
        cls: TxArgsModule.ComplexArguments,
        typeArgs: [],
        functionArguments: args,
        secondarySignerAccounts: [],
        feePayer: feePayerAccount,
      });
    });

    it("tests view_all_arguments, a view function that outputs all the arguments passed in", async () => {
      const args = [
        true,
        1,
        2,
        3,
        "4",
        "5",
        "6",
        senderAccount.accountAddress.toString(),
        "This is my favorite string :)",
        moduleObjects[0].toString(),
        new Uint8Array([1, 2, 3]),
        [true, false, true],
        new Uint8Array([0, 255, 1, 2]),
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        ["9", "10", "11", "12"],
        ["13", "14", "15", "16"],
        ["17", "18", "19", "20"],
        [
          AccountAddress.ZERO,
          AccountAddress.ONE,
          AccountAddress.TWO,
          AccountAddress.THREE,
          AccountAddress.FOUR,
          senderAccount.accountAddress,
        ].map((a) => a.toString()),
        ["this", "is", "a", "string"],
      ] as const;
      const viewAllArguments = await new TxArgsModule.ViewSomeArguments(
        args[0],
        args[1],
        args[2],
        args[3],
        args[4],
        args[5],
        args[6],
        args[7],
        args[8],
        args[9],
        args[10],
        Array.from(args[11]),
        args[12],
        Array.from(args[13]),
        Array.from(args[14]),
        Array.from(args[15]),
        Array.from(args[16]),
        Array.from(args[17]),
        Array.from(args[18]),
        Array.from(args[19]),
      ).submit({ aptos });
      viewAllArguments.forEach((arg, i) => {
        if (i == 9) {
          const arg = viewAllArguments[i]; // for explicit type checking
          expect(normalizeObjectAddress(arg)).toEqual({ inner: args[i].toString() });
        } else if (i == 10 || i == 12) {
          expect(arg).toEqual(Hex.fromHexInput(new Uint8Array(args[i].map((n) => n))).toString());
        } else if (i == 15 || i == 16 || i == 17) {
          expect(arg).toEqual(args[i].map((n) => n.toString()));
        } else {
          expect(arg).toEqual(args[i]);
        }
      });
    });
  });

  // TODO: Fix, currently broken
  it.skip("tests view_complex_outputs, a view function with complex, nested output types", async () => {
    const viewComplexOutputs = await new TxArgsModule.ViewComplexOutputs().submit({
      aptos,
    });

    /*

      // The below does not work. Keeping it for reference.
      type OptionVec<T> = {
        vec: T;
      }

      type ViewComplexArgumentsPayloadMoveArguments = {
        deeply_nested_1: Array<HexInput>;
        deeply_nested_2: Array<Array<ObjectAddressStruct>>;
        deeply_nested_3: Array<OptionVec<Array<ObjectAddressStruct>>>;
        deeply_nested_4: Array<Array<Array<Array<ObjectAddressStruct>>>>;
      };

      const toObjectAddressStruct = (argA: ObjectAddress) => {
        return {
          inner: AccountAddress.fromRelaxed(argA).toString(),
        }
      }

      // in ViewComplexArguments constructor body:

    this.args = {
      deeply_nested_1: deeply_nested_1.map((argA) =>
        Hex.fromHexInput(argA).toString(),
      ),
      deeply_nested_2: deeply_nested_2.map((argA) =>
        argA.map((argB) => toObjectAddressStruct(argB)
      )),
      // deeply_nested_3: [
      //   { vec: [AccountAddress.ZERO], }
      // ],
      deeply_nested_3: deeply_nested_3.map((argA) => {
        return {
          vec: argA[0] ? argA[0].map((argB) => toObjectAddressStruct(argB)) : [],
        }
      }
      ),
      deeply_nested_4: [],

      // TODO: Fix Option output to be `vec: []`, currently it's trying to cast it to an array of one element I think
      // this is specifically for the response outputs
      console.log(JSON.stringify(viewComplexOutputs, null, 3));
      // console.log(viewComplexOutputs);
      const objectArray = [moduleObjects[0], moduleObjects[1], moduleObjects[2]].map(s => s.toString());
      const deeplyNested3 = [[objectArray], [], [objectArray]];
      const deeplyNested4 = [deeplyNested3, deeplyNested3, deeplyNested3];
      const complexArgsResponse = await new TxArgsModule.ViewComplexArguments(
        [EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8],
        [objectArray, objectArray, objectArray],
        deeplyNested3,
        deeplyNested4,
      ).submit({
        aptos,
      });
      console.log(JSON.stringify(complexArgsResponse, null, 3));
      */
  });
});

export async function testAllBuilderPaths<T extends TransactionBuilder>(args: {
  aptos: Aptos;
  senderAccount: Account;
  cls: T;
  typeArgs: Array<TypeTag>;
  functionArguments: Array<InputTypes>;
  secondarySignerAccounts: Array<Account>;
  feePayer: Account;
}): Promise<boolean> {
  const { aptos, senderAccount, cls, typeArgs, functionArguments, secondarySignerAccounts, feePayer } = args;
  const secondarySigners = secondarySignerAccounts.length > 0 ? secondarySignerAccounts : undefined;
  const secondarySignerAddresses = secondarySignerAccounts.map((account) => account.accountAddress);
  const getBuilder = async (args: { withFeePayer: boolean }) => {
    const { withFeePayer } = args;
    let builder;
    if (secondarySignerAddresses.length > 0) {
      if (functionArguments.length > 0) {
        if (withFeePayer) {
          if (typeArgs.length > 0) {
            builder = await cls.builderWithFeePayer(
              aptos.config,
              senderAccount.accountAddress,
              ...secondarySignerAddresses,
              ...functionArguments,
              typeArgs,
              feePayer.accountAddress,
            );
          } else {
            builder = await cls.builderWithFeePayer(
              aptos.config,
              senderAccount.accountAddress,
              ...secondarySignerAddresses,
              ...functionArguments,
              feePayer.accountAddress,
            );
          }
        } else {
          if (typeArgs.length > 0) {
            builder = await cls.builder(
              aptos.config,
              senderAccount.accountAddress,
              ...secondarySignerAddresses,
              ...functionArguments,
              typeArgs,
            );
          } else {
            builder = await cls.builder(
              aptos.config,
              senderAccount.accountAddress,
              ...secondarySignerAddresses,
              ...functionArguments,
            );
          }
        }
      } else {
        if (withFeePayer) {
          if (typeArgs.length > 0) {
            builder = await cls.builderWithFeePayer(
              aptos.config,
              senderAccount.accountAddress,
              ...secondarySignerAddresses,
              typeArgs,
              feePayer.accountAddress,
            );
          } else {
            builder = await cls.builderWithFeePayer(
              aptos.config,
              senderAccount.accountAddress,
              ...secondarySignerAddresses,
              feePayer.accountAddress,
            );
          }
        } else {
          if (typeArgs.length > 0) {
            builder = await cls.builder(
              aptos.config,
              senderAccount.accountAddress,
              ...secondarySignerAddresses,
              typeArgs,
            );
          } else {
            builder = await cls.builder(aptos.config, senderAccount.accountAddress, ...secondarySignerAddresses);
          }
        }
      }
    } else {
      if (functionArguments.length > 0) {
        if (withFeePayer) {
          if (typeArgs.length > 0) {
            builder = await cls.builderWithFeePayer(
              aptos.config,
              senderAccount.accountAddress,
              ...functionArguments,
              typeArgs,
              feePayer.accountAddress,
            );
          } else {
            builder = await cls.builderWithFeePayer(
              aptos.config,
              senderAccount.accountAddress,
              ...functionArguments,
              feePayer.accountAddress,
            );
          }
        } else {
          if (typeArgs.length > 0) {
            builder = await cls.builder(aptos.config, senderAccount.accountAddress, ...functionArguments, typeArgs);
          } else {
            builder = await cls.builder(aptos.config, senderAccount.accountAddress, ...functionArguments);
          }
        }
      } else {
        if (withFeePayer) {
          if (typeArgs.length > 0) {
            builder = await cls.builderWithFeePayer(
              aptos.config,
              senderAccount.accountAddress,
              typeArgs,
              feePayer.accountAddress,
            );
          } else {
            builder = await cls.builderWithFeePayer(
              aptos.config,
              senderAccount.accountAddress,
              feePayer.accountAddress,
            );
          }
        } else {
          if (typeArgs.length > 0) {
            builder = await cls.builder(aptos.config, senderAccount.accountAddress, typeArgs);
          } else {
            builder = await cls.builder(aptos.config, senderAccount.accountAddress);
          }
        }
      }
    }
    return builder;
  };

  const getSubmitter = async (args: { withFeePayer: boolean }) => {
    const { withFeePayer } = args;
    let submitter;
    if (secondarySignerAddresses.length > 0) {
      if (functionArguments.length > 0) {
        if (withFeePayer) {
          if (typeArgs.length > 0) {
            submitter = await cls.submitWithFeePayer(
              aptos.config,
              senderAccount,
              ...secondarySignerAccounts,
              ...functionArguments,
              typeArgs,
              feePayer,
            );
          } else {
            submitter = await cls.submitWithFeePayer(
              aptos.config,
              senderAccount,
              ...secondarySignerAccounts,
              ...functionArguments,
              feePayer,
            );
          }
        } else {
          if (typeArgs.length > 0) {
            submitter = await cls.submit(
              aptos.config,
              senderAccount,
              ...secondarySignerAccounts,
              ...functionArguments,
              typeArgs,
            );
          } else {
            submitter = await cls.submit(aptos.config, senderAccount, ...secondarySignerAccounts, ...functionArguments);
          }
        }
      } else {
        if (withFeePayer) {
          if (typeArgs.length > 0) {
            submitter = await cls.submitWithFeePayer(
              aptos.config,
              senderAccount,
              ...secondarySignerAccounts,
              typeArgs,
              feePayer,
            );
          } else {
            submitter = await cls.submitWithFeePayer(aptos.config, senderAccount, ...secondarySignerAccounts, feePayer);
          }
        } else {
          if (typeArgs.length > 0) {
            submitter = await cls.submit(aptos.config, senderAccount, ...secondarySignerAccounts, typeArgs);
          } else {
            submitter = await cls.submit(aptos.config, senderAccount, ...secondarySignerAccounts);
          }
        }
      }
    } else {
      if (functionArguments.length > 0) {
        if (withFeePayer) {
          if (typeArgs.length > 0) {
            submitter = await cls.submitWithFeePayer(
              aptos.config,
              senderAccount,
              ...functionArguments,
              typeArgs,
              feePayer,
            );
          } else {
            submitter = await cls.submitWithFeePayer(aptos.config, senderAccount, ...functionArguments, feePayer);
          }
        } else {
          if (typeArgs.length > 0) {
            submitter = await cls.submit(aptos.config, senderAccount, ...functionArguments, typeArgs);
          } else {
            submitter = await cls.submit(aptos.config, senderAccount, ...functionArguments);
          }
        }
      } else {
        if (withFeePayer) {
          if (typeArgs.length > 0) {
            submitter = await cls.submitWithFeePayer(aptos.config, senderAccount, typeArgs, feePayer);
          } else {
            submitter = await cls.submitWithFeePayer(aptos.config, senderAccount, feePayer);
          }
        } else {
          if (typeArgs.length > 0) {
            submitter = await cls.submit(aptos.config, senderAccount, typeArgs);
          } else {
            submitter = await cls.submit(aptos.config, senderAccount);
          }
        }
      }
    }
    return submitter;
  };

  const builder = await getBuilder({ withFeePayer: false });
  const response = await builder.submit({
    primarySigner: senderAccount,
    secondarySigners,
  });
  const builderWithFeePayer = await getBuilder({ withFeePayer: true });
  const responseWithFeePayer = await builderWithFeePayer.submit({
    primarySigner: senderAccount,
    secondarySigners,
    feePayer,
  });
  const submitResponse = await getSubmitter({ withFeePayer: false });
  const submitResponseWithFeePayer = await getSubmitter({ withFeePayer: true });

  expect(response.success).toBe(true);
  expect(responseWithFeePayer.success).toBe(true);
  expect(submitResponse.success).toBe(true);
  expect(submitResponseWithFeePayer.success).toBe(true);

  const multiAgent = secondarySignerAddresses.length > 0;

  expect(response.signature!.type).toEqual(multiAgent ? "multi_agent_signature" : "single_sender");
  expect(responseWithFeePayer.signature!.type).toEqual("fee_payer_signature");
  expect(submitResponse.signature!.type).toEqual(multiAgent ? "multi_agent_signature" : "single_sender");
  expect(submitResponseWithFeePayer.signature!.type).toEqual("fee_payer_signature");

  const info = builder.responseInfo(response);
  expect(info.function).toEqual(
    `${builder.payloadBuilder.moduleAddress}::${builder.payloadBuilder.moduleName}::${builder.payloadBuilder.functionName}`,
  );

  return (
    response.success && responseWithFeePayer.success && submitResponse.success && submitResponseWithFeePayer.success
  );
}
