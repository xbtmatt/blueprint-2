// Copyright © Aptos Foundation
// SPDX-License-Identifier: Apache-2.0

import {
  AccountAddress,
  Aptos,
  MoveFunctionGenericTypeParam,
  TypeTag,
  parseTypeTag,
  TypeTagVector,
  TypeTagAddress,
  TypeTagSigner,
} from "@aptos-labs/ts-sdk";
import { getArgNameMapping, getMoveFunctionsWithArgumentNames, getSourceCodeMap } from "./packageMetadata.js";
import {
  ABIGeneratedCodeMap,
  AbiFunctions,
  AnnotatedBCSArgument,
  EntryFunctionArgumentSignature,
  codeGeneratorOptions,
  fetchModuleABIs,
  isAbiDefined,
  toFlattenedTypeTag,
  toPascalCase,
  truncateAddressForFileName,
  truncatedTypeTagString,
  copyCode,
  TypeTagEnum,
  toClassString,
  toClassesString,
  toInputTypeString,
  transformEntryFunctionInputTypes,
  transformViewFunctionInputTypes,
  isSignerReference,
  IMPORT_ACCOUNT_ADDRESS,
  PRIMARY_SENDER_FIELD_NAME,
  FEE_PAYER_FIELD_NAME,
  SECONDARY_SENDERS_FIELD_NAME,
  MODULE_ADDRESS_FIELD_NAME,
  R_PARENTHESIS,
  TransactionType,
  InputTransactionType,
  EntryFunctionTransactionBuilder,
} from "../index.js";
import fs from "fs";
import { ConfigDictionary } from "./config.js";
import { format } from "prettier";
import {
  DEFAULT_ARGUMENT_BASE,
  FOR_GENERATION_DIRECTORY,
  PAYLOAD_BUILDERS_FILE_NAME,
  ABI_TYPES_FILE_NAME,
  getBoilerplateImports,
  BOILERPLATE_COPYRIGHT,
} from "../index.js";
import {
  blue,
  red,
  yellow,
  green,
  white,
  lightGreen,
  ansi256Bg,
  ansi256,
  lightBlue,
  lightMagenta,
  lightYellow,
} from "kolorist";

export class CodeGenerator {
  public readonly config: ConfigDictionary;

  constructor(config: ConfigDictionary) {
    this.config = config;
  }

