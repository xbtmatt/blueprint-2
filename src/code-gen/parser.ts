/* eslint-disable no-console */
import {
  AccountAddress,
  type Aptos,
  type MoveFunctionGenericTypeParam,
  type TypeTag,
  parseTypeTag,
  TypeTagAddress,
  TypeTagSigner,
} from "@aptos-labs/ts-sdk";
import fs from "fs";
import { lightBlue, lightGray, lightGreen, lightMagenta, lightRed } from "kolorist";
import path from "path";
import {
  getArgNameMapping,
  getMoveFunctionsWithArgumentNames,
  getSourceCodeMap,
} from "./packageMetadata";
import { type ConfigDictionary } from "./config";
import {
  DEFAULT_ARGUMENT_BASE,
  CONSTRUCTOR_ARGS_VARIABLE_NAME,
  FEE_PAYER_VAR_NAME,
  MODULE_ADDRESS_VAR_NAME,
  PRIMARY_SENDER_VAR_NAME,
  SECONDARY_SENDERS_VAR_NAME,
} from "./tokens";
import {
  FOR_GENERATION_DIRECTORY,
  PAYLOAD_BUILDERS_FILE_NAME,
  ABI_TYPES_FILE_NAME,
  getBoilerplateImports,
} from "../boilerplate/header";
import {
  type ABIGeneratedCodeMap,
  type AbiFunctions,
  type AnnotatedBCSArgument,
  type CodeGeneratorOptions,
  type EntryFunctionArgumentSignature,
  TypeTagEnum,
} from "../types";
import {
  truncatedTypeTagString,
  isSignerReference,
  toClassString,
  toFlattenedTypeTag,
} from "./typeTags";
import {
  EntryFunctionPayloadBuilder,
  EntryFunctionTransactionBuilder,
} from "../boilerplate/payload-builders";
import {
  copyCode,
  createExplicitArraySizeString,
  fetchModuleABIs,
  isAbiDefined,
  toCased,
  toClassesString,
  toPascalCase,
  truncateAddressForFileName,
} from "../utils";
import {
  toInputTypeString,
  toViewFunctionReturnTypeString,
  transformEntryFunctionInputTypes,
} from "./conversions";
import { lintAndFormat } from "./linters";
import { ViewFunctionPayloadBuilder } from "../boilerplate";

export class CodeGenerator {
  public readonly config: ConfigDictionary;

  constructor(config: ConfigDictionary) {
    this.config = config;
  }

