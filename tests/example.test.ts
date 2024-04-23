// // // Copyright © Aptos Foundation
// // // SPDX-License-Identifier: Apache-2.0

// import {
//   Account,
//   AptosConfig,
//   Network,
//   Aptos,
//   AccountAddress,
//   Bool,
//   U128,
//   U16,
//   U256,
//   U32,
//   U64,
//   U8,
//   TransactionFeePayerSignature,
//   TransactionMultiAgentSignature,
//   EntryFunctionArgumentTypes,
//   SimpleEntryFunctionArgumentTypes,
//   Ed25519PrivateKey,
//   UserTransactionResponse,
//   parseTypeTag,
//   Hex,
//   MoveValue,
//   FixedBytes,
//   MoveOption,
//   MoveString,
//   MoveVector,
//   Uint8,
//   Uint16,
//   Uint32,
//   Uint64,
//   Uint128,
//   Uint256,
//   TypeTag,
//   TransactionEd25519Signature,
//   EntryFunctionPayloadResponse,
// } from "@aptos-labs/ts-sdk";
// import {
//   rawTransactionHelper,
//   rawTransactionMultiAgentHelper,
//   publishArgumentTestModule,
//   PUBLISHER_ACCOUNT_PK,
//   PUBLISHER_ACCOUNT_ADDRESS,
//   normalizeObjectAddresses,
//   normalizeObjectAddress,
// } from "./helper";
// import {
//   EntryFunctionPayloadBuilder,
//   EntryFunctionTransactionBuilder,
//   InputTypes,
//   Option,
//   TransactionBuilder,
//   TypeTagInput,
//   fundAccounts,
// } from "../src";
// import { Example, TxArgsModule } from "../generated/args_test_suite";
// import { gray, lightBlue, lightGreen, lightMagenta } from "kolorist";
// import { ObjectAddressStruct } from "src/boilerplate/types";

// // Upper bound values for uint8, uint16, uint64 and uint128
// export const MAX_U8_NUMBER: Uint8 = 2 ** 8 - 1;
// export const MAX_U16_NUMBER: Uint16 = 2 ** 16 - 1;
// export const MAX_U32_NUMBER: Uint32 = 2 ** 32 - 1;
// export const MAX_U64_BIG_INT: Uint64 = BigInt(2) ** BigInt(64) - BigInt(1);
// export const MAX_U128_BIG_INT: Uint128 = BigInt(2) ** BigInt(128) - BigInt(1);
// export const MAX_U256_BIG_INT: Uint256 = BigInt(2) ** BigInt(256) - BigInt(1);

// jest.setTimeout(20000);

// // This test uses lots of helper functions, explained here:
// //  the `transactionArguments` array contains every possible argument type
// //  the `rawTransactionHelper` and `rawTransactionMultiAgentHelper` functions are helpers to generate the transactions,
// //    respectively for single signer transactions and for (multi signer & fee payer) transactions
// // In any transaction with a `&signer` the move function asserts that the first argument is the senderAccount's address:
// // `sender_address: address` or all of the `&signer` addresses: `signer_addresses: vector<address>`

// describe("various transaction arguments", () => {
//   const config = new AptosConfig({ network: Network.LOCAL });
//   const aptos = new Aptos(config);
//   const senderAccount = Account.fromPrivateKey({
//     privateKey: new Ed25519PrivateKey(PUBLISHER_ACCOUNT_PK),
//     legacy: false,
//   });
//   const secondarySignerAccounts = [Account.generate(), Account.generate(), Account.generate(), Account.generate()];
//   const feePayerAccount = Account.generate();
//   const moduleObjects: Array<AccountAddress> = [];
//   let transactionArguments: Array<EntryFunctionArgumentTypes>;
//   let simpleTransactionArguments: Array<InputTypes>;
//   let mixedTransactionArguments: Array<EntryFunctionArgumentTypes | SimpleEntryFunctionArgumentTypes>;
//   const EXPECTED_VECTOR_U8 = new Uint8Array([0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER]);
//   const EXPECTED_VECTOR_STRING = ["expected_string", "abc", "def", "123", "456", "789"];
//   let viewArgs: any;