  // Note that the suppliedFieldNames includes the `&signer` and `signer` fields.
  metaclassBuilder(args: codeGeneratorOptions): string {
    const {
      moduleAddress,
      moduleName,
      functionName,
      className,
      functionArgumentTypeTags,
      displaySignerArgsAsComments,
      suppliedFieldNames,
      visibility,
      genericTypeParams,
      documentation,
    } = args;
    // These are the parsed type tags from the source code
    const genericTypeTagsString = args.genericTypeTags ?? "";
    const genericTypeTags = genericTypeTagsString
      .split(",")
      .filter((t) => t !== "")
      .map((t) => {
        return t.split(":")[0];
      });

    // Match the generic type tags with their corresponding generic type params

    const viewFunction = args.viewFunction ?? false;
    const fieldNames = suppliedFieldNames ?? [];

    // Check if the user supplied field names
    // If they're undefined or length 0, generate them
    if (fieldNames === undefined || fieldNames.length === 0) {
      for (let i = 0; i < functionArgumentTypeTags.length; i += 1) {
        fieldNames.push(`${DEFAULT_ARGUMENT_BASE}${i}`);
      }
      // otherwise, ensure that the array lengths match
    } else if (fieldNames.length !== functionArgumentTypeTags.length) {
      console.log(
        moduleAddress.toString(),
        moduleName,
        functionName,
        fieldNames,
        functionArgumentTypeTags.map((t) => t.toString()),
      );
      throw new Error(
        `fieldNames.length (${fieldNames.length}) !== functionArgumentsTypeTags.length (${functionArgumentTypeTags.length})`,
      );
    }

    // --------------- Handle signers --------------- //
    // console.log(genericTypeTags);
    // Get the array of annotated BCS class names, their string representation, and original TypeTag string
    const { signerArguments, functionArguments, genericsWithAbilities } = this.getClassArgTypes(
      functionArgumentTypeTags,
      genericTypeParams,
    );
    const lines: Array<string> = [];

    const argsType = `${className}PayloadMoveArguments`;
    const signerArgumentNames = suppliedFieldNames ? suppliedFieldNames.splice(0, signerArguments.length) : [];

    // ---------- Declare class field types separately ---------- //
    if (functionArguments.length > 0) {
      lines.push(`export type ${argsType} = {`);
      functionArguments.forEach((functionArgument, i) => {
        if (viewFunction) {
          const viewFunctionInputTypeConverter = toInputTypeString(functionArgument.typeTagArray, viewFunction);
          lines.push(`${fieldNames[i]}: ${viewFunctionInputTypeConverter};`);
        } else {
          lines.push(`${fieldNames[i]}: ${functionArgument.classString};`);
        }
      });
      lines.push("}");
    }
    lines.push("");

    // ---------- Documentation --------- //
    const atleastOneGeneric = (genericTypeTagsString ?? "").length > 0;
    const leftCaret = atleastOneGeneric ? "<" : "";
    const rightCaret = atleastOneGeneric ? ">" : "";

    const funcSignatureLines = new Array<string>();
    if (documentation?.displayFunctionSignature) {
      funcSignatureLines.push("/**");
      funcSignatureLines.push(viewFunction ? "*  #[view]" : "");
      funcSignatureLines.push(
        `*  ${visibility == "public" ? visibility : ""} ${viewFunction ? "" : "entry"}` +
          `fun ${functionName}${leftCaret}${genericTypeTagsString}${rightCaret}(`,
      );
      signerArguments.forEach((signerArgument, i) => {
        funcSignatureLines.push(`*     ${signerArgumentNames[i]}: ${signerArgument.annotation},`);
      });
      functionArguments.forEach((functionArgument, i) => {
        funcSignatureLines.push(`*     ${fieldNames[i]}: ${functionArgument.annotation},`);
      });
      funcSignatureLines.push("*   )");
      funcSignatureLines.push("**/");
    }
    const functionSignature = funcSignatureLines.join("\n");
    lines.push(functionSignature);

    const accountAddressInputString = toInputTypeString([new TypeTagAddress()], viewFunction);
    const accountAddressClassString = toClassString(TypeTagEnum.AccountAddress);

    // ---------- Class fields ---------- //
    const entryOrView = viewFunction ? "View" : "Entry";
    const secondarySenders = signerArguments.slice(1).map((s) => accountAddressClassString);
    const classFields =
      `
    export class ${className} extends ${entryOrView}FunctionPayloadBuilder {
      public readonly moduleAddress = ${MODULE_ADDRESS_FIELD_NAME};
      public readonly moduleName = "${moduleName}";
      public readonly functionName = "${functionName}";
      public readonly args: ${functionArguments.length > 0 ? argsType : "{ }"};
      public readonly typeTags: Array<TypeTag> = []; ${atleastOneGeneric ? `// ${genericTypeTagsString}` : ""}` +
      "\n" +
      // only add senders if it's an entry function
      (viewFunction
        ? ""
        : `public readonly ${PRIMARY_SENDER_FIELD_NAME}: ${accountAddressClassString};
      public readonly ${SECONDARY_SENDERS_FIELD_NAME}: [${secondarySenders.join(", ")}]${
        secondarySenders.length > 0 ? "" : " = []"
      };
      public readonly ${FEE_PAYER_FIELD_NAME}?: ${accountAddressClassString};`);
    lines.push(classFields);
    lines.push("\n");

    // -------- Constructor input types -------- //
    // constructor fields
    const constructorSenders = new Array<string>();
    const constructorOtherArgs = new Array<string>();
    const noSignerArgEntryFunction = !viewFunction && signerArguments.length === 0;

    lines.push(`private constructor(`);
    signerArguments.forEach((signerArgument, i) => {
      if (this.config.includeAccountParams) {
        // TODO: Add support for adding an Account directly in the constructor..?
        constructorSenders.push(`${signerArgumentNames[i]}: Account, // ${signerArgument.annotation}`);
      } else {
        // signers are `AccountAddress` in the constructor signature because we're just generating the raw transaction here.
        constructorSenders.push(
          `${signerArgumentNames[i]}: ${accountAddressInputString}, // ${signerArgument.annotation}`,
        );
      }
    });
    // If this is an entry function and the `signer` isn't included in the entry function arguments,
    // we still need to set the primarySender class field in the constructor
    if (noSignerArgEntryFunction) {
      constructorSenders.push(
        `${PRIMARY_SENDER_FIELD_NAME}: ${accountAddressInputString}, // not used in the entry function as an argument, but needed to submit the transaction`,
      );
    }
    functionArguments.forEach((functionArgument, i) => {
      const inputType = toInputTypeString(functionArgument.typeTagArray, viewFunction);
      const argComment = ` // ${functionArgument.annotation}`;
      constructorOtherArgs.push(`${fieldNames[i]}: ${inputType}, ${argComment}`);
    });
    if (genericTypeTagsString) {
      constructorOtherArgs.push(
        `typeTags: Array<TypeTagInput>, ${atleastOneGeneric ? "//" : ""} ${genericTypeTagsString}`,
      );
    }
    if (!viewFunction) {
      if (this.config.includeAccountParams) {
        constructorOtherArgs.push("feePayer?: Account, // optional fee payer account to sponsor the transaction");
      } else {
        constructorOtherArgs.push(
          `feePayer?: ${accountAddressInputString}, // optional fee payer account to sponsor the transaction`,
        );
      }
    }
    lines.push(constructorSenders.join("\n"));
    lines.push(constructorOtherArgs.join("\n"));
    lines.push(`) {`);

    // -------- Assign constructor fields to class fields -------- //
    lines.push(`super();`);
    const signerArgumentNamesAsClasses = signerArgumentNames.map(
      (signerArgumentName) => `AccountAddress.fromRelaxed(${signerArgumentName})`,
    );
    const primarySenderAssignment = `this.${PRIMARY_SENDER_FIELD_NAME} = ${signerArgumentNamesAsClasses[0]};`;
    const secondarySenderAssignment = `this.${SECONDARY_SENDERS_FIELD_NAME} = [${signerArgumentNamesAsClasses
      .slice(1)
      .join(", ")}];`;

    if (noSignerArgEntryFunction) {
      lines.push(`this.${PRIMARY_SENDER_FIELD_NAME} = AccountAddress.fromRelaxed(${PRIMARY_SENDER_FIELD_NAME});`);
    } else {
      lines.push(signerArguments.length >= 1 ? primarySenderAssignment : "");
      lines.push(signerArguments.length > 1 ? secondarySenderAssignment : "");
    }

    lines.push(`this.args = {`);
    functionArguments.forEach((_, i) => {
      // Don't use BCS classes for view functions, since they don't need to be serialized
      // Although we can use them eventually when view functions accepts BCS inputs
      if (viewFunction) {
        // lines.push(`${fieldNames[i]}: ${functionArguments[i].kindArray},`);
        const viewFunctionInputTypeConverter = transformViewFunctionInputTypes(
          fieldNames[i],
          functionArguments[i].typeTagArray,
          0,
        );
        lines.push(`${fieldNames[i]}: ${viewFunctionInputTypeConverter},`);
      } else {
        const entryFunctionInputTypeConverter = transformEntryFunctionInputTypes(
          fieldNames[i],
          functionArguments[i].typeTagArray,
          0,
        );
        lines.push(`${fieldNames[i]}: ${entryFunctionInputTypeConverter},`);
      }
    });
    lines.push(`}`);
    if (genericTypeTagsString) {
      lines.push(
        `this.typeTags = typeTags.map(typeTag => typeof typeTag === 'string' ? parseTypeTag(typeTag) : typeTag);`,
      );
    }
    if (!viewFunction) {
      lines.push(
        `this.${FEE_PAYER_FIELD_NAME} = (${FEE_PAYER_FIELD_NAME} !== undefined) ? AccountAddress.fromRelaxed(${FEE_PAYER_FIELD_NAME}) : undefined;`,
      );
    }
    lines.push(`}`);

    if (!viewFunction) {
      const withAndWithoutFeePayer = [true, false];
      withAndWithoutFeePayer.forEach((withFeePayer) => {
        lines.push(
          this.createPayloadBuilder(
            signerArguments,
            signerArgumentNames,
            functionArguments,
            fieldNames,
            withFeePayer,
            accountAddressInputString,
            genericTypeTags,
            noSignerArgEntryFunction,
          ),
        );
      });

      withAndWithoutFeePayer.forEach((withFeePayer) => {
        lines.push(
          this.createTransactionBuilder(
            className,
            signerArguments,
            signerArgumentNames,
            functionArguments,
            fieldNames,
            withFeePayer,
            genericTypeTags,
            noSignerArgEntryFunction,
          ),
        );
      });
    }
    lines.push(`\n } \n`);
    return lines.join("\n");
  }

