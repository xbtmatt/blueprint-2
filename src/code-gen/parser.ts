// Copyright © Aptos Foundation
// SPDX-License-Identifier: Apache-2.0

import {
  AccountAddress,
  Aptos,
  MoveFunctionGenericTypeParam,
  TypeTag,
  parseTypeTag,
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
  TransactionType,
  EntryFunctionTransactionBuilder,
  toViewFunctionReturnTypeString,
  createExplicitArraySizeString,
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
import { lightBlue, lightCyan, lightGreen, lightMagenta, lightRed, red } from "kolorist";

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
      returnValue,
      suppliedFieldNames,
      visibility,
      genericTypeParams,
      documentation,
      viewFunction,
    } = args;
    // These are the parsed type tags from the source code
    const genericTypeTagsString = args.genericTypeTags ?? "";
    const genericTypeTags = genericTypeTagsString
      .split(",")
      .filter((t) => t !== "")
      .map((t) => {
        return t.split(":")[0].trim();
      });
    const returnValueAsString =
      (returnValue.length > 0 ? ": " : "") +
      returnValue
        .map((v) => {
          const typeTag = parseTypeTag(v, { allowGenerics: true });
          const replacedTypeTag = this.config.expandedStructs
            ? typeTag.toString()
            : truncatedTypeTagString({
                typeTag,
                namedAddresses: this.config.namedAddresses,
                namedTypeTags: this.config.namedTypeTags,
                genericTypeTags: genericTypeTags,
              });
          return replacedTypeTag.toString();
        })
        .join(", ");
    const atleastOneGeneric = (genericTypeTagsString ?? "").length > 0;
    const genericTypeTagsStringAnnotation = atleastOneGeneric ? `// [${genericTypeTagsString}]` : "";
    // denote the explicit number of generic TypeTags necessary to call the function
    const explicitTypeTagInputs = createExplicitArraySizeString(genericTypeTags.length, "TypeTagInput");
    const explicitTypeTags = createExplicitArraySizeString(genericTypeTags.length, "TypeTag");
    const explicitTypeTagsWithDefault = !atleastOneGeneric ? "[] = []" : explicitTypeTags;

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

    // ------------------------------ Handle signers ------------------------------ //
    // Get the array of annotated BCS class names, their string representation, and original TypeTag string
    const { signerArguments, functionArguments, genericsWithAbilities } = this.getClassArgTypes(
      functionArgumentTypeTags,
      genericTypeParams,
    );

    // ------------------------------ Match generic type tags ------------------------------ //
    // convert T0, T1, etc to named generic type tags if they exist
    // Example:
    //  with [V, T] we pop `T` off and replace `T0` with it
    //  then we pop `V` off and replace `T1` with it
    functionArguments.forEach((_, i) => {
      functionArguments[i].annotation = truncatedTypeTagString({
        typeTag: functionArguments[i].typeTagArray[0],
        namedAddresses: this.config.namedAddresses,
        namedTypeTags: this.config.namedTypeTags,
        genericTypeTags: genericTypeTags,
      });
    });

    const lines: Array<string> = [];

    const argsType = `${className}PayloadMoveArguments`;
    const signerArgumentNames = suppliedFieldNames ? suppliedFieldNames.splice(0, signerArguments.length) : [];

    // ------------------------------ Declare class field types separately ------------------------------ //
    if (functionArguments.length > 0) {
      lines.push(`export type ${argsType} = {`);
      functionArguments.forEach((functionArgument, i) => {
        if (viewFunction) {
          const asClassField = true;
          const viewFunctionInputTypeConverter = toInputTypeString(
            functionArgument.typeTagArray,
            viewFunction,
            asClassField,
          );
          lines.push(`${fieldNames[i]}: ${viewFunctionInputTypeConverter};`);
        } else {
          lines.push(`${fieldNames[i]}: ${functionArgument.classString};`);
        }
      });
      lines.push("}");
    }
    lines.push("");

    // ------------------------------ Documentation ------------------------------ //
    const leftCaret = atleastOneGeneric ? "<" : "";
    const rightCaret = atleastOneGeneric ? ">" : "";
    const extraDocLine = "*```";

    const funcSignatureLines = new Array<string>();
    if (documentation?.displayFunctionSignature) {
      const viewFunctionAnnotation = viewFunction ? "\n*  #[view]" : "";
      funcSignatureLines.push("/**" + "\n" + extraDocLine + viewFunctionAnnotation);
      funcSignatureLines.push(
        `*  ${visibility == "public" ? visibility : ""}${viewFunction ? "" : " entry"}` +
          ` fun ${functionName}${leftCaret}${genericTypeTagsString}${rightCaret}(` +
          (functionArguments.length > 0 ? "" : `)${returnValueAsString}`),
      );
      signerArguments.forEach((signerArgument, i) => {
        funcSignatureLines.push(`*     ${signerArgumentNames[i]}: ${signerArgument.annotation},`);
      });
      functionArguments.forEach((functionArgument, i) => {
        funcSignatureLines.push(`*     ${fieldNames[i]}: ${functionArgument.annotation},`);
      });
      const endParenthesis = functionArguments.length > 0 ? `*  )${returnValueAsString}\n` : "";
      funcSignatureLines.push(endParenthesis + `${extraDocLine}\n**/`);
    }
    const functionSignature = funcSignatureLines.join("\n");
    lines.push(functionSignature);

    const accountAddressInputString = toInputTypeString([new TypeTagAddress()], viewFunction);
    const accountAddressClassString = toClassString(TypeTagEnum.AccountAddress);

    const returnTypes = returnValue.map((v) => {
      const typeTag = parseTypeTag(v, { allowGenerics: true });
      const flattenedTypeTag = toFlattenedTypeTag(typeTag);
      const inputType = toViewFunctionReturnTypeString(flattenedTypeTag);
      return inputType;
    });
    const viewFunctionReturnTypes = viewFunction ? `<[${returnTypes.map((v) => v).join(", ")}]>` : "";

    // ---------- Class fields ---------- //
    const entryOrView = viewFunction ? "View" : "Entry";
    const secondarySenders = signerArguments.slice(1).map((s) => accountAddressClassString);
    const classFields =
      `
    export class ${className} extends ${entryOrView}FunctionPayloadBuilder${viewFunctionReturnTypes} {
      public readonly moduleAddress = ${MODULE_ADDRESS_FIELD_NAME};
      public readonly moduleName = "${moduleName}";
      public readonly functionName = "${functionName}";
      public readonly args: ${functionArguments.length > 0 ? argsType : "{ }"};
      public readonly typeTags: ${explicitTypeTagsWithDefault}; ${genericTypeTagsStringAnnotation}\n` +
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

    // ------------------------------ Constructor input types ------------------------------ //
    // constructor fields
    const constructorSenders = new Array<string>();
    const constructorOtherArgs = new Array<string>();
    const noSignerArgEntryFunction = !viewFunction && signerArguments.length === 0;

    lines.push(`${viewFunction ? "" : "private"} constructor(`);
    signerArguments.forEach((signerArgument, i) => {
      // signers are `AccountAddress` in the constructor signature because we're just generating the raw transaction here.
      constructorSenders.push(
        `${signerArgumentNames[i]}: ${accountAddressInputString}, // ${signerArgument.annotation}`,
      );
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
      // TODO: Fix option input types. It's just converting them to vectors right now, it should be Option<T>, but the input type
      // is skipping the Option part too early. This is probably a result of refactoring to typetags a week ago.
      // console.log(functionArgument.typeTagArray.map((s) => s.toString()).join(", "));
      const argComment = ` // ${functionArgument.annotation}`;
      constructorOtherArgs.push(`${fieldNames[i]}: ${inputType}, ${argComment}`);
    });
    if (genericTypeTagsString) {
      constructorOtherArgs.push(`typeTags: ${explicitTypeTagInputs}, ${genericTypeTagsStringAnnotation}`);
    }
    if (!viewFunction) {
      constructorOtherArgs.push(
        `feePayer?: ${accountAddressInputString}, // optional fee payer account to sponsor the transaction`,
      );
    }
    lines.push(constructorSenders.join("\n"));
    lines.push(constructorOtherArgs.join("\n"));
    lines.push(") {");

    // ------------------------------ Assign constructor fields to class fields ------------------------------ //
    lines.push("super();");
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

    lines.push("this.args = {");
    functionArguments.forEach((_, i) => {
      // Don't use BCS classes for view functions, since they don't need to be serialized
      // Although we can use them eventually when view functions accepts BCS inputs
      if (viewFunction) {
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
    lines.push("}");
    if (genericTypeTagsString) {
      lines.push(
        `this.typeTags = typeTags.map(typeTag => typeof typeTag === 'string' ? parseTypeTag(typeTag) : typeTag) as ${explicitTypeTagsWithDefault};`,
      );
    }
    if (!viewFunction) {
      lines.push(
        `this.${FEE_PAYER_FIELD_NAME} = (${FEE_PAYER_FIELD_NAME} !== undefined) ? AccountAddress.fromRelaxed(${FEE_PAYER_FIELD_NAME}) : undefined;`,
      );
    }
    lines.push("}");

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
            explicitTypeTagInputs,
            genericTypeTagsStringAnnotation,
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
            explicitTypeTagInputs,
            genericTypeTagsStringAnnotation,
          ),
        );
      });
    }
    lines.push("\n } \n");
    return lines.join("\n");
  }

  // TODO: Fix
  // right now this is non-maintainable and very messy ( this may be the ugliest thing I've ever created )
  // What you should do is create an abstract implementation of build and builderWithFeePayer
  // with the base functionality and then find a way to make `build` and `builderWithFeePayer`
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
    explicitTypeTagInputs: string,
    genericTypeTagAnnotation: string,
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
    const conditionalCommaAndNewLine = constructorSenders.length > 0 ? ",\n" : "";
    const conditionalCommaAndNewLineOtherArgs = constructorOtherArgs.slice(0, -1).length > 0 ? ",\n" : "";
    const conditionalCommaAndNewLineFeePayer = constructorOtherArgs.length > 0 ? ",\n" : "";

    const withTypeTags = genericTypeTags.length > 0;

    const returnType = EntryFunctionTransactionBuilder.name;
    const staticBuild =
      `static async builder${withFeePayer ? "WithFeePayer" : ""}(\n` +
      "aptosConfig: AptosConfig,\n" +
      (constructorSenders.join("\n") + "\n") +
      (constructorOtherArgs.slice(0, -1).join("\n") + "\n") +
      (withTypeTags ? `typeTags: ${explicitTypeTagInputs}, ${genericTypeTagAnnotation},\n` : "") +
      (withFeePayer ? "feePayer:" + accountAddressInputString + ",\n" : "") +
      `options?: InputGenerateTransactionOptions,\n` +
      `): Promise<${returnType}> {` +
      `const payloadBuilder = new this(` +
      constructorSenders.map((s) => s.split(":")[0]).join(",\n") +
      conditionalCommaAndNewLine +
      constructorOtherArgs
        .slice(0, -1)
        .map((s) => s.split(":")[0])
        .join(",\n") +
      conditionalCommaAndNewLineOtherArgs +
      (withTypeTags ? `typeTags,\n` : "") +
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
    explicitTypeTagInputs: string,
    genericTypeTagAnnotation: string,
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
    const withTypeTags = genericTypeTags.length > 0;

    const conditionalCommaAndNewLine = constructorSenders.length > 0 ? ",\n" : "";
    const conditionalCommaAndNewLineOtherArgs = constructorOtherArgs.slice(0, -1).length > 0 ? ",\n" : "";
    const conditionalCommaAndNewLineFeePayer = constructorOtherArgs.length > 0 ? ",\n" : "";

    const transactionBuilderFunctionSignature =
      `static async submit${withFeePayer ? "WithFeePayer" : ""}(` +
      "\n" +
      "aptosConfig: AptosConfig,\n" +
      (constructorSenders.join("\n") + "\n") +
      (constructorOtherArgs.slice(0, -1).join("\n") + "\n") +
      (withTypeTags ? `typeTags: ${explicitTypeTagInputs}, ${genericTypeTagAnnotation}\n` : "") +
      (withFeePayer ? "feePayer: Account,\n" : "") +
      "options?: InputGenerateTransactionOptions,\n" +
      "waitForTransactionOptions?: WaitForTransactionOptions,\n" +
      "): Promise<UserTransactionResponse> {\n";

    const transactionBuilderInstantiationString =
      `const transactionBuilder = await ${className}.builder${withFeePayer ? "WithFeePayer" : ""}(\n` +
      "aptosConfig,\n" +
      constructorSenders.map((s) => `${s.split(":")[0]}.accountAddress`).join(",\n") +
      conditionalCommaAndNewLine +
      constructorOtherArgs
        .map((s) => s.split(":")[0])
        .slice(0, -1)
        .join(",\n") +
      conditionalCommaAndNewLineOtherArgs +
      (withTypeTags ? "typeTags,\n" : "") +
      (withFeePayer ? "feePayer.accountAddress" + conditionalCommaAndNewLineFeePayer : "") +
      "options,\n" +
      ");";
    const transactionBuilderHelperString =
      `` +
      `${transactionBuilderFunctionSignature}\n` +
      `${transactionBuilderInstantiationString}\n` +
      "const response = await transactionBuilder.submit({\n" +
      `primarySigner: ${constructorSenders[0].split(":")[0]},\n` +
      (withSecondarySenders
        ? `secondarySigners: [${constructorSenders
            .slice(1)
            .map((s) => s.split(":")[0])
            .join(", ")}]` + ",\n"
        : "") +
      (withFeePayer ? "feePayer,\n" : "") +
      "options: waitForTransactionOptions,\n" +
      "});\n" +
      "return response;\n" +
      "}\n";

    return transactionBuilderHelperString;
  }

  getClassArgTypes(
    typeTags: Array<TypeTag>,
    genericTypeParams: Array<MoveFunctionGenericTypeParam>,
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
        // Object<T> must have at least 2 typetags, so if the length is 1, it's not an Object
        if (flattenedTypeTag.length > 1) {
          const secondToLast = flattenedTypeTag[flattenedTypeTag.length - 2];
          if (flattenedTypeTag[flattenedTypeTag.length - 1].isGeneric()) {
            const genericType = `T${genericsWithAbilities.length}`;
            const constraints = `: ${genericTypeParams[genericsWithAbilities.length]?.constraints.join(" + ")}`;
            // 2, because that's the length of ": ". We don't add it if there are no constraints
            const genericTypeWithConstraints = constraints.length > 2 ? `${genericType}${constraints}` : genericType;
            // Check if the second to last kind is an AccountAddress, because that's *always* an Object
            if (secondToLast.isStruct() && secondToLast.isObject()) {
              genericsWithAbilities.push(genericTypeWithConstraints);
              flattenedTypeTag.pop();
            } else {
              genericsWithAbilities.push(genericTypeWithConstraints);
            }
          } else if (secondToLast.isStruct() && secondToLast.isObject()) {
            // it's an Object<T> where T is not generic: aka Object<Token> or something
            // so we'll remove the second to last kind, since it's an Object
            flattenedTypeTag.pop();
          }
        }

        let asdf;
        try {
          asdf = toClassesString(flattenedTypeTag);
        } catch (e) {
          flattenedTypeTag.forEach((t) => console.log(t.toString()));
          console.log(asdf);
          console.warn(e);
        }

        functionArguments.push({
          typeTagArray: flattenedTypeTag,
          classString: toClassesString(flattenedTypeTag),
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
                  func.params = func.params.map((param) => {
                    if (param.startsWith("&mut ")) {
                      console.warn(
                        `${lightRed("Removing")} deprecated &mut in typetag ${lightMagenta(
                          param,
                        )} in function ${lightMagenta(func.name)}`,
                      );
                      return param.replace("&mut ", "");
                    }
                    return param;
                  });
                  const typeTags = func.params.map((param) => parseTypeTag(param, { allowGenerics: true }));
                  if (
                    typeTags.find((typeTag) => {
                      return typeTag.isStruct() && !typeTag.isObject() && !typeTag.isString() && !typeTag.isOption();
                    })
                  ) {
                    console.warn(
                      `${lightRed("Ignoring")} function ${lightMagenta(
                        func.name,
                      )} because it has a deprecated struct type tag`,
                    );
                    return;
                  }
                  const generatedClassesCode = this.metaclassBuilder({
                    moduleAddress: abiFunction.moduleAddress,
                    moduleName: abiFunction.moduleName,
                    functionName: func.name,
                    className: `${toPascalCase(func.name)}`,
                    functionArgumentTypeTags: typeTags,
                    genericTypeTags: func.genericTypes,
                    viewFunction: func.is_view,
                    returnValue: func.return,
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
                      `${lightRed("Ignoring")} deprecated parameter ${lightMagenta(
                        func.params.find((param) => param.startsWith("&0x"))!,
                      )} in function ${func.name}`,
                    );
                  } else {
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