//   beforeAll(async () => {
//     await fundAccounts(aptos, [senderAccount, ...secondarySignerAccounts, feePayerAccount]);
//     await publishArgumentTestModule(aptos, senderAccount);

//     // when deploying, `init_module` creates 3 objects and stores them into the `SetupData` resource
//     // within that resource is 3 fields: `empty_object_1`, `empty_object_2`, `empty_object_3`
//     // we need to extract those objects and use them as arguments for the entry functions
//     type SetupData = {
//       empty_object_1: { inner: string };
//       empty_object_2: { inner: string };
//       empty_object_3: { inner: string };
//     };

//     const setupData = await aptos.getAccountResource<SetupData>({
//       accountAddress: senderAccount.accountAddress.toString(),
//       resourceType: `${senderAccount.accountAddress.toString()}::tx_args_module::SetupData`,
//     });

//     moduleObjects.push(AccountAddress.from(setupData.empty_object_1.inner));
//     moduleObjects.push(AccountAddress.from(setupData.empty_object_2.inner));
//     moduleObjects.push(AccountAddress.from(setupData.empty_object_3.inner));

//     transactionArguments = [
//       new Bool(true),
//       new U8(1),
//       new U16(2),
//       new U32(3),
//       new U64(4),
//       new U128(5),
//       new U256(6),
//       senderAccount.accountAddress,
//       new MoveString("expected_string"),
//       moduleObjects[0],
//       new MoveVector([]),
//       MoveVector.Bool([true, false, true]),
//       MoveVector.U8(EXPECTED_VECTOR_U8),
//       MoveVector.U16([0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER]),
//       MoveVector.U32([0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER]),
//       MoveVector.U64([0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT]),
//       MoveVector.U128([0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT]),
//       MoveVector.U256([0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT]),
//       new MoveVector([
//         AccountAddress.from("0x0"),
//         AccountAddress.from("0xabc"),
//         AccountAddress.from("0xdef"),
//         AccountAddress.from("0x123"),
//         AccountAddress.from("0x456"),
//         AccountAddress.from("0x789"),
//       ]),
//       MoveVector.MoveString(EXPECTED_VECTOR_STRING),
//       new MoveVector(moduleObjects),
//       new MoveOption(),
//       new MoveOption(new Bool(true)),
//       new MoveOption(new U8(1)),
//       new MoveOption(new U16(2)),
//       new MoveOption(new U32(3)),
//       new MoveOption(new U64(4)),
//       new MoveOption(new U128(5)),
//       new MoveOption(new U256(6)),
//       new MoveOption(senderAccount.accountAddress),
//       new MoveOption(new MoveString("expected_string")),
//       new MoveOption(moduleObjects[0]),
//     ];

//     simpleTransactionArguments = [
//       true,
//       1,
//       2,
//       3,
//       4,
//       5,
//       6,
//       senderAccount.accountAddress.toString(),
//       "expected_string",
//       moduleObjects[0].toString(),
//       new Uint8Array([]),
//       [true, false, true],
//       [0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER],
//       [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
//       [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
//       [0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT.toString(10)],
//       [0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT.toString(10)],
//       [0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT.toString(10)],
//       ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
//       ["expected_string", "abc", "def", "123", "456", "789"],
//       moduleObjects.map((obj) => obj.toString()),
//       new Uint8Array([]),
//       [true],
//       [1],
//       [2],
//       [3],
//       [4],
//       [5],
//       [6],
//       [senderAccount.accountAddress.toString()],
//       ["expected_string"],
//       [moduleObjects[0].toString()],
//     ];

//     // Mixes different types of number arguments, and parsed an unparsed arguments
//     mixedTransactionArguments = [
//       true,
//       1,
//       2,
//       3,
//       4n,
//       BigInt(5),
//       "6",
//       senderAccount.accountAddress,
//       "expected_string",
//       moduleObjects[0],
//       [],
//       [true, false, true],
//       [0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER],
//       [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
//       [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
//       [0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT.toString(10)],
//       [0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT.toString(10)],
//       [0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT.toString(10)],
//       ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
//       ["expected_string", "abc", "def", "123", "456", "789"],
//       moduleObjects.map((obj) => obj.toString()),
//       null,
//       new MoveOption(new Bool(true)),
//       1,
//       2,
//       3,
//       4,
//       5,
//       6,
//       senderAccount.accountAddress.toString(),
//       "expected_string",
//       moduleObjects[0].toString(),
//     ];