  // TODO: Fix
  // right now this is non-maintainable and very messy
  // What you should do is create an abstract implementation of build and buildWithFeePayer
  // with the base functionality and then find a way to make `build` and `buildWithFeePayer`
  // implementations in the subclasses by packing the signerArgumentNames into the primarySender
  // and secondarySenders args that would be in the abstract implementation. That way it's more modular and
  // maintainable and you're not repeating this code everywhere
  createPayloadBuilder(
    signerArguments: Array<AnnotatedBCSArgument>,
    signerArgumentNames: Array<string>,
    functionArguments: Array<AnnotatedBCSArgument>,
    fieldNames: Array<string>,
    withFeePayer: boolean,
    accountAddressInputString: string,
    genericTypeTags: Array<string>, // these parsed generic names if they're available, we just use them for counting
    noSignerArgEntryFunction: boolean,
  ) {
    const isViewFunction = false;

    // to avoid mutating the original array
    signerArguments = Array.from(signerArguments);

    // If there's no signer args in the entry function, we need to add the primary sender to the constructor
    // because a payload needs a sender, even if it's not used in the entry function
    if (noSignerArgEntryFunction) {
      signerArguments.push({
        typeTagArray: [new TypeTagAddress()],
        classString: toClassString(TypeTagEnum.AccountAddress),
        annotation: "sender for the payload, not used in the entry function as an argument",
      });
      signerArgumentNames.push(PRIMARY_SENDER_FIELD_NAME);
    }
    const constructorSenders = new Array<string>();
    const constructorOtherArgs = new Array<string>();
    signerArguments.forEach((signerArgument, i) => {
      constructorSenders.push(
        `${signerArgumentNames[i]}: ${accountAddressInputString}, // ${signerArgument.annotation}`,
      );
    });
    functionArguments.forEach((functionArgument, i) => {
      const inputType = toInputTypeString(functionArgument.typeTagArray, isViewFunction);
      const argComment = ` // ${functionArgument.annotation}`;
      constructorOtherArgs.push(`${fieldNames[i]}: ${inputType}, ${argComment}`);
    });
    constructorOtherArgs.push(
      `feePayer?: ${accountAddressInputString}, // optional fee payer account to sponsor the transaction`,
    );

    const withSecondarySenders = signerArguments.length > 1;
    const singleSigner = signerArguments.length === 1;
    const transactionType = withFeePayer
      ? TransactionType.FeePayer
      : withSecondarySenders
        ? TransactionType.MultiAgent
        : TransactionType.SingleSigner;

    const conditionalCommaAndNewLine = constructorSenders.length > 0 ? ",\n" : "";
    const conditionalCommaAndNewLineOtherArgs = constructorOtherArgs.slice(0, -1).length > 0 ? ",\n" : "";
    const conditionalCommaAndNewLineFeePayer = constructorOtherArgs.length > 0 ? ",\n" : "";

    const withTypeTags = genericTypeTags.length > 0;
    const typeTagsInBuildFunctionSignatureString = withTypeTags ? "typeTags: Array<TypeTag>,\n" : "";
    const typeTagsInConstructorCallString = withTypeTags ? `typeTags,\n` : "";

    // TODO: Fix this later
    // const returnType = withFeePayer
    //   ? InputTransactionType.FeePayer
    //   : withSecondarySenders
    //     ? InputTransactionType.MultiAgent
    //     : InputTransactionType.SingleSigner;
    const returnType = EntryFunctionTransactionBuilder.name;
    const staticBuild =
      `` +
      `static async build${withFeePayer ? "WithFeePayer" : ""}(\n` +
      "aptosConfig: AptosConfig,\n" +
      (constructorSenders.join("\n") + "\n") +
      (constructorOtherArgs.slice(0, -1).join("\n") + "\n") +
      typeTagsInBuildFunctionSignatureString +
      (withFeePayer ? "feePayer:" + accountAddressInputString + ",\n" : "") +
      `options?: InputGenerateTransactionOptions,\n` +
      `): Promise<${returnType}> {
        const payloadBuilder = new this(` +
      constructorSenders.map((s) => s.split(":")[0]).join(",\n") +
      conditionalCommaAndNewLine +
      constructorOtherArgs
        .slice(0, -1)
        .map((s) => s.split(":")[0])
        .join(",\n") +
      conditionalCommaAndNewLineOtherArgs +
      typeTagsInConstructorCallString +
      (withFeePayer ? constructorOtherArgs.pop()?.split("?:")[0] + conditionalCommaAndNewLineFeePayer : "") +
      `);
        const rawTransactionInput = (await buildTransaction({
          aptosConfig,
          sender: payloadBuilder.${PRIMARY_SENDER_FIELD_NAME},\n` +
      (withFeePayer ? "feePayerAddress: feePayer ?? AccountAddress.ZERO,\n" : "") +
      (withSecondarySenders ? "secondarySignerAddresses: payloadBuilder.secondarySenders,\n" : "") +
      `payload: payloadBuilder.createPayload(),
          options,
        }));
        const aptos = new Aptos(aptosConfig);
        return new ${EntryFunctionTransactionBuilder.name}(
          payloadBuilder,
          aptos,
          rawTransactionInput,
        );
      }
    `;

    return staticBuild;
  }