  // Note that the suppliedFieldNames includes the `&signer` and `signer` fields.
  metaclassBuilder(args: CodeGeneratorOptions): string {
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
      structArgs,
      passInModuleAddress,
    } = args;
    // These are the parsed type tags from the source code
    const genericTypeTagsString = args.genericTypeTags ?? "";
    const genericTypeTags = genericTypeTagsString
      .split(",")
      .filter((t) => t !== "")
      .map((t) => t.split(":")[0].trim());
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
                genericTypeTags,
              });
          return replacedTypeTag.toString();
        })
        .join(", ");
    const oneOrMoreGenerics = (genericTypeTagsString ?? "").length > 0;
    const genericTypeTagsStringAnnotation = oneOrMoreGenerics
      ? `// [${genericTypeTagsString}]`
      : "";
    // denote the explicit number of generic TypeTags necessary to call the function
    const explicitTypeTagInputs = createExplicitArraySizeString(
      genericTypeTags.length,
      "TypeTagInput",
    );
    const explicitTypeTags = !oneOrMoreGenerics
      ? "[] = []"
      : createExplicitArraySizeString(genericTypeTags.length, "TypeTag");

    const fieldNames = suppliedFieldNames ?? [];

    // Check if the user supplied field names.
    // If they're undefined or length 0, generate them.
    if (fieldNames === undefined || fieldNames.length === 0) {
      for (let i = 0; i < functionArgumentTypeTags.length; i += 1) {
        fieldNames.push(`${DEFAULT_ARGUMENT_BASE}${i}`);
      }
      // Otherwise, ensure that the array lengths match.
    } else if (fieldNames.length !== functionArgumentTypeTags.length) {
      console.error(
        moduleAddress.toString(),
        moduleName,
        functionName,
        fieldNames,
        functionArgumentTypeTags.map((t) => t.toString()),
      );
      throw new Error(
        `fieldNames.length (${fieldNames.length}) ` +
          `!== functionArgumentsTypeTags.length (${functionArgumentTypeTags.length})`,
      );
    }

    // Set with `config.yaml`, either camelCase, snake_case or UPPER_CASE.
    const casedFieldNames = fieldNames.map((s) => toCased(s, this.config.variableCaseStyle));

    // ----------------------- Handle signers ----------------------- //
    const { signerArguments, functionArguments } = this.getClassArgTypes(
      functionArgumentTypeTags,
      genericTypeParams,
    );

    // ----------------------- Match generic type tags ----------------------- //
    // convert T0, T1, etc to named generic type tags if they exist.
    // Example:
    //  with [V, T] we pop `T` off and replace `T0` with it.
    //  then we pop `V` off and replace `T1` with it.
    functionArguments.forEach((_, i) => {
      functionArguments[i].annotation = truncatedTypeTagString({
        typeTag: functionArguments[i].typeTagArray[0],
        namedAddresses: this.config.namedAddresses,
        namedTypeTags: this.config.namedTypeTags,
        genericTypeTags,
      });
    });

    const lines: Array<string> = [];

    const argsType = `${className}PayloadMoveArguments`;
    const signerArgumentNamesSnakeCase = fieldNames
      ? fieldNames.splice(0, signerArguments.length)
      : [];
    const signerArgumentNames = casedFieldNames
      ? casedFieldNames.splice(0, signerArguments.length)
      : [];

    // ----------------------- Declare class field types separately ----------------------- //
    if (functionArguments.length > 0) {
      lines.push(`export type ${argsType} = {`);
      functionArguments.forEach((functionArgument, i) => {
        lines.push(`${casedFieldNames[i]}: ${functionArgument.classString};`);
      });
      lines.push("}");
    }
    lines.push("");

    // ----------------------- Documentation ----------------------- //
    const leftCaret = oneOrMoreGenerics ? "<" : "";
    const rightCaret = oneOrMoreGenerics ? ">" : "";
    const extraDocLine = "*```";

    const funcSignatureLines = new Array<string>();
    if (documentation?.displayFunctionSignature) {
      const viewFunctionAnnotation = viewFunction ? "\n*  #[view]" : "";
      funcSignatureLines.push(`/**\n${extraDocLine}${viewFunctionAnnotation}`);
      funcSignatureLines.push(
        `*  ${visibility === "public" ? visibility : ""}${viewFunction ? "" : " entry"}` +
          ` fun ${functionName}${leftCaret}${genericTypeTagsString}${rightCaret}(${
            functionArguments.length > 0 ? "" : `)${returnValueAsString}`
          }`,
      );
      signerArguments.forEach((signerArgument, i) => {
        funcSignatureLines.push(
          `*     ${signerArgumentNamesSnakeCase[i]}: ${signerArgument.annotation},`,
        );
      });
      functionArguments.forEach((functionArgument, i) => {
        funcSignatureLines.push(`*     ${fieldNames[i]}: ${functionArgument.annotation},`);
      });
      const endParenthesis = functionArguments.length > 0 ? `*  )${returnValueAsString}\n` : "";
      funcSignatureLines.push(`${endParenthesis}${extraDocLine}\n**/`);
    }
    const functionSignature = funcSignatureLines.join("\n");
    lines.push(functionSignature);

    const accountAddressInputString = toInputTypeString([new TypeTagAddress()]);
    const accountAddressClassString = toClassString(TypeTagEnum.AccountAddress);

    const returnTypes = returnValue.map((v) => {
      const typeTag = parseTypeTag(v, { allowGenerics: true });
      const flattenedTypeTag = toFlattenedTypeTag(typeTag);
      const inputType = toViewFunctionReturnTypeString(flattenedTypeTag);
      return inputType;
    });
    const viewFunctionReturnTypes = viewFunction
      ? `<[${returnTypes.map((v) => v).join(", ")}]>`
      : "";

    // ---------- Class fields ---------- //
    const entryOrView = viewFunction ? "View" : "Entry";
    const secondarySenders = signerArguments.slice(1).map((_s) => accountAddressClassString);
    const moduleAddressFieldValue = passInModuleAddress
      ? ": AccountAddress"
      : ` = ${MODULE_ADDRESS_VAR_NAME}`;
    const extendsString = `extends ${entryOrView}FunctionPayloadBuilder${viewFunctionReturnTypes}`;
    const classFields = `
    export class ${className} ${extendsString} {
      public readonly moduleAddress${moduleAddressFieldValue};
      public readonly moduleName = "${moduleName}";
      public readonly functionName = "${functionName}";
      public readonly args: ${functionArguments.length > 0 ? argsType : "{ }"};
      public readonly typeTags: ${explicitTypeTags}; ${genericTypeTagsStringAnnotation}\n${
        // Only add senders if it's an entry function.
        viewFunction
          ? ""
          : `public readonly ${PRIMARY_SENDER_VAR_NAME}: ${accountAddressClassString};
      public readonly ${SECONDARY_SENDERS_VAR_NAME}: [${secondarySenders.join(", ")}]${
        secondarySenders.length > 0 ? "" : " = []"
      };
      public readonly ${FEE_PAYER_VAR_NAME}?: ${accountAddressClassString};`
      }`;
    lines.push(classFields);
    lines.push("\n");

    // ----------------------- Constructor input types ----------------------- //
    // constructor fields
    const constructorModuleAddress = this.config.passInModuleAddress
      ? ["moduleAddress: AccountAddressInput,"]
      : [];
    const constructorSenders = new Array<string>();
    const constructorOtherArgs = new Array<string>();
    const noSignerArgEntryFunction = !viewFunction && signerArguments.length === 0;

    const noConstructorArgs =
      functionArguments.length + signerArguments.length + genericTypeTags.length === 0;
    const constructorArg = noConstructorArgs ? "" : `${CONSTRUCTOR_ARGS_VARIABLE_NAME}: {`;

    if (structArgs) {
      lines.push(`${viewFunction ? "" : "private"} constructor(${constructorArg}`);
    } else {
      lines.push(`${viewFunction ? "" : "private"} constructor(`);
    }
    if (this.config.passInModuleAddress) {
      lines.push(`moduleAddress: ${accountAddressInputString},`);
    }
    signerArguments.forEach((signerArgument, i) => {
      // signers are `AccountAddress` in the constructor signature because
      // we're just building the payload/generating the transaction here.
      constructorSenders.push(
        `${signerArgumentNames[i]}: ${accountAddressInputString}, // ${signerArgument.annotation}`,
      );
    });
    // If this is an entry function and the `signer` isn't included in the entry function args,
    // we still need to set the primarySender class field in the constructor.
    if (noSignerArgEntryFunction) {
      const constructorSendersComment =
        "// Not an entry function argument, but required to submit.";
      constructorSenders.push(
        `${PRIMARY_SENDER_VAR_NAME}: ${accountAddressInputString}, ${constructorSendersComment}`,
      );
    }
    functionArguments.forEach((functionArgument, i) => {
      const inputType = toInputTypeString(functionArgument.typeTagArray);
      // TODO: Fix option input types. It's just converting them to vectors right now, it should be
      // Option<T>, but the input type is skipping the Option part too early.
      const argComment = ` // ${functionArgument.annotation}`;
      constructorOtherArgs.push(`${casedFieldNames[i]}: ${inputType}, ${argComment}`);
    });
    if (genericTypeTagsString) {
      constructorOtherArgs.push(
        `typeTags: ${explicitTypeTagInputs}, ${genericTypeTagsStringAnnotation}`,
      );
    }
    if (!viewFunction) {
      constructorOtherArgs.push(
        `feePayer?: ${accountAddressInputString}, // Optional fee payer account to pay gas fees.`,
      );
    }
    lines.push(constructorSenders.join("\n"));
    lines.push(constructorOtherArgs.join("\n"));

    // End of the constructor arguments.
    if (structArgs) {
      const conditionalEndBrace = noConstructorArgs ? "" : "}";
      lines.push(`${conditionalEndBrace}) {`);
    } else {
      lines.push(") {");
    }

    // ----------------------- Assign constructor fields to class fields ----------------------- //
    lines.push("super();");
    if (structArgs) {
      const destructuredArgVarNames = [
        ...constructorModuleAddress,
        ...constructorSenders,
        ...constructorOtherArgs,
      ]
        .map((c) => c.split(":")[0].trim().replace("?", ""))
        .join(", ");
      // Destructured args.
      if (!noConstructorArgs) {
        lines.push(`const { ${destructuredArgVarNames} } = ${CONSTRUCTOR_ARGS_VARIABLE_NAME};`);
      }
    }
    const signerArgumentNamesAsClasses = signerArgumentNames.map(
      (signerArgumentName) => `AccountAddress.from(${signerArgumentName})`,
    );
    if (this.config.passInModuleAddress) {
      lines.push("this.moduleAddress = AccountAddress.from(moduleAddress);");
    }
    const primaryAsAccountAddress = signerArgumentNamesAsClasses[0];
    const primarySenderAssignment = `this.${PRIMARY_SENDER_VAR_NAME} = ${primaryAsAccountAddress};`;
    const secondarySenderAssignment =
      `this.${SECONDARY_SENDERS_VAR_NAME} = ` +
      `[${signerArgumentNamesAsClasses.slice(1).join(", ")}];`;

    if (noSignerArgEntryFunction) {
      lines.push(
        `this.${PRIMARY_SENDER_VAR_NAME} = AccountAddress.from(${PRIMARY_SENDER_VAR_NAME});`,
      );
    } else {
      lines.push(signerArguments.length >= 1 ? primarySenderAssignment : "");
      lines.push(signerArguments.length > 1 ? secondarySenderAssignment : "");
    }

    lines.push("this.args = {");
    functionArguments.forEach((_, i) => {
      const entryFunctionInputTypeConverter = transformEntryFunctionInputTypes(
        casedFieldNames[i],
        functionArguments[i].typeTagArray,
        0,
      );
      lines.push(`${casedFieldNames[i]}: ${entryFunctionInputTypeConverter},`);
    });
    // End of setting this.args = { ...args }.
    lines.push("}");
    if (genericTypeTagsString) {
      lines.push(
        "this.typeTags = typeTags.map(typeTag => typeof typeTag === 'string'" +
          ` ? parseTypeTag(typeTag) : typeTag) as ${explicitTypeTags};`,
      );
    }
    if (!viewFunction) {
      lines.push(
        `this.${FEE_PAYER_VAR_NAME} = (${FEE_PAYER_VAR_NAME} !== undefined)` +
          ` ? AccountAddress.from(${FEE_PAYER_VAR_NAME}) : undefined;`,
      );
    }
    // End of the constructor function.
    lines.push("}");

    if (!viewFunction) {
      lines.push(
        this.createPayloadBuilder(
          signerArguments,
          signerArgumentNames,
          functionArguments,
          casedFieldNames,
          accountAddressInputString,
          genericTypeTags,
          noSignerArgEntryFunction,
          explicitTypeTagInputs,
          genericTypeTagsStringAnnotation,
        ),
      );

      lines.push(
        this.createTransactionBuilder(
          className,
          signerArguments,
          signerArgumentNames,
          functionArguments,
          casedFieldNames,
          genericTypeTags,
          noSignerArgEntryFunction,
          explicitTypeTagInputs,
          genericTypeTagsStringAnnotation,
        ),
      );
    }
    lines.push("\n } \n");
    return lines.join("\n");
  }

  // TODO: Clean this up.
  // Right now this is non-maintainable and very messy.
  // Eventually we should create an abstract implementation of build and builderWithFeePayer
  // with the base functionality and then find a way to make `build` and `builderWithFeePayer`
  // implementations in the subclasses by packing the signerArgumentNames into the primarySender
  // and secondarySenders args that would be in the abstract implementation.
  // This would achieve a more modular and maintainable approach with less repeated code everywhere.
  createPayloadBuilder(
    inputSignerArguments: Array<AnnotatedBCSArgument>,
    signerArgumentNames: Array<string>,
    functionArguments: Array<AnnotatedBCSArgument>,
    casedFieldNames: Array<string>,
    accountAddressInputString: string,
    // Parsed generic names if they're available, we only use them for counting.
    genericTypeTags: Array<string>,
    noSignerArgEntryFunction: boolean,
    explicitTypeTagInputs: string,
    genericTypeTagAnnotation: string,
  ) {
    const signerArguments = Array.from(inputSignerArguments);

    // If there's no signer args in the entry function, we need to add the primary sender to the
    // constructor because a payload needs a sender, even if it's not used in the entry function.
    if (noSignerArgEntryFunction) {
      signerArguments.push({
        typeTagArray: [new TypeTagAddress()],
        classString: toClassString(TypeTagEnum.AccountAddress),
        annotation: "sender for the payload, not used in the entry function as an argument",
      });
      signerArgumentNames.push(PRIMARY_SENDER_VAR_NAME);
    }
    const constructorSenders = new Array<string>();
    const constructorOtherArgs = new Array<string>();
    signerArguments.forEach((signerArgument, i) => {
      constructorSenders.push(
        `${signerArgumentNames[i]}: ${accountAddressInputString}, // ${signerArgument.annotation}`,
      );
    });
    functionArguments.forEach((functionArgument, i) => {
      const inputType = toInputTypeString(functionArgument.typeTagArray);
      const argComment = ` // ${functionArgument.annotation}`;
      constructorOtherArgs.push(`${casedFieldNames[i]}: ${inputType}, ${argComment}`);
    });
    constructorOtherArgs.push(
      `feePayer?: ${accountAddressInputString}, ` +
        "// optional fee payer account to sponsor the transaction",
    );

    const withSecondarySenders = signerArguments.length > 1;
    const conditionalCommaAndNewLine = constructorSenders.length > 0 ? ",\n" : "";
    const conditionalCommaAndNewLineOtherArgs =
      constructorOtherArgs.slice(0, -1).length > 0 ? ",\n" : "";
    const withTypeTags = genericTypeTags.length > 0;

    const returnType = EntryFunctionTransactionBuilder.name;
    const builderFunctionArgs = `${
      this.config.passInModuleAddress ? "moduleAddress: AccountAddressInput,\n" : ""
    }aptosConfig: AptosConfig,\n${constructorSenders.join("\n")}\n${
      constructorOtherArgs.slice(0, -1).join("\n") +
      (constructorOtherArgs.slice(0, -1).length > 0 ? "\n" : "")
    }${
      withTypeTags ? `typeTags: ${explicitTypeTagInputs}, ${genericTypeTagAnnotation},\n` : ""
    }feePayer?: ${accountAddressInputString},\n options?: InputGenerateTransactionOptions,\n`;

    let builderFunctionSignature: string;
    let payloadBuilderConstructorArgs: string;
    let destructuredArgs: string;
    if (this.config.structArgs) {
      builderFunctionSignature = `${CONSTRUCTOR_ARGS_VARIABLE_NAME}: { ${builderFunctionArgs} }`;
      payloadBuilderConstructorArgs = `${CONSTRUCTOR_ARGS_VARIABLE_NAME}`;
      const destructureConfigOptionsAndFeePayer = "const { aptosConfig, options, feePayer } = ";
      destructuredArgs = `${destructureConfigOptionsAndFeePayer}${CONSTRUCTOR_ARGS_VARIABLE_NAME};`;
    } else {
      builderFunctionSignature = builderFunctionArgs;

      payloadBuilderConstructorArgs = `${
        (this.config.passInModuleAddress ? "moduleAddress,\n" : "") +
        constructorSenders.map((s) => s.split(":")[0]).join(",\n") +
        conditionalCommaAndNewLine +
        constructorOtherArgs
          .slice(0, -1)
          .map((s) => s.split(":")[0])
          .join(",\n") +
        conditionalCommaAndNewLineOtherArgs +
        (withTypeTags ? "typeTags,\n" : "")
      }feePayer ? feePayer : undefined,\n`;
      destructuredArgs = "";
    }

    const staticBuild =
      "static async builder(\n" +
      `${builderFunctionSignature}\n` +
      `): Promise<${returnType}> {\n` +
      `${destructuredArgs}\n` +
      `const payloadBuilder = new this(${payloadBuilderConstructorArgs});\n` +
      `const rawTransactionInput = (await buildTransaction({
        aptosConfig,
        sender: payloadBuilder.${PRIMARY_SENDER_VAR_NAME},\n${
          // "feePayerAddress: feePayer ?? AccountAddress.ZERO,\n" +
          withSecondarySenders ? "secondarySignerAddresses: payloadBuilder.secondarySenders,\n" : ""
        }payload: payloadBuilder.createPayload(),
          options,
          feePayerAddress: feePayer,
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
    inputSignerArguments: Array<AnnotatedBCSArgument>,
    signerArgumentNames: Array<string>,
    functionArguments: Array<AnnotatedBCSArgument>,
    casedFieldNames: Array<string>,
    // Parsed generic names if they're available, we only use them for counting.
    genericTypeTags: Array<string>,
    noSignerArgEntryFunction: boolean,
    explicitTypeTagInputs: string,
    genericTypeTagAnnotation: string,
  ) {
    const signerInputString = toInputTypeString([new TypeTagSigner()]);
    const signerArguments = Array.from(inputSignerArguments);

    // If there's no signer args in the entry function, we need to add the primary sender to the
    // constructor, because a payload needs a sender, even if it's not used in the entry function.
    if (noSignerArgEntryFunction) {
      signerArguments.push({
        typeTagArray: [new TypeTagAddress()],
        classString: toClassString(TypeTagEnum.Signer),
        annotation: "sender for the payload, not used in the entry function as an argument",
      });
      signerArgumentNames.push(PRIMARY_SENDER_VAR_NAME);
    }
    const constructorSenders = new Array<string>();
    const constructorOtherArgs = new Array<string>();
    signerArguments.forEach((signerArgument, i) => {
      constructorSenders.push(
        `${signerArgumentNames[i]}: ${signerInputString}, // ${signerArgument.annotation}`,
      );
    });
    functionArguments.forEach((functionArgument, i) => {
      const inputType = toInputTypeString(functionArgument.typeTagArray);
      const argComment = ` // ${functionArgument.annotation}`;
      constructorOtherArgs.push(`${casedFieldNames[i]}: ${inputType}, ${argComment}`);
    });
    constructorOtherArgs.push(
      `feePayer?: ${signerInputString}, // optional fee payer account to sponsor the transaction`,
    );

    const withSecondarySenders = signerArguments.length > 1;
    const withTypeTags = genericTypeTags.length > 0;

    const conditionalCommaAndNewLine = constructorSenders.length > 0 ? ",\n" : "";
    const conditionalCommaAndNewLineOtherArgs =
      constructorOtherArgs.slice(0, -1).length > 0 ? ",\n" : "";

    const submitFunctionArgs =
      `${
        this.config.passInModuleAddress ? "moduleAddress: AccountAddressInput,\n" : ""
      }aptosConfig: AptosConfig,\n${constructorSenders.join("\n")}\n${
        constructorOtherArgs.slice(0, -1).join("\n") +
        (constructorOtherArgs.slice(0, -1).length > 0 ? "\n" : "")
      }${
        withTypeTags ? `typeTags: ${explicitTypeTagInputs}, ${genericTypeTagAnnotation}\n` : ""
      }feePayer?: Account,\n` +
      "options?: InputGenerateTransactionOptions,\n" +
      "waitForTransactionOptions?: WaitForTransactionOptions,\n";

    let submitFunctionSignature: string;
    let submitConstructorArgs: string;
    const primarySender = constructorSenders[0].split(":")[0];
    const secondarySenders = constructorSenders.slice(1).map((s) => s.split(":")[0]);
    let destructuredArgs: string;
    if (this.config.structArgs) {
      submitFunctionSignature = `${CONSTRUCTOR_ARGS_VARIABLE_NAME}: { ${submitFunctionArgs} }`;
      submitConstructorArgs =
        "{" +
        `...${CONSTRUCTOR_ARGS_VARIABLE_NAME},\n` +
        "feePayer: feePayer ? feePayer.accountAddress : undefined,\n" +
        `${primarySender}: primarySigner.accountAddress,\n${secondarySenders.map(
          (s) => `${s}: ${s}.accountAddress`,
        )}}\n`;
      destructuredArgs = `const {
        ${primarySender}: primarySigner,
        waitForTransactionOptions,
        feePayer,
        ${secondarySenders.join(", ")}
      } = ${CONSTRUCTOR_ARGS_VARIABLE_NAME};\n`;
    } else {
      submitFunctionSignature = `\n${submitFunctionArgs}\n`;
      submitConstructorArgs =
        "" +
        `${this.config.passInModuleAddress ? "moduleAddress,\n" : ""}aptosConfig,\n
        ${constructorSenders
          .map((s) => `${s.split(":")[0]}.accountAddress`)
          .join(",\n")}${conditionalCommaAndNewLine}${constructorOtherArgs
          .map((s) => s.split(":")[0])
          .slice(0, -1)
          .join(",\n")}${conditionalCommaAndNewLineOtherArgs}${
          withTypeTags ? "typeTags,\n" : ""
        }feePayer ? feePayer.accountAddress : undefined,\n options,\n`;
      destructuredArgs = `const primarySigner = ${primarySender};\n`;
    }

    const transactionBuilderFunctionSignature =
      "static async submit(\n" +
      `${submitFunctionSignature}` +
      `): Promise<UserTransactionResponse> {\n${destructuredArgs}`;

    const transactionBuilderInstantiationString =
      `const transactionBuilder = await ${className}.builder(\n` +
      `${submitConstructorArgs}\n` +
      ");";
    const transactionBuilderHelperString =
      "" +
      `${transactionBuilderFunctionSignature}\n` +
      `${transactionBuilderInstantiationString}\n` +
      "const response = await transactionBuilder.submit({\n" +
      `primarySigner,\n${
        withSecondarySenders
          ? `${this.config.structArgs ? "secondarySigners: " : ""}[${constructorSenders
              .slice(1)
              .map((s) => s.split(":")[0])
              .join(", ")}],\n`
          : ""
      }feePayer,\n` +
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
    typeTags.forEach((typeTag) => {
      const flattenedTypeTag = toFlattenedTypeTag(typeTag);
      const annotation = this.config.expandedStructs
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
        // Non-signer entry function argument, so we'll add it to the functionArguments array.
      } else {
        // Check if the TypeTag is actually an Object type.
        // Object<T> must have at least 2 typetags, so if the length is 1, it's not an Object.
        if (flattenedTypeTag.length > 1) {
          const secondToLast = flattenedTypeTag[flattenedTypeTag.length - 2];
          if (flattenedTypeTag[flattenedTypeTag.length - 1].isGeneric()) {
            const genericType = `T${genericsWithAbilities.length}`;
            const moveConstraints = genericTypeParams[genericsWithAbilities.length]?.constraints;
            const constraints = moveConstraints?.join(" + ");
            // 2, because that's the length of ": ". We don't add it if there are no constraints
            const genericTypeWithConstraints =
              constraints?.length > 2 ? `${genericType}${constraints}` : genericType;
            // Check if the second to last type tag is an AccountAddress.
            // It will always be an Object type.
            if (secondToLast.isStruct() && secondToLast.isObject()) {
              genericsWithAbilities.push(genericTypeWithConstraints);
              flattenedTypeTag.pop();
            } else {
              genericsWithAbilities.push(genericTypeWithConstraints);
            }
          } else if (secondToLast.isStruct() && secondToLast.isObject()) {
            // It's an Object<T> where T is not generic: e.g. an Object<Token>.
            // We'll remove the second to last type since it's an Object.
            flattenedTypeTag.pop();
          }
        }

        let typeTagWarning;
        try {
          typeTagWarning = toClassesString(flattenedTypeTag);
        } catch (e) {
          flattenedTypeTag.forEach((t) => console.log(t.toString()));
          console.log(typeTagWarning);
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

  // TODO: Add ability to ignore source code if it's incorrect..?
  async fetchABIs(
    aptos: Aptos,
    accountAddress: AccountAddress,
    sourceCodePath?: string,
  ): Promise<ABIGeneratedCodeMap> {
    const moduleABIs = await fetchModuleABIs(aptos, accountAddress);
    if (moduleABIs.length === 0) {
      console.warn(`No ABIs found for ${accountAddress.toString()}.`);
      return {};
    }
    const sourceCodeMap = await getSourceCodeMap(
      accountAddress,
      aptos.config.network,
      sourceCodePath,
    );

    const abiFunctions: AbiFunctions[] = [];
    const generatedCode: ABIGeneratedCodeMap = {};

    await Promise.all(
      moduleABIs.filter(isAbiDefined).map(async (module) => {
        const { abi } = module;
        const exposedFunctions = abi.exposed_functions;
        const sourceCode = sourceCodeMap[abi.name];

        const publicEntryFunctions = exposedFunctions.filter(
          (func) => func.is_entry && func.visibility !== "private",
        );
        const privateEntryFunctions = exposedFunctions.filter(
          (func) => func.is_entry && func.visibility === "private",
        );
        const viewFunctions = exposedFunctions.filter((func) => func.is_view);

        const publicMapping = getArgNameMapping(abi, publicEntryFunctions, sourceCode);
        const privateMapping = getArgNameMapping(abi, privateEntryFunctions, sourceCode);
        const viewMapping = getArgNameMapping(abi, viewFunctions, sourceCode);

        const abiFunction = {
          moduleAddress: AccountAddress.from(abi.address),
          moduleName: abi.name,
          publicEntryFunctions: getMoveFunctionsWithArgumentNames(
            abi,
            publicEntryFunctions,
            publicMapping,
          ),
          privateEntryFunctions: getMoveFunctionsWithArgumentNames(
            abi,
            privateEntryFunctions,
            privateMapping,
          ),
          viewFunctions: getMoveFunctionsWithArgumentNames(abi, viewFunctions, viewMapping),
        };

        abiFunctions.push(abiFunction);

        const functionsWithAnyVisibility = [
          abiFunction.publicEntryFunctions,
          abiFunction.privateEntryFunctions,
          abiFunction.viewFunctions,
        ];

        const codeForFunctionsWithAnyVisibility: Array<Array<string | undefined>> = [[], [], []];
        functionsWithAnyVisibility.forEach((functions, i) => {
          if (functions.length > 0) {
            codeForFunctionsWithAnyVisibility[i].push(
              ...functions.map((f) => {
                try {
                  const func = f;
                  func.params = func.params.map((param) => {
                    if (param.startsWith("&mut ")) {
                      console.warn(
                        `${lightRed("Removing")} deprecated &mut in typetag ${lightMagenta(
                          param,
                        )} in function ${lightGray(func.name)}`,
                      );
                      return param.replace("&mut ", "");
                    }
                    return param;
                  });
                  const typeTags = func.params.map((param) =>
                    parseTypeTag(param, { allowGenerics: true }),
                  );
                  if (
                    typeTags.find(
                      (typeTag) =>
                        typeTag.isStruct() &&
                        !typeTag.isObject() &&
                        !typeTag.isString() &&
                        !typeTag.isOption(),
                    )
                  ) {
                    console.warn(
                      `${lightRed("Ignoring")} function ${lightGray(
                        func.name,
                      )} because it has a deprecated struct type tag`,
                    );
                    return "";
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
                    suppliedFieldNames: func.argNames.length === 0 ? undefined : func.argNames,
                    visibility: func.visibility as "public" | "private",
                    genericTypeParams: func.generic_type_params,
                    documentation: {
                      fullStructNames: false,
                      displayFunctionSignature: true,
                    },
                    structArgs: this.config.structArgs,
                    passInModuleAddress: this.config.passInModuleAddress,
                  });
                  return generatedClassesCode;
                } catch (e) {
                  if (f.params.find((param) => param.startsWith("&0x"))) {
                    console.warn(
                      `${lightRed("Ignoring")} function ${lightGray(
                        f.name,
                      )} because it has a deprecated parameter ${lightMagenta(
                        f.params.find((param) => param.startsWith("&0x"))!,
                      )}`,
                    );
                  } else {
                    console.error(e);
                  }
                  return "";
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

        let entryFuncsCode = `\n${publicFunctionsCodeString}${privateFunctionsCodeString}`;
        let viewFuncsCode = `\n${viewFunctionsCodeString}`;
        if (this.config.separateViewAndEntryFunctionsByNamespace) {
          const entryFuncsNamespace = this.config.entryFunctionsNamespace;
          entryFuncsCode = `export namespace ${entryFuncsNamespace} { ${entryFuncsCode} }`;
          const viewFuncsNamespace = this.config.viewFunctionsNamespace;
          viewFuncsCode = `export namespace ${viewFuncsNamespace} { ${viewFuncsCode} }`;
        }

        if (numPublicFunctions + numPrivateFunctions + numViewFunctions > 0) {
          let code = "";
          code += numPublicFunctions + numPrivateFunctions > 0 ? entryFuncsCode : "";
          code += numViewFunctions > 0 ? viewFuncsCode : "";
          generatedCode[abi.name] = {
            address: abi.address,
            name: abi.name,
            code,
          };
        }
      }),
    );

    return generatedCode;
  }

  async generateCodeForModules(
    aptos: Aptos,
    moduleAddressesAndSourceCodePath: Array<AccountAddress>,
  ): Promise<void> {
    const baseDirectory = this.config.outputPath ?? ".";
    if (!fs.existsSync(baseDirectory)) {
      fs.mkdirSync(baseDirectory);
    }
    const generatedIndexFile: Array<string> = [];
    await Promise.all(
      moduleAddressesAndSourceCodePath.map(async (address: AccountAddress) => {
        const addressInSourcePath = address.toString() in this.config.sourceCodePath;
        const sourceCodePath = addressInSourcePath
          ? this.config.sourceCodePath[address.toString()]
          : undefined;
        const generatedCode = await this.fetchABIs(aptos, address, sourceCodePath);
        const namedAddresses = this.config.namedAddresses ?? {};
        const addressString = address.toString();
        const namedAddress =
          addressString in namedAddresses ? namedAddresses[addressString] : addressString;

        const numTotalModules = Object.entries(generatedCode).length;
        const entryClassName = EntryFunctionPayloadBuilder.name;
        const viewClassName = ViewFunctionPayloadBuilder.name;
        let numEntryFunctions = 0;
        let numViewFunctions = 0;
        Object.entries(generatedCode).forEach(([_moduleName, moduleCode]) => {
          numEntryFunctions += (
            moduleCode.code.match(new RegExp(`extends ${entryClassName}`, "g")) || []
          ).length;
          numViewFunctions += (
            moduleCode.code.match(new RegExp(`extends ${viewClassName}`, "g")) || []
          ).length;
        });
        // print out how many modules we found
        console.log(
          `${lightGreen("[SUCCESS]:")} Generated code for ` +
            `${lightBlue(numEntryFunctions)} entry functions and ` +
            `${lightBlue(numViewFunctions)} view functions`,
          `over ${lightBlue(numTotalModules)} modules for ${lightGray(namedAddress)}`,
        );

        this.writeGeneratedCodeToFiles(namedAddress, baseDirectory, generatedCode);
        const fileNamedAddress = namedAddress.startsWith("0x")
          ? truncateAddressForFileName(address)
          : toPascalCase(namedAddress);
        const filePath = `${baseDirectory}/index.ts`;
        // Read from `index.ts` and check if the namedAddress is already in the file
        // If it is, don't add it again.
        const newExport = `export * as ${fileNamedAddress} from "./${namedAddress}/index";\n`;
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
    // Copy boilerplate files like the payload builder and types.ts
    copyCode(
      `./src/${FOR_GENERATION_DIRECTORY}/${PAYLOAD_BUILDERS_FILE_NAME}.ts`,
      `${baseDirectory}${PAYLOAD_BUILDERS_FILE_NAME}.ts`,
      this.config.sdkPath,
    );
    copyCode(
      `./src/${FOR_GENERATION_DIRECTORY}/${ABI_TYPES_FILE_NAME}.ts`,
      `${baseDirectory}${ABI_TYPES_FILE_NAME}.ts`,
      this.config.sdkPath,
    );
  }

  writeGeneratedCodeToFiles(
    namedAddress: string,
    baseDirectory: string,
    codeMap: ABIGeneratedCodeMap,
    skipEmptyModules = true,
  ) {
    const perAddressIndexFile: Array<string> = [];

    Object.keys(codeMap).forEach(async (moduleName, i) => {
      if (skipEmptyModules && (!codeMap[moduleName] || codeMap[moduleName].code.length === 0)) {
        console.debug(`Skipping empty module ${module}`);
        return;
      }

      const { address, name, code } = codeMap[moduleName];
      const directory = `${baseDirectory}/${namedAddress}`;
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory);
      }
      const fileName = `${name}.ts`;
      const filePath = `${directory}/${fileName}`;
      const contents = `${getBoilerplateImports(this.config.sdkPath)}\n\n${code}`;

      // Write the MODULE_ADDRESS_FIELD_NAME to the  `consts.ts` file.
      const constsPath = path.join(directory, "consts.ts");
      fs.mkdirSync(path.dirname(constsPath), { recursive: true });
      fs.writeFileSync(
        constsPath,
        "import { AccountAddress } from \"@aptos-labs/ts-sdk\";\n" +
          `export const ${MODULE_ADDRESS_VAR_NAME} = AccountAddress.from("${address}");\n`,
      );

      const prettyAndLintedCode = await lintAndFormat({
        code: contents,
        configPath: path.join(baseDirectory, ".eslintrc"),
        fakeFilePath: path.join(baseDirectory, ".blueprint-tmp", "code.ts"),
      });

      perAddressIndexFile.push(`export * as ${toPascalCase(name)} from "./${name}";`);
      if (i === Object.keys(codeMap).length - 1) {
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
      fs.writeFileSync(filePath, prettyAndLintedCode);
    });
  }
}