//     viewArgs = [
//       true,
//       1,
//       2,
//       3,
//       "4",
//       "5",
//       "6",
//       senderAccount.accountAddress.toString(),
//       "This is my favorite string :)",
//       moduleObjects[0].toString(),
//       new Uint8Array([1, 2, 3]),
//       [true, false, true],
//       new Uint8Array([0, 255, 1, 2]),
//       [1, 2, 3, 4],
//       [5, 6, 7, 8],
//       ["9", "10", "11", "12"],
//       ["13", "14", "15", "16"],
//       ["17", "18", "19", "20"],
//       [
//         AccountAddress.ZERO,
//         AccountAddress.ONE,
//         AccountAddress.TWO,
//         AccountAddress.THREE,
//         AccountAddress.FOUR,
//         senderAccount.accountAddress,
//       ].map((a) => a.toString()),
//       ["this", "is", "a", "string"],
//     ];

//     return true;
//   });

//   const tts = [
//     "bool",
//     "u8",
//     "u16",
//     "u32",
//     "u64",
//     "u128",
//     "u256",
//     "address",
//     "0x1::string::String",
//     `0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>`,
//     "vector<bool>",
//     "vector<u8>",
//     "vector<u16>",
//     "vector<u32>",
//     "vector<u64>",
//     "vector<u128>",
//     "vector<u256>",
//     "vector<address>",
//     "vector<0x1::string::String>",
//     `vector<0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>>`,
//     "0x1::option::Option<bool>",
//     "0x1::option::Option<u8>",
//     "0x1::option::Option<u16>",
//     "0x1::option::Option<u32>",
//     "0x1::option::Option<u64>",
//     "0x1::option::Option<u128>",
//     "0x1::option::Option<u256>",
//     "0x1::option::Option<address>",
//     "0x1::option::Option<0x1::string::String>",
//     `0x1::option::Option<0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>>`,
//     `vector<vector<0x1::option::Option<vector<0x1::option::Option<0x1::object::Object<${PUBLISHER_ACCOUNT_ADDRESS}::tx_args_module::EmptyResource>>>>>>`,
//   ];

//   describe("all builder paths", () => {
//     describe("tests type_tags, a function with 31 complex type tags", () => {
//       let baseBuilder: EntryFunctionTransactionBuilder;
//       const typeTags = tts as [
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//         TypeTagInput,
//       ];

//       // We use the base builders to check the fully qualified function call name- not fee payer/secondary signers
//       beforeAll(async () => {
//         baseBuilder = await TxArgsModule.TypeTags.builder(aptos.config, senderAccount.accountAddress, typeTags);
//       });