  createTransactionBuilder(
    className: string,
    signerArguments: Array<AnnotatedBCSArgument>,
    signerArgumentNames: Array<string>,
    functionArguments: Array<AnnotatedBCSArgument>,
    fieldNames: Array<string>,
    withFeePayer: boolean,
    genericTypeTags: Array<string>, // these parsed generic names if they're available, we just use them for counting
    noSignerArgEntryFunction: boolean,
  ) {
    const isViewFunction = false;
    const signerInputString = toInputTypeString([new TypeTagSigner()], isViewFunction);

    // to avoid mutating the original array
    signerArguments = Array.from(signerArguments);

    // If there's no signer args in the entry function, we need to add the primary sender to the constructor
    // because a payload needs a sender, even if it's not used in the entry function
    if (noSignerArgEntryFunction) {
      signerArguments.push({
        typeTagArray: [new TypeTagAddress()],
        classString: toClassString(TypeTagEnum.Signer),
        annotation: "sender for the payload, not used in the entry function as an argument",
      });
      signerArgumentNames.push(PRIMARY_SENDER_FIELD_NAME);
    }
    const constructorSenders = new Array<string>();
    const constructorOtherArgs = new Array<string>();
    signerArguments.forEach((signerArgument, i) => {
      constructorSenders.push(`${signerArgumentNames[i]}: ${signerInputString}, // ${signerArgument.annotation}`);
    });
    functionArguments.forEach((functionArgument, i) => {
      const inputType = toInputTypeString(functionArgument.typeTagArray, isViewFunction);
      const argComment = ` // ${functionArgument.annotation}`;
      constructorOtherArgs.push(`${fieldNames[i]}: ${inputType}, ${argComment}`);
    });
    constructorOtherArgs.push(
      `feePayer?: ${signerInputString}, // optional fee payer account to sponsor the transaction`,
    );

    const withSecondarySenders = signerArguments.length > 1;
    const singleSigner = signerArguments.length === 1;
    const transactionType = withFeePayer
      ? TransactionType.FeePayer
      : withSecondarySenders
        ? TransactionType.MultiAgent
        : TransactionType.SingleSigner;

    const conditionalCommaAndNewLine = constructorSenders.length > 0 ? ",\n" : "";
    const conditionalCommaAndNewLineOtherArgs = constructorOtherArgs.slice(0, -1).length > 0 ? ",\n" : "";
    const conditionalCommaAndNewLineFeePayer = constructorOtherArgs.length > 0 ? ",\n" : "";

    const withTypeTags = genericTypeTags.length > 0;
    const typeTagsInBuildFunctionSignatureString = withTypeTags ? "typeTags: Array<TypeTag>,\n" : "";
    const typeTagsInConstructorCallString = withTypeTags ? `typeTags,\n` : "";

    const returnType = EntryFunctionTransactionBuilder.name;

    const transactionBuilderFunctionSignature =
      `` +
      `async submit${withFeePayer ? "WithFeePayer" : ""}(` +
      "\n" +
      `aptosConfig: AptosConfig,\n` +
      (constructorSenders.join("\n") + "\n") +
      (constructorOtherArgs.slice(0, -1).join("\n") + "\n") +
      typeTagsInBuildFunctionSignatureString +
      (withFeePayer ? "feePayer: Account,\n" : "") +
      `options?: InputGenerateTransactionOptions,\n` +
      `waitForTransactionOptions?: WaitForTransactionOptions,\n` +
      `): Promise<UserTransactionResponse> {` +
      "\n";

    const transactionBuilderInstantiationString =
      `` +
      `const transactionBuilder = await ${className}.build${withFeePayer ? "WithFeePayer" : ""}(` +
      "\n" +
      `aptosConfig,\n` +
      constructorSenders.map((s) => `${s.split(":")[0]}.accountAddress`).join(",\n") +
      conditionalCommaAndNewLine +
      constructorOtherArgs
        .map((s) => s.split(":")[0])
        .slice(0, -1)
        .join(",\n") +
      conditionalCommaAndNewLineOtherArgs +
      (withTypeTags ? `typeTags,\n` : "") +
      (withFeePayer ? "feePayer.accountAddress" + conditionalCommaAndNewLineFeePayer : "") +
      `options,\n` +
      `);`;
    const transactionBuilderHelperString =
      `` +
      `${transactionBuilderFunctionSignature}` +
      "\n" +
      `${transactionBuilderInstantiationString}` +
      "\n" +
      `const response = await transactionBuilder.submit({` +
      "\n" +
      `primarySigner: ${constructorSenders[0].split(":")[0]}` +
      ",\n" +
      (withSecondarySenders
        ? `secondarySigners: [${constructorSenders
            .slice(1)
            .map((s) => s.split(":")[0])
            .join(", ")}]` + ",\n"
        : "") +
      (withFeePayer ? `feePayer,` + "\n" : "") +
      `options: waitForTransactionOptions,` +
      "\n" +
      `});` +
      "\n" +
      `return response;` +
      "\n" +
      `}` +
      "\n";

    return transactionBuilderHelperString;
  }

