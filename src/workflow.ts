/* eslint-disable no-console */
import { red } from "kolorist";
import prompts from "prompts";
import { Network, AccountAddress, Hex } from "@aptos-labs/ts-sdk";
import fs from "fs";
import { getCodeGenConfig } from "./code-gen/config.js";

const DEFAULT_ADDRESSES_FOR_INPUT = "0x1, 0x3, 0x4, 0x5";

export type Selections = {
  configPath: string;
  namedModules: Array<AccountAddress>;
  additionalModules: Array<AccountAddress>;
  network: Network;
};

export function validateAndSetConfigPath(configPath: string) {
  if (configPath === "") {
    return true;
  }
  const exists = fs.existsSync(configPath);
  const isYaml = configPath.endsWith(".yaml");
  if (exists && isYaml) {
    return true;
  }
  const doesntExistMessage = exists ? "" : "File does not exist. ";
  const isYamlMessage = isYaml
    ? ""
    : `${doesntExistMessage.length > 0 ? "and " : ""}${configPath} is not a yaml file. `;
  return `Please enter a valid config.yaml file path. ${doesntExistMessage} ${isYamlMessage}`;
}

export function validateAddresses(value: string) {
  if (value === "" || value === DEFAULT_ADDRESSES_FOR_INPUT) {
    return true;
  }
  const addresses = value.split(",").map((address) => address.trim());
  const valid = addresses.every((address) => {
    try {
      return !!(AccountAddress.from(address) || Hex.fromHexString(address));
    } catch (err) {
      console.warn(`Error parsing address: ${address}`);
      console.warn(`Please enter addresses in this format: ${DEFAULT_ADDRESSES_FOR_INPUT}`);
      return false;
    }
  });
  if (valid) {
    return true;
  }
  return "Please enter a valid comma separated list of addresses";
}

export function validateNetwork(value: string) {
  const valid = Object.values(Network).includes(value as Network);
  if (valid) {
    return true;
  }
  return "Please enter a valid network";
}

export function generateChoices(configPath: string) {
  const { namedAddresses } = getCodeGenConfig(configPath);
  const choices = Object.entries(namedAddresses).map(([address, name]) => {
    const value = AccountAddress.from(address);
    return {
      title: name as string,
      value,
      description: value.toString(),
    };
  });
  return choices;
}

export const additionalNamesDict: Record<string, string> = {};

export function updateAdditionalNameDict(k: string, v: AccountAddress) {
  additionalNamesDict[k] = v.toString();
}

export async function userInputs() {
  let result: prompts.Answers<"configPath" | "namedModules" | "additionalModules" | "network">;

  try {
    result = await prompts(
      [
        {
          type: "text",
          name: "configPath",
          message: "config.yaml path (leave empty for defaults):",
          initial: "config.yaml",
          validate: (value: string) => validateAndSetConfigPath(value),
          hint: "asdf",
        },
        {
          type: "multiselect",
          name: "namedModules",
          message: "Addresses from config.yaml",
          choices: (prev) => generateChoices(prev),
        },
        {
          type: "text",
          name: "additionalModules",
          message: "What additional modules would you like to generate code for?",
          initial: DEFAULT_ADDRESSES_FOR_INPUT,
          separator: ",",
          hint: "- Comma separated list. Press enter to submit",
          validate: (value) => validateAddresses(value),
        },
        {
          type: "text",
          name: "network",
          message: "What network do you want to get the module ABIs from?",
          initial: "devnet",
          validate: (value: string) => validateNetwork(value),
        },
      ],
      {
        onCancel: () => {
          throw new Error(`${red("✖")} Operation cancelled`);
        },
        onSubmit: (_prompt, _answer, _answers) => {
          // if (prompt.name === "namedModules") {
          //   console.log(answer);
          //   console.log(answers);
          // }
        },
      },
    );
  } catch (err: any) {
    console.log(err.message);
    process.exit(0);
  }

  const { configPath, namedModules, additionalModules, network } = result;

  return {
    configPath,
    namedModules,
    additionalModules: additionalModules === DEFAULT_ADDRESSES_FOR_INPUT ? [] : additionalModules,
    network,
  } as Selections;
}