//       it("builds with no fee payer", async () => {
//         const builder = baseBuilder;
//         const response = await builder.submit({
//           primarySigner: senderAccount,
//         });
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });
//       it("builds with a fee payer", async () => {
//         const builder = await TxArgsModule.TypeTags.builder(
//           aptos.config,
//           senderAccount.accountAddress,
//           typeTags,
//           feePayerAccount.accountAddress,
//         );
//         const response = await builder.submit({
//           primarySigner: senderAccount,
//           feePayer: feePayerAccount,
//         });
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//             feePayer: feePayerAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });
//       it("combines build/submit and successfully submits", async () => {
//         const response = await TxArgsModule.TypeTags.submit(aptos.config, senderAccount, typeTags);
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });
//       it("combines build/submit and successfully submits with a fee payer", async () => {
//         const response = await TxArgsModule.TypeTags.submit(aptos.config, senderAccount, typeTags, feePayerAccount);
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//             feePayer: feePayerAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });
//     });
//     describe("tests public_arguments, a function with all argument types except `&signer`", () => {
//       let baseBuilder: EntryFunctionTransactionBuilder;
//       // We use the base builders to check the fully qualified function call name- not fee payer/secondary signers
//       beforeAll(async () => {
//         baseBuilder = await TxArgsModule.PublicArguments.builder(
//           aptos.config,
//           senderAccount.accountAddress,
//           true,
//           1,
//           2,
//           3,
//           4,
//           5,
//           6,
//           senderAccount.accountAddress.toString(),
//           "expected_string",
//           moduleObjects[0].toString(),
//           new Uint8Array([]),
//           [true, false, true],
//           new Uint8Array([0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER]),
//           [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
//           [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
//           [0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT],
//           [0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT],
//           [0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT],
//           ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
//           ["expected_string", "abc", "def", "123", "456", "789"],
//           moduleObjects.map((obj) => obj.toString()),
//           [],
//           [true],
//           [1],
//           [2],
//           [3],
//           [4],
//           [5],
//           [6],
//           [senderAccount.accountAddress.toString()],
//           ["expected_string"],
//           [moduleObjects[0].toString()],
//         );
//       });

//       it("builds with no fee payer", async () => {
//         const builder = baseBuilder;
//         const response = await builder.submit({
//           primarySigner: senderAccount,
//         });
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });

//       it("builds with a fee payer", async () => {
//         const builder = await TxArgsModule.PublicArguments.builder(
//           aptos.config,
//           senderAccount.accountAddress,
//           true,
//           1,
//           2,
//           3,
//           4,
//           5,
//           6,
//           senderAccount.accountAddress.toString(),
//           "expected_string",
//           moduleObjects[0].toString(),
//           new Uint8Array([]),
//           [true, false, true],
//           new Uint8Array([0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER]),
//           [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
//           [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
//           [0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT],
//           [0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT],
//           [0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT],
//           ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
//           ["expected_string", "abc", "def", "123", "456", "789"],
//           moduleObjects.map((obj) => obj.toString()),
//           [],
//           [true],
//           [1],
//           [2],
//           [3],
//           [4],
//           [5],
//           [6],
//           [senderAccount.accountAddress.toString()],
//           ["expected_string"],
//           [moduleObjects[0].toString()],
//           feePayerAccount.accountAddress,
//         );
//         const response = await builder.submit({
//           primarySigner: senderAccount,
//           feePayer: feePayerAccount,
//         });
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//             feePayer: feePayerAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });
//       it("combines build/submit and successfully submits with a fee payer", async () => {
//         const response = await TxArgsModule.PublicArguments.submit(
//           aptos.config,
//           senderAccount,
//           true,
//           1,
//           2,
//           3,
//           4,
//           5,
//           6,
//           senderAccount.accountAddress.toString(),
//           "expected_string",
//           moduleObjects[0].toString(),
//           new Uint8Array([]),
//           [true, false, true],
//           new Uint8Array([0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER]),
//           [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
//           [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
//           [0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT],
//           [0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT],
//           [0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT],
//           ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
//           ["expected_string", "abc", "def", "123", "456", "789"],
//           moduleObjects.map((obj) => obj.toString()),
//           [],
//           [true],
//           [1],
//           [2],
//           [3],
//           [4],
//           [5],
//           [6],
//           [senderAccount.accountAddress.toString()],
//           ["expected_string"],
//           [moduleObjects[0].toString()],
//         );
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });
//       it("combines build/submit and successfully submits", async () => {
//         const response = await TxArgsModule.PublicArguments.submit(
//           aptos.config,
//           senderAccount,
//           true,
//           1,
//           2,
//           3,
//           4,
//           5,
//           6,
//           senderAccount.accountAddress.toString(),
//           "expected_string",
//           moduleObjects[0].toString(),
//           new Uint8Array([]),
//           [true, false, true],
//           new Uint8Array([0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER]),
//           [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
//           [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
//           [0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT],
//           [0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT],
//           [0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT],
//           ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
//           ["expected_string", "abc", "def", "123", "456", "789"],
//           moduleObjects.map((obj) => obj.toString()),
//           [],
//           [true],
//           [1],
//           [2],
//           [3],
//           [4],
//           [5],
//           [6],
//           [senderAccount.accountAddress.toString()],
//           ["expected_string"],
//           [moduleObjects[0].toString()],
//           feePayerAccount,
//         );
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//             feePayer: feePayerAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });
//     });
//     describe("tests public_arguments_multiple_signers, a multi-agent function with all argument types except `&signer`", () => {
//       let baseBuilder: EntryFunctionTransactionBuilder;