  getClassArgTypes(
    typeTags: Array<TypeTag>,
    genericTypeParams: Array<MoveFunctionGenericTypeParam>,
    replaceOptionWithVector = true,
  ): EntryFunctionArgumentSignature {
    const signerArguments = new Array<AnnotatedBCSArgument>();
    const functionArguments = new Array<AnnotatedBCSArgument>();
    const genericsWithAbilities = new Array<string>();
    typeTags.forEach((typeTag, i) => {
      const flattenedTypeTag = toFlattenedTypeTag(typeTag);
      let annotation = this.config.expandedStructs
        ? typeTag.toString()
        : truncatedTypeTagString({
            typeTag,
            namedAddresses: this.config.namedAddresses,
            namedTypeTags: this.config.namedTypeTags,
          });

      const firstTypeTag = flattenedTypeTag[0];
      if (firstTypeTag.isSigner() || isSignerReference(firstTypeTag)) {
        signerArguments.push({
          typeTagArray: [firstTypeTag],
          classString: toClassString(TypeTagEnum.Signer),
          annotation,
        });
        // It's a non-signer entry function argument, so we'll add it to the functionArguments array
      } else {
        // Check if the TypeTag is actually an Object type
        // Object<T> must have at least 2 types, so if the length is 1, it's not an Object
        if (flattenedTypeTag.length > 1) {
          const secondToLast = flattenedTypeTag[flattenedTypeTag.length - 2];
          if (flattenedTypeTag[flattenedTypeTag.length - 1].isGeneric()) {
            const genericType = `T${genericsWithAbilities.length}`;
            const constraints = `: ${genericTypeParams[genericsWithAbilities.length]?.constraints.join(" + ")}`;
            // 2, because that's the length of ": ". We don't add it if there are no constraints
            const genericTypeWithConstraints = constraints.length > 2 ? `${genericType}${constraints}` : genericType;
            // Check if the second to last kind is an AccountAddress, because that's *always* an Object
            // if (kindArray[kindArray.length - 2] === AccountAddress.kind) {
            if (secondToLast.isStruct() && secondToLast.isObject()) {
              genericsWithAbilities.push(genericTypeWithConstraints);
              // annotation += `<${genericType}>`;
              flattenedTypeTag.pop();
            } else {
              genericsWithAbilities.push(genericTypeWithConstraints);
              // The second to last kind is not an Object, so we'll add it to the functionArguments array
              // this is a generically typed argument, meaning (as of right now, 11-2023), it's a normal
              // BCS argument            // functionArguments.push({
              //   kindArray,
              //   kindString: toClassesString(kindArray),
              //   annotation,
              // });
            }
          } else if (secondToLast.isStruct() && secondToLast.isObject()) {
            // it's an Object<T> where T is not generic: aka Object<Token> or something
            // so we'll remove the second to last kind, since it's an Object
            flattenedTypeTag.pop();
          }
        }

        let endFlattenedTypeTag: Array<TypeTag> = flattenedTypeTag;

        // Replacing the Option with a Vector is useful for the constructor input types since
        // ultimately it's the same serialization, and we can restrict the number of elements
        // with the input type at compile time.
        if (replaceOptionWithVector) {
          endFlattenedTypeTag = flattenedTypeTag.map((tag) => {
            if (tag.isStruct() && tag.isOption()) {
              // Options must always have only 1 type, so we can just pop the first generic typeArg off
              // and reconstructor a TypeTagVector with it
              return new TypeTagVector(tag.value.typeArgs[0]);
            }
            return tag;
          });
        } else {
          // the only time we have a GenericType at the end is when it's for the actual argument.
          // since we pop the argument off if it's an Object<T>, we can assume that it's an actual
          // generic argument that the developer will have to serialize themselves.

          console.log("is a generic type tag ?" + endFlattenedTypeTag[flattenedTypeTag.length - 1].isGeneric());
        }
        functionArguments.push({
          typeTagArray: endFlattenedTypeTag,
          classString: toClassesString(endFlattenedTypeTag),
          annotation,
        });
      }
    });

    return {
      signerArguments,
      functionArguments,
      genericsWithAbilities,
    };
  }

