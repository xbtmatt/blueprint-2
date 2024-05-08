#!/usr/bin/env node
/* eslint-disable no-console */
import { lightBlue } from "kolorist";
import { CodeGenerator, getCodeGenConfig } from "./src/index.js";
import { Aptos, AptosConfig, AccountAddress } from "@aptos-labs/ts-sdk";
import { userInputs } from "./src/workflow.js";
import prompts from "prompts";


const headerText = `
 _      _                            _         _   
| |__  | | _   _   ___  _ __   _ __ (_) _ __  | |_ 
| '_ \\ | || | | | / _ \\| '_ \\ | '__|| || '_ \\ | __|
| |_) || || |_| ||  __/| |_) || |   | || | | || |_ 
|_.__/ |_| \\__,_| \\___|| .__/ |_|   |_||_| |_| \\__|
                       |_|                          
`.split('\n').map((line) =>
    [...line].map((char, i) => {
        if (i < 23 && !char.match(/\s/)) {
            return lightBlue(char);
        }
        return char;
    }).join("")
).join("\n");

console.log(headerText);
console.log();
console.log("💻 Welcome to the Aptos Blueprint wizard 🔮");

async function main() {

    prompts.inject([
        "config.yaml",
        [
            AccountAddress.ONE,
            AccountAddress.THREE,
            AccountAddress.FOUR,
            AccountAddress.from("0xa2775749a727b0c71adeb8c45dac5c59b1c370f97fba70a5f3e789a96a76d5b0"),
            AccountAddress.from("0x4cba8c2b7f78052a6d5d67999620fecc77ea3d691d07f2c787151f9864b0b6a8"),
        ],
        "",
        "local"
    ]);
    const selections = await userInputs();
    const codeGeneratorConfig = getCodeGenConfig(selections.configPath);
    const codeGenerator = new CodeGenerator(codeGeneratorConfig);
    const aptosConfig = new AptosConfig({ network: selections.network });
    const aptos = new Aptos(aptosConfig);
    await codeGenerator.generateCodeForModules(
        aptos,
        [...selections.namedModules, ...selections.additionalModules],
    );
}

main().catch((e) => {
    console.error(e);
});