//       // We use the base builders to check the fully qualified function call name- not fee payer/secondary signers
//       beforeAll(async () => {
//         baseBuilder = await TxArgsModule.PublicArgumentsMultipleSigners.builder(
//           aptos.config,
//           senderAccount.accountAddress,
//           secondarySignerAccounts[0].accountAddress,
//           secondarySignerAccounts[1].accountAddress,
//           secondarySignerAccounts[2].accountAddress,
//           secondarySignerAccounts[3].accountAddress,
//           [senderAccount.accountAddress, ...secondarySignerAccounts.map((s) => s.accountAddress)],
//           true,
//           1,
//           2,
//           3,
//           4,
//           5,
//           6,
//           senderAccount.accountAddress.toString(),
//           "expected_string",
//           moduleObjects[0].toString(),
//           new Uint8Array([]),
//           [true, false, true],
//           new Uint8Array([0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER]),
//           [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
//           [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
//           [0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT],
//           [0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT],
//           [0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT],
//           ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
//           ["expected_string", "abc", "def", "123", "456", "789"],
//           moduleObjects.map((obj) => obj.toString()),
//           [],
//           [true],
//           [1],
//           [2],
//           [3],
//           [4],
//           [5],
//           [6],
//           [senderAccount.accountAddress.toString()],
//           ["expected_string"],
//           [moduleObjects[0].toString()],
//         );
//       });