  async fetchABIs(aptos: Aptos, accountAddress: AccountAddress): Promise<ABIGeneratedCodeMap> {
    const moduleABIs = await fetchModuleABIs(aptos, accountAddress);
    const sourceCodeMap = await getSourceCodeMap(accountAddress, aptos.config.network);

    let abiFunctions: AbiFunctions[] = [];
    let generatedCode: ABIGeneratedCodeMap = {};

    await Promise.all(
      moduleABIs.filter(isAbiDefined).map(async (module) => {
        const { abi } = module;
        const exposedFunctions = abi.exposed_functions;
        const sourceCode = sourceCodeMap[abi.name];

        const publicEntryFunctions = exposedFunctions.filter((func) => func.is_entry && func.visibility !== "private");
        const privateEntryFunctions = exposedFunctions.filter((func) => func.is_entry && func.visibility === "private");
        const viewFunctions = exposedFunctions.filter((func) => func.is_view);

        const publicMapping = getArgNameMapping(abi, publicEntryFunctions, sourceCode);
        const privateMapping = getArgNameMapping(abi, privateEntryFunctions, sourceCode);
        const viewMapping = getArgNameMapping(abi, viewFunctions, sourceCode);

        const abiFunction = {
          moduleAddress: AccountAddress.fromRelaxed(abi.address),
          moduleName: abi.name,
          publicEntryFunctions: getMoveFunctionsWithArgumentNames(abi, publicEntryFunctions, publicMapping),
          privateEntryFunctions: getMoveFunctionsWithArgumentNames(abi, privateEntryFunctions, privateMapping),
          viewFunctions: getMoveFunctionsWithArgumentNames(abi, viewFunctions, viewMapping),
        };

        abiFunctions.push(abiFunction);
        const moduleName = toPascalCase(abiFunction.moduleName);

        // TODO: count the number of typeTags in the ABI
        // then populate the typeTags array with the correct number of generic type tags
        // and hard code them 1 by 1 into the generated code
        // you can also use this to count/match generics to a type `T` in Object<T>

        const functionsWithAnyVisibility = [
          abiFunction.publicEntryFunctions,
          abiFunction.privateEntryFunctions,
          abiFunction.viewFunctions,
        ];

        const codeForFunctionsWithAnyVisibility: Array<Array<string | undefined>> = [[], [], []];
        functionsWithAnyVisibility.forEach((functions, i) => {
          if (functions.length > 0) {
            codeForFunctionsWithAnyVisibility[i].push(
              ...functions.map((func) => {
                try {
                  const typeTags = func.params.map((param) => parseTypeTag(param, { allowGenerics: true }));
                  const generatedClassesCode = this.metaclassBuilder({
                    moduleAddress: abiFunction.moduleAddress,
                    moduleName: abiFunction.moduleName,
                    functionName: func.name,
                    className: `${toPascalCase(func.name)}`,
                    functionArgumentTypeTags: typeTags,
                    genericTypeTags: func.genericTypes,
                    viewFunction: func.is_view,
                    displaySignerArgsAsComments: true,
                    suppliedFieldNames: func.argNames,
                    visibility: func.visibility as "public" | "private",
                    genericTypeParams: func.generic_type_params,
                    documentation: {
                      fullStructNames: false,
                      displayFunctionSignature: true,
                    },
                  });
                  return generatedClassesCode;
                } catch (e) {
                  if (func.params.find((param) => param.startsWith("&0x"))) {
                    console.warn(
                      `Ignoring deprecated parameter ${func.params.find((param) =>
                        param.startsWith("&0x"),
                      )} in function ${func.name}`,
                    );
                  } else {
                    const typeTags = func.params.map((param) => parseTypeTag(param, { allowGenerics: true }));
                    // console.log(func.genericTypes);
                    // console.log(typeTags.map((typeTag) => typeTag.toString()));
                    // console.log(abiFunction.moduleAddress.toString());
                    // console.log(abiFunction.moduleName);
                    // console.log(func.name);
                    console.error(e);
                  }
                }
              }),
            );
          }
        });

        const numPublicFunctions = abiFunction.publicEntryFunctions.length;
        const numPrivateFunctions = abiFunction.privateEntryFunctions.length;
        const numViewFunctions = abiFunction.viewFunctions.length;

        const publicFunctionsCodeString = `\n${codeForFunctionsWithAnyVisibility[0].join("\n")}`;
        const privateFunctionsCodeString = `\n${codeForFunctionsWithAnyVisibility[1].join("\n")}\n`;
        const viewFunctionsCodeString = `\n${codeForFunctionsWithAnyVisibility[2].join("\n")}\n`;

        let entryFunctionsCode = `\n${publicFunctionsCodeString}${privateFunctionsCodeString}`;
        let viewFunctionsCode = `\n${viewFunctionsCodeString}`;
        if (this.config.separateViewAndEntryFunctionsByNamespace) {
          entryFunctionsCode = `export namespace ${this.config.entryFunctionsNamespace} { ${entryFunctionsCode} }`;
          viewFunctionsCode = `export namespace ${this.config.viewFunctionsNamespace} { ${viewFunctionsCode} }`;
        }

        if (numPublicFunctions + numPrivateFunctions + numViewFunctions > 0) {
          let code = "";
          code += numPublicFunctions + numPrivateFunctions > 0 ? entryFunctionsCode : "";
          code += numViewFunctions > 0 ? viewFunctionsCode : "";
          generatedCode[abi.name] = {
            address: abi.address,
            name: abi.name,
            code: code,
          };
        }
      }),
    );

    return generatedCode;
  }

