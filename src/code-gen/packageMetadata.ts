/* eslint-disable no-console */
import {
  Aptos,
  AptosConfig,
  type AccountAddress,
  type MoveFunction,
  type MoveModule,
  type Network,
} from "@aptos-labs/ts-sdk";
import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import {
  type PackageMetadata,
  type ModuleMetadata,
  type ArgumentNamesWithTypes,
  type ModuleFunctionArgNameMap,
  type MoveFunctionWithArgumentNamesAndGenericTypes,
} from "../types";
import { transformCode } from "../utils";

// sort the abiFunctions by moduleName alphabetically
export const sortByNameField = (objs: any[]): any[] => {
  objs.sort((a, b) => {
    if (a.name < b.name) {
      return -1;
    }
    return a.name > b.name ? 1 : 0;
  });
  return objs;
};

export async function getPackageMetadata(
  accountAddress: AccountAddress,
  network: Network,
): Promise<PackageMetadata[]> {
  const aptos = new Aptos(new AptosConfig({ network }));
  const packageMetadata = await aptos.getAccountResource<PackageMetadata[]>({
    accountAddress: accountAddress.toString(),
    resourceType: "0x1::code::PackageRegistry",
  });
  const registryData = packageMetadata as {
    packages?: PackageMetadata[];
  };

  const packages: PackageMetadata[] =
    registryData?.packages?.map((pkg): PackageMetadata => {
      const sortedModules = sortByNameField(pkg.modules);
      return { name: pkg.name, modules: sortedModules };
    }) || [];

  return packages;
}

export async function getSourceCodeMap(
  accountAddress: AccountAddress,
  network: Network,
  sourceCodePath?: string,
): Promise<Record<string, string>> {
  const packageMetadata = await getPackageMetadata(accountAddress, network);

  const sourceCodeByModuleName: Record<string, string> = {};

  const sourcePathExists =
    sourceCodePath !== "" &&
    typeof sourceCodePath !== "undefined" &&
    existsSync(sourceCodePath) &&
    statSync(sourceCodePath).isDirectory();

  packageMetadata.forEach((pkg) =>
    pkg.modules.forEach((module: ModuleMetadata) => {
      let filePath: string | undefined;
      let code: string;
      if (sourcePathExists) {
        try {
          filePath = path.join(sourceCodePath, `${module.name}.move`);
          code = readFileSync(filePath, "ascii");
        } catch (e) {
          console.warn(
            "Failed to read the source code for module",
            `\`${module.name}\` from ${filePath ?? sourceCodePath}.`,
          );
          console.warn("Attempting to parse source code from the package metadata instead.");
          code = transformCode(module.source);
        }
      } else {
        code = transformCode(module.source);
      }
      sourceCodeByModuleName[module.name] = code;
    }),
  );

  return sourceCodeByModuleName;
}

export type FunctionSignatureWithTypeTags = {
  genericTypeTags: string | null;
  functionSignature: string | null;
};

export function removeComments(code: string): string {
  // Remove single-line comments (anything from '//' to the end of the line)
  const noSingleLineComments = code.replace(/\/\/.*$/gm, "");

  // Remove multi-line comments (anything between '/*' and '*/')
  const noComments = noSingleLineComments.replace(/\/\*[\s\S]*?\*\//gm, "");

  return noComments;
}

export function extractSignature(
  functionName: string,
  inputSourceCode: string,
): FunctionSignatureWithTypeTags {
  const sourceCode = removeComments(inputSourceCode);
  // find the function signature in the source code
  const regex = new RegExp(`fun ${functionName}(<.*>)?\\s*\\(([^)]*)\\)`, "m");
  const match = sourceCode.match(regex);
  let genericTypeTags: string | null = null;
  if (match) {
    genericTypeTags = match[1] ? match[1].slice(1, -1) : null;
  }
  return {
    genericTypeTags,
    functionSignature: match ? match[2].trim() : null,
  };
}

export function extractArguments(functionSignature: string): ArgumentNamesWithTypes[] {
  const args = functionSignature.split(",");
  const argumentsList = args
    .map((a) => {
      const [argName, typeTag] = a.split(":").map((b) => b.trim());
      if (argName && typeTag) {
        return { argName, typeTag };
      }
      return null;
    })
    .filter(
      (c) => c !== null && !(c.argName.includes("//") || c.typeTag.includes("//")),
    ) as ArgumentNamesWithTypes[];

  return argumentsList;
}

export function getArgNameMapping(
  abi: MoveModule,
  funcs: MoveFunction[],
  sourceCode: string,
): ModuleFunctionArgNameMap {
  const modulesWithFunctionSignatures: ModuleFunctionArgNameMap = {};

  funcs.forEach((func) => {
    const { genericTypeTags, functionSignature } = extractSignature(func.name, sourceCode);
    if (functionSignature === null) {
      throw new Error(`Could not find function signature for ${func.name}`);
    } else {
      const args = extractArguments(functionSignature);
      if (!modulesWithFunctionSignatures[abi.name]) {
        modulesWithFunctionSignatures[abi.name] = {};
      }
      modulesWithFunctionSignatures[abi.name][func.name] = {
        genericTypes: genericTypeTags,
        argumentNamesWithTypes: args,
      };
    }
  });

  return modulesWithFunctionSignatures;
}

export function getMoveFunctionsWithArgumentNames(
  abi: MoveModule,
  funcs: MoveFunction[],
  mapping: ModuleFunctionArgNameMap,
): Array<MoveFunctionWithArgumentNamesAndGenericTypes> {
  return funcs.map((func) => {
    let argNames = new Array<string>();
    let genericTypes: string | null = null;
    if (abi.name in mapping && func.name in mapping[abi.name]) {
      genericTypes = mapping[abi.name][func.name].genericTypes;
      argNames = mapping[abi.name][func.name].argumentNamesWithTypes.map(
        (arg: ArgumentNamesWithTypes) => arg.argName,
      );
    } else {
      genericTypes = null;
      argNames = [];
    }
    return { ...func, genericTypes, argNames };
  });
}