//       it("builds with no fee payer", async () => {
//         const builder = baseBuilder;
//         const response = await builder.submit({
//           primarySigner: senderAccount,
//           secondarySigners: secondarySignerAccounts,
//         });
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//             secondary: secondarySignerAccounts,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });
//       it("builds with a fee payer", async () => {
//         const builder = await TxArgsModule.PublicArgumentsMultipleSigners.builder(
//           aptos.config,
//           senderAccount.accountAddress,
//           secondarySignerAccounts[0].accountAddress,
//           secondarySignerAccounts[1].accountAddress,
//           secondarySignerAccounts[2].accountAddress,
//           secondarySignerAccounts[3].accountAddress,
//           [senderAccount.accountAddress, ...secondarySignerAccounts.map((s) => s.accountAddress)],
//           true,
//           1,
//           2,
//           3,
//           4,
//           5,
//           6,
//           senderAccount.accountAddress.toString(),
//           "expected_string",
//           moduleObjects[0].toString(),
//           new Uint8Array([]),
//           [true, false, true],
//           new Uint8Array([0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER]),
//           [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
//           [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
//           [0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT],
//           [0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT],
//           [0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT],
//           ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
//           ["expected_string", "abc", "def", "123", "456", "789"],
//           moduleObjects.map((obj) => obj.toString()),
//           [],
//           [true],
//           [1],
//           [2],
//           [3],
//           [4],
//           [5],
//           [6],
//           [senderAccount.accountAddress.toString()],
//           ["expected_string"],
//           [moduleObjects[0].toString()],
//           feePayerAccount.accountAddress,
//         );
//         const response = await builder.submit({
//           primarySigner: senderAccount,
//           secondarySigners: secondarySignerAccounts,
//           feePayer: feePayerAccount,
//         });
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//             secondary: secondarySignerAccounts,
//             feePayer: feePayerAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });
//       it("combines build/submit and successfully submits", async () => {
//         const response = await TxArgsModule.PublicArgumentsMultipleSigners.submit(
//           aptos.config,
//           senderAccount,
//           secondarySignerAccounts[0],
//           secondarySignerAccounts[1],
//           secondarySignerAccounts[2],
//           secondarySignerAccounts[3],
//           [senderAccount.accountAddress, ...secondarySignerAccounts.map((s) => s.accountAddress)],
//           true,
//           1,
//           2,
//           3,
//           4,
//           5,
//           6,
//           senderAccount.accountAddress.toString(),
//           "expected_string",
//           moduleObjects[0].toString(),
//           new Uint8Array([]),
//           [true, false, true],
//           new Uint8Array([0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER]),
//           [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
//           [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
//           [0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT],
//           [0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT],
//           [0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT],
//           ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
//           ["expected_string", "abc", "def", "123", "456", "789"],
//           moduleObjects.map((obj) => obj.toString()),
//           [],
//           [true],
//           [1],
//           [2],
//           [3],
//           [4],
//           [5],
//           [6],
//           [senderAccount.accountAddress.toString()],
//           ["expected_string"],
//           [moduleObjects[0].toString()],
//         );
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//             secondary: secondarySignerAccounts,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });
//       it("combines build/submit and successfully submits with a fee payer", async () => {
//         const response = await TxArgsModule.PublicArgumentsMultipleSigners.submit(
//           aptos.config,
//           senderAccount,
//           secondarySignerAccounts[0],
//           secondarySignerAccounts[1],
//           secondarySignerAccounts[2],
//           secondarySignerAccounts[3],
//           [senderAccount.accountAddress, ...secondarySignerAccounts.map((s) => s.accountAddress)],
//           true,
//           1,
//           2,
//           3,
//           4,
//           5,
//           6,
//           senderAccount.accountAddress.toString(),
//           "expected_string",
//           moduleObjects[0].toString(),
//           new Uint8Array([]),
//           [true, false, true],
//           new Uint8Array([0, 1, 2, MAX_U8_NUMBER - 2, MAX_U8_NUMBER - 1, MAX_U8_NUMBER]),
//           [0, 1, 2, MAX_U16_NUMBER - 2, MAX_U16_NUMBER - 1, MAX_U16_NUMBER],
//           [0, 1, 2, MAX_U32_NUMBER - 2, MAX_U32_NUMBER - 1, MAX_U32_NUMBER],
//           [0, 1, 2, MAX_U64_BIG_INT - BigInt(2), MAX_U64_BIG_INT - BigInt(1), MAX_U64_BIG_INT],
//           [0, 1, 2, MAX_U128_BIG_INT - BigInt(2), MAX_U128_BIG_INT - BigInt(1), MAX_U128_BIG_INT],
//           [0, 1, 2, MAX_U256_BIG_INT - BigInt(2), MAX_U256_BIG_INT - BigInt(1), MAX_U256_BIG_INT],
//           ["0x0", "0xabc", "0xdef", "0x123", "0x456", "0x789"],
//           ["expected_string", "abc", "def", "123", "456", "789"],
//           moduleObjects.map((obj) => obj.toString()),
//           [],
//           [true],
//           [1],
//           [2],
//           [3],
//           [4],
//           [5],
//           [6],
//           [senderAccount.accountAddress.toString()],
//           ["expected_string"],
//           [moduleObjects[0].toString()],
//           feePayerAccount,
//         );
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//             secondary: secondarySignerAccounts,
//             feePayer: feePayerAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });
//     });
//     describe("tests complex_arguments, a function with complex, nested argument types", () => {
//       let baseBuilder: EntryFunctionTransactionBuilder;
//       const optionArray = [EXPECTED_VECTOR_STRING] as Option<Array<string>>;
//       const deeplyNested3 = [optionArray, optionArray, optionArray];
//       const deeplyNested4 = [deeplyNested3, deeplyNested3, deeplyNested3];

//       beforeAll(async () => {
//         baseBuilder = await TxArgsModule.ComplexArguments.builder(
//           aptos.config,
//           senderAccount.accountAddress,
//           [EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8],
//           [EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING],
//           deeplyNested3,
//           deeplyNested4,
//         );
//       });

//       it("builds with no fee payer", async () => {
//         const builder = baseBuilder;
//         const response = await builder.submit({
//           primarySigner: senderAccount,
//         });
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });

//       it("builds with a fee payer", async () => {
//         const builder = await TxArgsModule.ComplexArguments.builder(
//           aptos.config,
//           senderAccount.accountAddress,
//           [EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8],
//           [EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING],
//           deeplyNested3,
//           deeplyNested4,
//           feePayerAccount.accountAddress,
//         );
//         const response = await builder.submit({
//           primarySigner: senderAccount,
//           feePayer: feePayerAccount,
//         });
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//             feePayer: feePayerAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });

//       it("combines build/submit and successfully submits", async () => {
//         const response = await TxArgsModule.ComplexArguments.submit(
//           aptos.config,
//           senderAccount,
//           [EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8],
//           [EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING],
//           deeplyNested3,
//           deeplyNested4,
//         );
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });

//       it("combines build/submit and successfully submits with a fee payer", async () => {
//         const response = await TxArgsModule.ComplexArguments.submit(
//           aptos.config,
//           senderAccount,
//           [EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8],
//           [EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING, EXPECTED_VECTOR_STRING],
//           deeplyNested3,
//           deeplyNested4,
//           feePayerAccount,
//         );
//         checkResponse({
//           signers: {
//             primary: senderAccount,
//             feePayer: feePayerAccount,
//           },
//           builder: baseBuilder,
//           response,
//         });
//       });
//     });

//     it("tests view_all_arguments, a view function that outputs all the arguments passed in", async () => {
//       const viewAllArguments = await new TxArgsModule.ViewSomeArguments(
//         viewArgs[0],
//         viewArgs[1],
//         viewArgs[2],
//         viewArgs[3],
//         viewArgs[4],
//         viewArgs[5],
//         viewArgs[6],
//         viewArgs[7],
//         viewArgs[8],
//         viewArgs[9],
//         viewArgs[10],
//         Array.from(viewArgs[11]),
//         viewArgs[12],
//         Array.from(viewArgs[13]),
//         Array.from(viewArgs[14]),
//         Array.from(viewArgs[15]),
//         Array.from(viewArgs[16]),
//         Array.from(viewArgs[17]),
//         Array.from(viewArgs[18]),
//         Array.from(viewArgs[19]),
//       ).submit({ aptos });
//       viewAllArguments.forEach((arg: any, i: number) => {
//         if (i == 9) {
//           const arg = viewAllArguments[i]; // for explicit type checking
//           expect(normalizeObjectAddress(arg)).toEqual({ inner: viewArgs[i].toString() });
//         } else if (i == 10 || i == 12) {
//           expect(arg).toEqual(Hex.fromHexInput(new Uint8Array(viewArgs[i].map((n: any) => n))).toString());
//         } else if (i == 15 || i == 16 || i == 17) {
//           expect(arg).toEqual(viewArgs[i].map((n: any) => n.toString()));
//         } else {
//           expect(arg).toEqual(viewArgs[i]);
//         }
//       });
//     });
//   });

  // describe("the example.move file with more meaningful examples", () => {
  //   // We use the base builders to check the fully qualified function call name- not fee payer/secondary signers
  //   it("tests the example.move code", async () => {
  //     const [objAddress] = await new Example.GetObjAddress().submit({ aptos });
  //     console.log(objAddress);

  //     // this will only work one time after publish.
  //     await Example.MoveValuesToObject.submit(
  //       aptos.config,
  //       senderAccount,
  //       secondarySignerAccounts[0],
  //       secondarySignerAccounts[1],
  //       true,
  //       123,
  //       "this is a strrreeeing",
  //       new U64(100),
  //       new U128(1000),
  //       MoveVector.U8([1, 2, 3]),
  //       ["u64", "u128", "vector<u8>"],
  //     );

  //     // const response = await new Example.ViewObjectValues(
  //     //   objAddress,
  //     //   [`${PUBLISHER_ACCOUNT_ADDRESS}::example::SomeResource<u64, u128, vector<u8>>`, "u64", "u128", "vector<u8>"],
  //     // ).submit({ aptos });

  //     // console.log(response);
  //   });
  // });

  // // TODO: Fix, currently broken
  // it.skip("tests view_complex_outputs, a view function with complex, nested output types", async () => {
  //   const viewComplexOutputs = await new TxArgsModule.ViewComplexOutputs().submit({
  //     aptos,
  //   });