  async generateCodeForModules(aptos: Aptos, moduleAddresses: Array<AccountAddress>): Promise<void> {
    const baseDirectory = this.config.outputPath ?? ".";
    if (!fs.existsSync(baseDirectory)) {
      fs.mkdirSync(baseDirectory);
    }
    const generatedIndexFile: Array<string> = [BOILERPLATE_COPYRIGHT];
    await Promise.all(
      moduleAddresses.map(async (address) => {
        const generatedCode = await this.fetchABIs(aptos, address);
        const namedAddresses = this.config.namedAddresses ?? {};
        const addressString = address.toString();
        const namedAddress = addressString in namedAddresses ? namedAddresses[addressString] : addressString;
        this.writeGeneratedCodeToFiles(namedAddress, baseDirectory, generatedCode);
        const fileNamedAddress = namedAddress.startsWith("0x")
          ? truncateAddressForFileName(address)
          : toPascalCase(namedAddress);
        const filePath = `${baseDirectory}/index.ts`;
        // Read from `index.ts` and check if the namedAddress is already in the file
        // If it is, don't add it again
        const newExport = `export * as ${fileNamedAddress} from "./${namedAddress}/index.js";\n`;
        generatedIndexFile.push(newExport);
        if (fs.existsSync(filePath)) {
          const fileContents = fs.readFileSync(filePath, "utf8");
          if (fileContents.includes(newExport)) {
            // pass
          } else {
            const newFileContents = fileContents + newExport;
            fs.writeFileSync(filePath, newFileContents);
          }
        } else {
          fs.writeFileSync(filePath, generatedIndexFile.join("\n"));
        }
      }),
    );
    copyCode(
      `./src/${FOR_GENERATION_DIRECTORY}/${PAYLOAD_BUILDERS_FILE_NAME}.ts`,
      baseDirectory + `${PAYLOAD_BUILDERS_FILE_NAME}.ts`,
      this.config.sdkPath,
    );
    copyCode(
      `./src/${FOR_GENERATION_DIRECTORY}/${ABI_TYPES_FILE_NAME}.ts`,
      baseDirectory + `${ABI_TYPES_FILE_NAME}.ts`,
      this.config.sdkPath,
    );
  }

