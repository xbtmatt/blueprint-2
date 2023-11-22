#!/usr/bin/env node

import { lightBlue, lightCyan, lightGreen, lightMagenta, lightRed, lightYellow } from "kolorist";
import { CodeGenerator, getCodeGenConfig } from "./src/index.js";
import { Aptos, AptosConfig, Network, AccountAddress } from "@aptos-labs/ts-sdk";
import { Selections, userInputs } from "./src/workflow.js";


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
console.log("Welcome to the Aptos Blueprint wizard 🔮");

async function main() {
                                                       
                                                       
                                                       
                         
    // const mainnet = new Aptos(new AptosConfig({ network: Network.MAINNET }));
    // const addresses = [
    //     AccountAddress.ONE,
    //     AccountAddress.THREE,
    //     AccountAddress.FOUR,
    //     // AccountAddress.fromRelaxed("0xabcde341afbc4d846a4453bf042dffe74a137c0f0b50c548a87f726f4b1d62ed"),
    //     // AccountAddress.fromRelaxed("0x2cca48b8b0d7f77ef28bfd608883c599680c5b8db8192c5e3baaae1aee45114c"),
    //     AccountAddress.fromRelaxed("0x7e783b349d3e89cf5931af376ebeadbfab855b3fa239b7ada8f5a92fbea6b387"),
    //     AccountAddress.fromRelaxed("0x7d7e436f0b2aafde60774efb26ccc432cf881b677aca7faaf2a01879bd19fb8"),
    // ];



    // const selections = await userInputs();
    const selections: Selections = {
        configPath: "./config.yaml",
        namedModules: [

        ],
        additionalModules: [
            // AccountAddress.ONE,
            // AccountAddress.THREE,
            // AccountAddress.FOUR,
            // AccountAddress.fromRelaxed("0xabcde341afbc4d846a4453bf042dffe74a137c0f0b50c548a87f726f4b1d62ed"), // monsters
            AccountAddress.fromRelaxed("0x2cca48b8b0d7f77ef28bfd608883c599680c5b8db8192c5e3baaae1aee45114c"), // tx args module
            // AccountAddress.fromRelaxed("0x7e783b349d3e89cf5931af376ebeadbfab855b3fa239b7ada8f5a92fbea6b387"), // pyth
            // AccountAddress.fromRelaxed("0x7d7e436f0b2aafde60774efb26ccc432cf881b677aca7faaf2a01879bd19fb8"), // switchboard
        ],
        // frameworkModules: [],
        network: Network.LOCAL,
    }
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