//     /*

//       // The below does not work. Keeping it for reference.
//       type OptionVec<T> = {
//         vec: T;
//       }

//       type ViewComplexArgumentsPayloadMoveArguments = {
//         deeply_nested_1: Array<HexInput>;
//         deeply_nested_2: Array<Array<ObjectAddressStruct>>;
//         deeply_nested_3: Array<OptionVec<Array<ObjectAddressStruct>>>;
//         deeply_nested_4: Array<Array<Array<Array<ObjectAddressStruct>>>>;
//       };

//       const toObjectAddressStruct = (argA: ObjectAddress) => {
//         return {
//           inner: AccountAddress.from(argA).toString(),
//         }
//       }

//       // in ViewComplexArguments constructor body:

//     this.args = {
//       deeply_nested_1: deeply_nested_1.map((argA) =>
//         Hex.fromHexInput(argA).toString(),
//       ),
//       deeply_nested_2: deeply_nested_2.map((argA) =>
//         argA.map((argB) => toObjectAddressStruct(argB)
//       )),
//       // deeply_nested_3: [
//       //   { vec: [AccountAddress.ZERO], }
//       // ],
//       deeply_nested_3: deeply_nested_3.map((argA) => {
//         return {
//           vec: argA[0] ? argA[0].map((argB) => toObjectAddressStruct(argB)) : [],
//         }
//       }
//       ),
//       deeply_nested_4: [],

//       // TODO: Fix Option output to be `vec: []`, currently it's trying to cast it to an array of one element I think
//       // this is specifically for the response outputs
//       console.log(JSON.stringify(viewComplexOutputs, null, 3));
//       // console.log(viewComplexOutputs);
//       const objectArray = [moduleObjects[0], moduleObjects[1], moduleObjects[2]].map(s => s.toString());
//       const deeplyNested3 = [[objectArray], [], [objectArray]];
//       const deeplyNested4 = [deeplyNested3, deeplyNested3, deeplyNested3];
//       const complexArgsResponse = await new TxArgsModule.ViewComplexArguments(
//         [EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8, EXPECTED_VECTOR_U8],
//         [objectArray, objectArray, objectArray],
//         deeplyNested3,
//         deeplyNested4,
//       ).submit({
//         aptos,
//       });
//       console.log(JSON.stringify(complexArgsResponse, null, 3));
//       */
//   });
// });

// export function checkResponse(args: {
//   signers: {
//     primary: Account;
//     secondary?: Array<Account>;
//     feePayer?: Account;
//   };
//   builder: EntryFunctionTransactionBuilder;
//   response: UserTransactionResponse;
// }) {
//   const { builder, response } = args;
//   const { primary, secondary, feePayer } = args.signers;
//   const secondarySenders = secondary ?? [];
//   const withFeePayer = feePayer !== undefined;

//   const multiAgent = secondarySenders.length > 0;

//   if (withFeePayer) {
//     expect(response.signature!.type).toEqual("fee_payer_signature");
//   } else {
//     if (!multiAgent) {
//       expect(response.signature!.type).toEqual("single_sender");
//     } else {
//       expect(response.signature!.type).toEqual("multi_agent_signature");
//     }
//   }

//   expect(AccountAddress.from(response.sender).equals(primary.accountAddress)).toEqual(true);
//   const payload = response.payload as EntryFunctionPayloadResponse;
//   const split = payload.function.split("::");
//   // normalize
//   const moduleAddress = AccountAddress.from(split[0]);
//   const moduleName = split[1];
//   const functionName = split[2];
//   const fullyQualifiedFunctionCall = `${moduleAddress}::${moduleName}::${functionName}`;

//   expect(fullyQualifiedFunctionCall).toEqual(
//     `${builder.payloadBuilder.moduleAddress}::${builder.payloadBuilder.moduleName}::${builder.payloadBuilder.functionName}`,
//   );

//   expect(response.success).toEqual(true);
// }