  writeGeneratedCodeToFiles(
    namedAddress: string,
    baseDirectory: string,
    codeMap: ABIGeneratedCodeMap,
    skipEmptyModules = true,
  ) {
    const perAddressIndexFile: Array<string> = [BOILERPLATE_COPYRIGHT, IMPORT_ACCOUNT_ADDRESS];

    Object.keys(codeMap).forEach(async (moduleName, i) => {
      if (skipEmptyModules && (!codeMap[moduleName] || codeMap[moduleName].code.length === 0)) {
        console.debug(`Skipping empty module ${module}`);
        return;
      }

      const { address, name, code } = codeMap[moduleName];
      const directory = baseDirectory + "/" + namedAddress;
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory);
      }
      const fileName = `${name}.ts`;
      const filePath = `${directory}/${fileName}`;
      const contents = getBoilerplateImports(this.config.sdkPath) + "\n\n" + code;
      const prettifiedCode = await format(contents, { parser: "typescript" });

      perAddressIndexFile.push(`export * as ${toPascalCase(name)} from "./${name}.js";`);
      if (i === Object.keys(codeMap).length - 1) {
        perAddressIndexFile.push(
          `\nexport const ${MODULE_ADDRESS_FIELD_NAME} = AccountAddress.fromRelaxed("${address}");\n`,
        );
        // create the index.ts file
        const indexFilePath = `${directory}/index.ts`;
        if (fs.existsSync(indexFilePath)) {
          fs.rmSync(indexFilePath);
        }
        fs.writeFileSync(indexFilePath, perAddressIndexFile.join("\n"));
      }

      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath);
      }
      fs.writeFileSync(filePath, prettifiedCode);
    });
  }

  // TODO: Add `deserializeAsTypeTag(typeTag: TypeTag)` where it deserializes something based solely on
  // a string type tag
  //
  // This would mean we have to include a `kind` in each BCS class instance that we can use as a string
  // type tag.
}
